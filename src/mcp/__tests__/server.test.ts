import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Mock ONLY the external network boundary (global.fetch). @octokit/rest's
// default request adapter uses fetch under the hood in this tree, so
// shimming here lets us exercise server.ts + sessions.ts end-to-end
// without hitting GitHub.
//
// Some tests use fetchMock, others replace global.fetch directly.
const fetchMock = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  // @ts-expect-error test override
  globalThis.fetch = fetchMock;
  // Ensure resolveGitHubToken has something to return.
  process.env.GITHUB_TOKEN = "ghp_FAKE_" + "A".repeat(36);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.GITHUB_TOKEN;
});

function makeResponse(status: number, bodyJson: unknown): Response {
  return new Response(JSON.stringify(bodyJson), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeContentResponse(json: unknown): Response {
  const content = Buffer.from(JSON.stringify(json)).toString("base64");
  return makeResponse(200, { content, encoding: "base64" });
}

async function connectedClient() {
  const { createLogexServer } = await import("../server.js");
  const server = createLogexServer();
  const [clientTx, serverTx] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTx);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTx);
  return { client, server };
}

describe("logex_read MCP tool (via real MCP client)", () => {
  it("returns the article JSON as text content on hit", async () => {
    const article = { slug: "abc", title: "hello" };
    // First call = index.json; second = article file.
    fetchMock
      .mockResolvedValueOnce(makeContentResponse({ articles: [{ slug: "abc", path: "abc.json" }] }))
      .mockResolvedValueOnce(makeContentResponse(article));
    const { client } = await connectedClient();
    const result = await client.callTool({
      name: "logex_read",
      arguments: { slug: "abc" },
    }) as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual(article);
  });

  it("returns error isError=true when index has no matching slug (404-shape)", async () => {
    fetchMock.mockResolvedValueOnce(makeContentResponse({ articles: [{ slug: "other", path: "other.json" }] }));
    const { client } = await connectedClient();
    const result = await client.callTool({
      name: "logex_read",
      arguments: { slug: "missing" },
    }) as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({ error: "not found" });
  });

  it("returns error isError=true when index.json itself is 404", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(404, { message: "Not Found" }));
    const { client } = await connectedClient();
    const result = await client.callTool({
      name: "logex_read",
      arguments: { slug: "abc" },
    }) as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toBe("not found");
  });

  it("returns isError=true with actionable URL on 401 (bad token)", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(401, { message: "Bad credentials" }));
    const { client } = await connectedClient();
    const result = await client.callTool({
      name: "logex_read",
      arguments: { slug: "abc" },
    }) as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.url).toContain("github.com/settings/tokens/new");
    expect(payload.error).toBeTruthy();
  });

  it("returns isError=true with actionable URL on network-error (fetch throws)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    const { client } = await connectedClient();
    const result = await client.callTool({
      name: "logex_read",
      arguments: { slug: "abc" },
    }) as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.url).toContain("github.com/settings/tokens/new");
    expect(payload.error).toMatch(/Network/i);
  });

  it("tool description mentions GitHub data repo, not local path", async () => {
    const { client } = await connectedClient();
    const list = await client.listTools();
    const read = list.tools.find((t) => t.name === "logex_read");
    expect(read?.description).toContain("iamtouchskyer/logex-data");
    expect(read?.description ?? "").not.toContain("~/Code/logex-data");
  });
});

describe("logex_list MCP tool", () => {
  it("returns serialised session entries (no fetch needed)", async () => {
    const { client } = await connectedClient();
    const result = await client.callTool({
      name: "logex_list",
      arguments: {},
    }) as { content: Array<{ text: string }> };
    const payload = JSON.parse(result.content[0].text);
    expect(Array.isArray(payload.sessions)).toBe(true);
  });
});

describe("logex_write stub", () => {
  it("returns ok + hint with jsonl_path", async () => {
    const { client } = await connectedClient();
    const result = await client.callTool({
      name: "logex_write",
      arguments: { jsonl_path: "/tmp/x.jsonl" },
    }) as { content: Array<{ text: string }> };
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe("ok");
    expect(payload.jsonl_path).toBe("/tmp/x.jsonl");
    expect(payload.hint).toContain("logex");
  });

  it("tolerates missing jsonl_path (null)", async () => {
    const { client } = await connectedClient();
    const result = await client.callTool({
      name: "logex_write",
      arguments: {},
    }) as { content: Array<{ text: string }> };
    const payload = JSON.parse(result.content[0].text);
    expect(payload.jsonl_path).toBeNull();
  });
});

describe("startLogexMcp", () => {
  it("wires server + StdioServerTransport and calls connect", async () => {
    vi.resetModules();
    const connectMock = vi.fn(async () => {});
    vi.doMock("@modelcontextprotocol/sdk/server/mcp.js", async () => {
      const actual = await vi.importActual<typeof import("@modelcontextprotocol/sdk/server/mcp.js")>(
        "@modelcontextprotocol/sdk/server/mcp.js",
      );
      return {
        ...actual,
        McpServer: class FakeServer {
          registerTool() {}
          connect = connectMock;
        },
      };
    });
    vi.doMock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
      StdioServerTransport: class {},
    }));
    const mod = await import("../server.js");
    await mod.startLogexMcp();
    expect(connectMock).toHaveBeenCalledOnce();
    vi.doUnmock("@modelcontextprotocol/sdk/server/mcp.js");
    vi.doUnmock("@modelcontextprotocol/sdk/server/stdio.js");
    vi.resetModules();
  });
});
