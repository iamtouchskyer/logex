import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sessions.readArticleBySlug so we don't hit real GitHub.
const readArticleBySlugMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/sessions.js", async () => {
  const actual = await vi.importActual<typeof import("../../lib/sessions.js")>(
    "../../lib/sessions.js",
  );
  return {
    ...actual,
    readArticleBySlug: readArticleBySlugMock,
    listRecentSessions: vi.fn(() => [
      { path: "/tmp/sess1.jsonl", project: "p", mtime: 1 },
    ]),
  };
});

import { createLogexServer } from "../server.js";

interface RegisteredTool {
  name: string;
  description: string;
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
}

function collectTools(): Record<string, RegisteredTool> {
  const registry: Record<string, RegisteredTool> = {};
  const server = createLogexServer() as unknown as {
    registerTool: (
      name: string,
      spec: { description: string },
      handler: RegisteredTool["handler"],
    ) => void;
  };
  // re-extract via a proxy: createLogexServer already called registerTool,
  // so we need to introspect the MCP server instance. Easier approach:
  // call the real server.registerTool by wrapping it.
  void server;
  return registry;
}

// Since createLogexServer wires handlers into the internal MCP instance,
// the simplest "unit test" approach is to monkey-patch registerTool via
// a shim server. Instead, we test the observable behaviour of the tool
// handlers by invoking them through the SDK's internal tool registry.
// `McpServer` exposes `_registeredTools` as an implementation detail — we
// access it via a narrow cast only for the purpose of this test.

describe("logex_read MCP tool", () => {
  beforeEach(() => {
    readArticleBySlugMock.mockReset();
  });

  it("returns the article JSON as text content on hit", async () => {
    const article = { slug: "abc", title: "hello" };
    readArticleBySlugMock.mockResolvedValue(article);
    const srv = createLogexServer() as unknown as {
      _registeredTools: Record<string, {
        handler: (args: Record<string, unknown>) => Promise<{
          content: Array<{ text: string }>;
          isError?: boolean;
        }>;
        description?: string;
      }>;
    };
    const handler = srv._registeredTools.logex_read;
    expect(handler).toBeDefined();
    const result = await handler.handler({ slug: "abc" });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(article);
    expect(readArticleBySlugMock).toHaveBeenCalledWith("abc");
  });

  it("returns an error payload when article not found", async () => {
    readArticleBySlugMock.mockResolvedValue(null);
    const srv = createLogexServer() as unknown as {
      _registeredTools: Record<string, {
        handler: (args: Record<string, unknown>) => Promise<{
          content: Array<{ text: string }>;
          isError?: boolean;
        }>;
      }>;
    };
    const result = await srv._registeredTools.logex_read.handler({ slug: "missing" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({ error: "not found" });
  });

  it("description mentions GitHub data repo and drops local path reference", () => {
    const srv = createLogexServer() as unknown as {
      _registeredTools: Record<string, { description?: string }>;
    };
    const desc = srv._registeredTools.logex_read.description ?? "";
    expect(desc).toContain("iamtouchskyer/logex-data");
    expect(desc).not.toContain("~/Code/logex-data");
  });
});

describe("logex_list MCP tool", () => {
  it("returns serialised session entries", async () => {
    const srv = createLogexServer() as unknown as {
      _registeredTools: Record<string, {
        handler: (args: Record<string, unknown>) => Promise<{
          content: Array<{ text: string }>;
        }>;
      }>;
    };
    const result = await srv._registeredTools.logex_list.handler({});
    const payload = JSON.parse(result.content[0].text);
    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0].project).toBe("p");
  });
});

describe("logex_write stub", () => {
  it("returns ok + hint", async () => {
    const srv = createLogexServer() as unknown as {
      _registeredTools: Record<string, {
        handler: (args: Record<string, unknown>) => Promise<{
          content: Array<{ text: string }>;
        }>;
      }>;
    };
    const result = await srv._registeredTools.logex_write.handler({
      jsonl_path: "/tmp/x.jsonl",
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe("ok");
    expect(payload.jsonl_path).toBe("/tmp/x.jsonl");
    expect(payload.hint).toContain("logex");
  });

  it("tolerates missing jsonl_path", async () => {
    const srv = createLogexServer() as unknown as {
      _registeredTools: Record<string, {
        handler: (args: Record<string, unknown>) => Promise<{
          content: Array<{ text: string }>;
        }>;
      }>;
    };
    const result = await srv._registeredTools.logex_write.handler({});
    const payload = JSON.parse(result.content[0].text);
    expect(payload.jsonl_path).toBeNull();
  });
});

// Keep the dead-code collector happy.
void collectTools;
