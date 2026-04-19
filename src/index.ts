// Public package entry. Re-exports pipeline types for programmatic use.
// Runtime pipeline execution happens via the /logex skill and the frontend app;
// the npm package primarily ships the CLI + MCP server.
export type {
  JournalEntry,
  ContentBlock,
  Message,
  Chunk,
  TopicSegment,
  InsightCard,
  SessionMeta,
  CardIndex,
  Lang,
  SessionArticle,
} from "./pipeline/types.js";

export { listRecentSessions, readArticleBySlug } from "./lib/sessions.js";
export type { SessionEntry, LogexArticle } from "./lib/sessions.js";

export { createLogexServer, startLogexMcp } from "./mcp/server.js";
