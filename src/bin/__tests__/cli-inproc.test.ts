import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * In-process tests for the bin CLI. The module executes `program.parseAsync`
 * at import time, so each test isolates state with vi.resetModules + a mocked
 * process.argv and process.exit.
 */

const BIN = "../logex.js";

function setupArgv(args: string[]) {
  process.argv = ["node", "/fake/logex.js", ...args];
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("logex bin (in-process)", () => {
  it("write subcommand prints the /logex skill hint and exits 0", async () => {
    setupArgv(["write"]);
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined) as never);
    await import(BIN);
    // allow microtasks (parseAsync) to flush
    await new Promise((r) => setImmediate(r));
    const calls = writeSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.join("")).toMatch(/logex/i);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("list subcommand prints either 'No sessions found' or timestamped entries", async () => {
    setupArgv(["list"]);
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process, "exit").mockImplementation(
      ((_code?: number) => undefined) as never,
    );
    await import(BIN);
    await new Promise((r) => setImmediate(r));
    const out = writeSpy.mock.calls.map((c) => String(c[0])).join("");
    // The handler ALWAYS writes at least one line:
    //  - "No sessions found under ~/.claude/projects/\n" when empty
    //  - one "<ISO-timestamp>  <project>  <path>\n" per entry otherwise
    expect(out.length).toBeGreaterThan(0);
    const isEmpty = /No sessions found under ~\/\.claude\/projects\//.test(out);
    // ISO 8601 timestamp at start of a line followed by two-space separators
    const hasEntry =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z {2}\S+ {2}\S+/m.test(out);
    expect(isEmpty || hasEntry).toBe(true);
  });

  it("--help exits 0 and mentions all subcommands", async () => {
    setupArgv(["--help"]);
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined) as never);
    await import(BIN);
    await new Promise((r) => setImmediate(r));
    const out = writeSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toMatch(/write/);
    expect(out).toMatch(/list/);
    expect(out).toMatch(/mcp/);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("unknown command triggers error path (stderr + exit 1)", async () => {
    setupArgv(["nonexistent-cmd"]);
    const errSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined) as never);
    await import(BIN);
    await new Promise((r) => setImmediate(r));
    // commander writes "error: unknown command 'nonexistent-cmd'" to stderr
    // AND calls process.exit(1). Assert both, strictly.
    const stderr = errSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderr).toMatch(/unknown command/i);
    expect(stderr).toMatch(/nonexistent-cmd/);
    const nonZeroExits = exitSpy.mock.calls.filter((c) => c[0] !== 0);
    expect(nonZeroExits.length).toBeGreaterThan(0);
    expect(nonZeroExits[0][0]).toBe(1);
  });

  it("mcp subcommand boots the MCP server with stdio (boundary-mocked)", async () => {
    setupArgv(["mcp"]);
    let connected = 0;
    const gotTransport = new Promise<void>((resolve) => {
      class FakeStdio {
        constructor() {
          connected++;
          resolve();
        }
        async start() {}
        async close() {}
        async send() {}
      }
      vi.doMock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
        StdioServerTransport: FakeStdio,
      }));
    });
    vi.spyOn(process, "exit").mockImplementation(
      ((_code?: number) => undefined) as never,
    );
    await import(BIN);
    await Promise.race([
      gotTransport,
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000)),
    ]);
    expect(connected).toBe(1);
    vi.doUnmock("@modelcontextprotocol/sdk/server/stdio.js");
  });
});
