import { parseJsonl, extractMessages } from './parse.js'
import type { Chunk, JournalEntry } from './types.js'
import { chunkByConversation, scoreChunk, filterChunks } from './chunk.js'
import { buildExtractionPrompt } from './prompt.js'
import { buildChunkSummaries, buildSegmentationPrompt } from './segment.js'
import { extractRichStats } from './stats.js'

export type Mode = 'article' | 'cards'

export interface PrepareIO {
  argv: string[]
  stderr: (s: string) => void
  stdout: (s: string) => void
  exit: (code: number) => never
}

function parseMode(args: string[], io: PrepareIO): { mode: Mode; rest: string[] } {
  const modeIdx = args.indexOf('--mode')
  if (modeIdx === -1 || !args[modeIdx + 1]) return { mode: 'article', rest: args }
  const modeVal = args[modeIdx + 1] as Mode
  if (modeVal !== 'article' && modeVal !== 'cards') {
    io.stderr(`Invalid mode: ${modeVal}. Use "article" or "cards".\n`)
    io.exit(1)
  }
  const rest = [...args.slice(0, modeIdx), ...args.slice(modeIdx + 2)]
  return { mode: modeVal, rest }
}

// Claude Code carries sessionId top-level; Codex rollouts in payload.session_id;
// Pi session headers in the first entry's id (type "session").
function resolveSessionId(entries: JournalEntry[]): string {
  const first = entries[0]
  if (!first) return 'unknown'
  if (first.sessionId) return first.sessionId
  if (first.payload?.session_id) return first.payload.session_id
  if (first.type === 'session' && first.id) return first.id
  return 'unknown'
}

/**
 * Prepare extraction data from a session JSONL.
 * Does NOT call any LLM API — parse, chunk, score, build summaries.
 *
 * For article mode: outputs chunk summaries + segmentation prompt.
 *   The agent (Claude Code, Codex, any MCP client) reads the segmentation
 *   prompt, decides topic groups, then writes articles per group.
 *
 * For cards mode: outputs a single extraction prompt (unchanged).
 */
/** Score every chunk, filter to signal chunks, surface rich stats on stderr. */
function scoreAndFilter(chunks: Chunk[], jsonlPath: string, io: PrepareIO): {
  filtered: Chunk[]
  richStats: unknown
} {
  for (const chunk of chunks) {
    chunk.insightScore = scoreChunk(chunk)
  }

  const filtered = filterChunks(chunks)
  const pct = Math.round((filtered.length / Math.max(chunks.length, 1)) * 100)
  io.stderr(`Signal chunks: ${filtered.length} / ${chunks.length} (${pct}%)\n`)

  const richStats = extractRichStats(jsonlPath)
  if (richStats) {
    const rs = richStats as Record<string, Record<string, unknown>>
    const tokens = (rs.tokens?.total as number)?.toLocaleString() ?? '?'
    io.stderr(`  Tokens: ${tokens} | Cost: $${rs.cost_estimate?.total_cost ?? '?'} | Tools: ${rs.tool_calls?.total ?? '?'}\n`)
  }
  return { filtered, richStats }
}

function buildMeta(
  entries: JournalEntry[],
  messages: ReturnType<typeof extractMessages>,
  chunks: Chunk[],
  filtered: Chunk[],
  richStats: unknown,
) {
  return {
    entries: entries.length,
    messages: messages.length,
    chunks: chunks.length,
    signalChunks: filtered.length,
    startTime: messages[0]?.timestamp ?? '',
    endTime: messages[messages.length - 1]?.timestamp ?? '',
    richStats,
  }
}

function prepareSession(jsonlPath: string, mode: Mode, io: PrepareIO): void {
  const entries = parseJsonl(jsonlPath)
  const sessionId = resolveSessionId(entries)
  io.stderr(`Session: ${sessionId}\n`)
  io.stderr(`Entries: ${entries.length}\n`)
  io.stderr(`Mode: ${mode}\n`)

  const messages = extractMessages(entries)
  io.stderr(`Messages: ${messages.length}\n`)

  const chunks = chunkByConversation(messages)
  io.stderr(`Chunks: ${chunks.length}\n`)

  const { filtered, richStats } = scoreAndFilter(chunks, jsonlPath, io)
  const meta = buildMeta(entries, messages, chunks, filtered, richStats)

  if (filtered.length === 0) {
    io.stderr('No signal chunks found.\n')
    io.stdout(JSON.stringify({ sessionId, mode, prompt: null, chunkSummaries: [], segmentationPrompt: null, meta }) + '\n')
    io.exit(0)
  }

  if (mode === 'cards') {
    const prompt = buildExtractionPrompt(filtered, sessionId)
    io.stderr(`Prompt: ${prompt.length} chars (~${Math.round(prompt.length / 4)} tokens)\n`)
    io.stdout(JSON.stringify({ sessionId, mode, prompt, chunkSummaries: [], segmentationPrompt: null, meta }) + '\n')
    return
  }

  // Article mode: pass ALL chunks so the LLM sees full context. The
  // segmentation prompt tells it "score < 0.25 可以跳过", so low-score
  // chunks are visible but flagged.
  const summaries = buildChunkSummaries(chunks)
  const segPrompt = buildSegmentationPrompt(summaries)
  io.stderr(`Chunk summaries: ${summaries.length}\n`)
  io.stderr(`Segmentation prompt: ${segPrompt.length} chars\n`)
  io.stdout(JSON.stringify({
    sessionId,
    mode,
    prompt: null,
    chunkSummaries: summaries,
    segmentationPrompt: segPrompt,
    meta,
  }) + '\n')
}

/**
 * Pure CLI tail with injected IO so it is unit-testable.
 * Usage: logex prepare <session.jsonl> [--mode article|cards]
 */
export function runPrepare(io: PrepareIO): void {
  const { mode, rest } = parseMode(io.argv, io)
  if (rest.length === 0) {
    io.stderr('Usage: logex prepare <session.jsonl> [--mode article|cards]\n')
    io.exit(1)
  }
  prepareSession(rest[0], mode, io)
}

export async function main(): Promise<void> {
  runPrepare({
    argv: process.argv.slice(2),
    stderr: (s) => { process.stderr.write(s) },
    stdout: (s) => { process.stdout.write(s) },
    exit: (code) => process.exit(code),
  })
}

/* v8 ignore start -- module bootstrap; exercised only when run as CLI */
const isMain = (() => {
  try {
    const argv1 = process.argv[1]
    if (!argv1) return false
    return argv1.endsWith('prepare.ts') || argv1.endsWith('prepare.js')
  } catch {
    return false
  }
})()

if (isMain) {
  main()
}
/* v8 ignore stop */
