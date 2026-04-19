import { describe, it, expect, beforeAll } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CLI = join(process.cwd(), "dist", "bin", "logex.js");

describe("logex mcp server", () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error(
        `dist CLI missing at ${CLI}. Run \`npm run build:cli\` first.`,
      );
    }
  });

  it("responds to tools/list with ≥3 tools including logex_write/list/read", async () => {
    const child = spawn("node", [CLI, "mcp"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const initReq =
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      }) + "\n";

    const listReq =
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n";

    child.stdin.write(initReq);
    child.stdin.write(listReq);

    const tools = await new Promise<string[]>((resolve, reject) => {
      let buf = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`timeout; buf=${buf}`));
      }, 8000);
      child.stdout.on("data", (d) => {
        buf += d.toString();
        const lines = buf.split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id === 2 && msg.result?.tools) {
              clearTimeout(timer);
              child.kill();
              resolve(msg.result.tools.map((t: { name: string }) => t.name));
              return;
            }
          } catch {
            /* partial */
          }
        }
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    expect(tools.length).toBeGreaterThanOrEqual(3);
    expect(tools).toContain("logex_write");
    expect(tools).toContain("logex_list");
    expect(tools).toContain("logex_read");
  }, 15000);
});
