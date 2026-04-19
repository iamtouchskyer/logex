#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listRecentSessions } from "../lib/sessions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"),
);

const program = new Command();
program
  .name("logex")
  .description("Write blog-style session papers from a Claude Code session JSONL")
  .version(pkg.version);

program
  .command("write [jsonl]")
  .description("Write a session paper (currently routed through the /logex skill)")
  .action((_jsonl?: string) => {
    process.stdout.write(
      "Run /logex in Claude Code for article writing.\n",
    );
    process.exit(0);
  });

program
  .command("list")
  .description("List the 10 most recent Claude Code session JSONLs")
  .action(() => {
    const entries = listRecentSessions(10);
    if (entries.length === 0) {
      process.stdout.write("No sessions found under ~/.claude/projects/\n");
      return;
    }
    for (const e of entries) {
      const ts = new Date(e.mtime).toISOString();
      process.stdout.write(`${ts}  ${e.project}  ${e.path}\n`);
    }
  });

program
  .command("mcp")
  .description("Start the MCP stdio server")
  .action(async () => {
    const { startLogexMcp } = await import("../mcp/server.js");
    await startLogexMcp();
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});
