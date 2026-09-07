import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listAllSessions, readArticleBySlug } from "../lib/sessions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"),
);

export function createLogexServer(): McpServer {
  const server = new McpServer({
    name: "logex",
    version: pkg.version,
  });

  server.registerTool(
    "logex_write",
    {
      description:
        "Handshake for the article-writing workflow. Returns the concrete steps any LLM agent executes with the logex CLI — the calling agent IS the LLM that segments topics and writes the articles.",
      inputSchema: {
        jsonl_path: z
          .string()
          .optional()
          .describe("Optional path to a session JSONL"),
      },
    },
    async ({ jsonl_path }) => {
      const payload = {
        status: "ok",
        jsonl_path: jsonl_path ?? null,
        workflow: [
          "logex prepare <session.jsonl> --mode article  → JSON with chunkSummaries + segmentationPrompt",
          "Execute the segmentationPrompt yourself: group chunks into topics, mark worthWriting per group",
          "Write one bilingual (zh + en) article per selected group; shape documented in skills/extract/skill.md",
          "logex publish prepare-match --session-id <id> --articles <tmp.json>",
          "If needsLlm, execute the matchingPrompt yourself and save the decisions JSON",
          "logex publish execute --session-id <id> --articles <tmp.json> --decisions <decisions.json>",
        ],
        hint:
          "No API key needed — you are the LLM. Run the steps with the logex CLI; full procedure: skills/extract/skill.md (shipped in the npm package).",
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload) }],
      };
    },
  );

  server.registerTool(
    "logex_list",
    {
      description:
        "List the most recent session JSONLs across Claude Code (~/.claude/projects) and Codex (~/.codex/sessions), top 10 by mtime",
      inputSchema: {},
    },
    async () => {
      const entries = listAllSessions(10);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ sessions: entries }) },
        ],
      };
    },
  );

  server.registerTool(
    "logex_read",
    {
      description:
        "Fetches article JSON from iamtouchskyer/logex-data on GitHub.",
      inputSchema: {
        slug: z.string().describe("Article slug"),
      },
    },
    async ({ slug }) => {
      try {
        const article = await readArticleBySlug(slug);
        if (!article) {
          return {
            content: [
              { type: "text" as const, text: JSON.stringify({ error: "not found" }) },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(article) }],
        };
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: msg,
                url: "https://github.com/settings/tokens/new",
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

export async function startLogexMcp(): Promise<void> {
  const server = createLogexServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
