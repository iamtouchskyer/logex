import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLogexServer } from "../server.js";

async function makeClient() {
  const server = createLogexServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientT);
  return { client, server };
}

describe("logex MCP server (in-process)", () => {
  it("lists the 3 registered tools", async () => {
    const { client } = await makeClient();
    const res = await client.listTools();
    const names = res.tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["logex_write", "logex_list", "logex_read"]),
    );
  });

  it("logex_write returns a stub payload when no jsonl_path", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({ name: "logex_write", arguments: {} });
    const content = res.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    expect(payload.status).toBe("ok");
    expect(payload.jsonl_path).toBeNull();
  });

  it("logex_write echoes jsonl_path when provided", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "logex_write",
      arguments: { jsonl_path: "/tmp/x.jsonl" },
    });
    const content = res.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    expect(payload.jsonl_path).toBe("/tmp/x.jsonl");
  });

  it("logex_list returns a sessions array", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({ name: "logex_list", arguments: {} });
    const content = res.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    expect(Array.isArray(payload.sessions)).toBe(true);
  });

  it("logex_read returns isError=true for unknown slug", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "logex_read",
      arguments: { slug: "__definitely_missing_slug__" },
    });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    expect(payload.error).toBe("not found");
  });
});

describe("startLogexMcp", () => {
  it("wires a stdio transport to the created server", async () => {
    vi.resetModules();
    const connectCalls: unknown[] = [];
    class FakeStdio {
      async start() {
        /* noop */
      }
      async close() {
        /* noop */
      }
      async send() {
        /* noop */
      }
      onmessage?: (...a: unknown[]) => void;
      onerror?: (...a: unknown[]) => void;
      onclose?: (...a: unknown[]) => void;
    }
    vi.doMock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
      StdioServerTransport: class extends FakeStdio {
        constructor() {
          super();
          connectCalls.push(this);
        }
      },
    }));

    const mod = await import("../server.js");
    await mod.startLogexMcp();
    expect(connectCalls.length).toBe(1);
    vi.doUnmock("@modelcontextprotocol/sdk/server/stdio.js");
  });
});
