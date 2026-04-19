import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CLI = join(process.cwd(), "dist", "bin", "logex.js");

describe("logex CLI", () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error(
        `dist CLI missing at ${CLI}. Run \`npm run build:cli\` first.`,
      );
    }
  });

  it("--help exits 0 and mentions all subcommands", () => {
    const res = spawnSync("node", [CLI, "--help"], { encoding: "utf-8" });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/write/);
    expect(res.stdout).toMatch(/list/);
    expect(res.stdout).toMatch(/mcp/);
  });

  it("write subcommand prints hint and exits 0", () => {
    const res = spawnSync("node", [CLI, "write"], { encoding: "utf-8" });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/logex/i);
  });

  it("list subcommand exits 0", () => {
    const res = spawnSync("node", [CLI, "list"], { encoding: "utf-8" });
    expect(res.status).toBe(0);
  });
});
