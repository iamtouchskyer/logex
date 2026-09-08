#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listAllSessions } from "../lib/sessions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"),
);

interface ProcessIO {
  stderr: (s: string) => void;
  stdout: (s: string) => void;
  exit: (code: number) => never;
}

const io: ProcessIO = {
  stderr: (s) => {
    process.stderr.write(s);
  },
  stdout: (s) => {
    process.stdout.write(s);
  },
  exit: (code) => process.exit(code),
};

function runPublishCli(argv: string[]): Promise<void> {
  // Lazy import keeps `logex list` startup free of octokit/sdk loading.
  return import("../pipeline/publish.js").then(({ runCli }) =>
    runCli({ argv, ...io }),
  );
}

const program = new Command();
program
  .name("logex")
  .description(
    "Write blog-style session papers from coding-agent session transcripts (Claude Code, Codex, Pi, DSH)",
  )
  .version(pkg.version);

program
  .command("write [jsonl]")
  .description(
    "Entry point for the /logex skill — points at the manual workflow commands",
  )
  .action(() => {
    process.stdout.write(
      "Run /logex in Claude Code, or drive the workflow directly:\n"
        + "  logex prepare <session.jsonl>          # chunk summaries + segmentation prompt\n"
        + "  logex publish prepare-match|execute    # publish to the logex-data repo\n",
    );
    process.exit(0);
  });

program
  .command("list")
  .description("List the 10 most recent session JSONLs (Claude Code + Codex + Pi + DSH)")
  .action(() => {
    const entries = listAllSessions(10);
    if (entries.length === 0) {
      process.stdout.write(
        "No sessions found under ~/.claude/projects/, ~/.codex/sessions/, or ~/.pi/agent/sessions/\n",
      );
      return;
    }
    for (const e of entries) {
      const ts = new Date(e.mtime).toISOString();
      process.stdout.write(`${ts}  ${e.project}  ${e.path}\n`);
    }
  });

program
  .command("prepare <jsonl>")
  .description(
    "Parse, chunk, score a session JSONL and emit the segmentation prompt (no LLM)",
  )
  .option("--mode <mode>", "article or cards", "article")
  .action(async (jsonl, opts) => {
    const { runPrepare } = await import("../pipeline/prepare.js");
    runPrepare({
      argv: [jsonl, "--mode", opts.mode],
      ...io,
    });
  });

const publish = program
  .command("publish")
  .description("Publish articles to the logex-data repo (GitHub Contents API)");

publish
  .command("prepare-match")
  .description("Check existing articles and emit the update-vs-insert decision prompt")
  .requiredOption("--session-id <id>", "Session id used for idempotent upsert")
  .requiredOption("--articles <path>", "JSON file with the new articles array")
  .action((opts) =>
    runPublishCli([
      "prepare-match",
      "--session-id",
      opts.sessionId,
      "--articles",
      opts.articles,
    ]));

publish
  .command("execute")
  .description("Commit articles + index.json to logex-data in one atomic commit")
  .requiredOption("--session-id <id>", "Session id used for idempotent upsert")
  .requiredOption("--articles <path>", "JSON file with the new articles array")
  .requiredOption("--decisions <path>", "JSON file with the match decisions")
  .action((opts) =>
    runPublishCli([
      "execute",
      "--session-id",
      opts.sessionId,
      "--articles",
      opts.articles,
      "--decisions",
      opts.decisions,
    ]));

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
