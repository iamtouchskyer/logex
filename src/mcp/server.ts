import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listRecentSessions, readArticleBySlug } from "../lib/sessions.js";

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
        "Handshake/stub tool. Actual article writing runs through the /logex skill in Claude Code.",
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
        hint: "Invoke /logex skill in Claude Code to actually write articles",
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
        "List the most recent Claude Code session JSONLs (top 10 by mtime)",
      inputSchema: {},
    },
    async () => {
      const entries = listRecentSessions(10);
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
