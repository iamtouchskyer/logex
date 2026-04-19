import { execFileSync } from 'child_process'
import { parseJsonl, extractMessages } from './parse'
import { chunkByConversation, scoreChunk, filterChunks } from './chunk'
import { buildExtractionPrompt } from './prompt'
import { buildChunkSummaries, buildSegmentationPrompt } from './segment'

const STATS_SCRIPT = `${process.env.HOME}/.claude/skills/session-recap/scripts/extract-session-stats.py`

function extractRichStats(jsonlPath: string): Record<string, unknown> | null {
  try {
    const out = execFileSync('python3', [STATS_SCRIPT, '--jsonl', jsonlPath], {
      encoding: 'utf-8',
      timeout: 30000,
    })
    return JSON.parse(out)
  } catch {
    console.error('Warning: session-recap stats extraction failed, continuing without rich stats')
    return null
  }
}

type Mode = 'article' | 'cards'

function parseMode(args: string[]): { mode: Mode; rest: string[] } {
  const modeIdx = args.indexOf('--mode')
  if (modeIdx !== -1 && args[modeIdx + 1]) {
    const modeVal = args[modeIdx + 1] as Mode
    if (modeVal !== 'article' && modeVal !== 'cards') {
      console.error(`Invalid mode: ${modeVal}. Use "article" or "cards".`)
      process.exit(1)
    }
    const rest = [...args.slice(0, modeIdx), ...args.slice(modeIdx + 2)]
    return { mode: modeVal, rest }
  }
  return { mode: 'article', rest: args }
}

/**
 * Prepare extraction data from a session JSONL.
 * Does NOT call any LLM API — parse, chunk, score, build summaries.
 *
 * For article mode: outputs chunk summaries + segmentation prompt.
 *   The skill (Claude in-session) reads the segmentation prompt,
 *   decides topic groups, then builds article prompts per group.
 *
 * For cards mode: outputs a single extraction prompt (unchanged).
 *
 * Usage:
 *   npx tsx src/pipeline/prepare.ts <session.jsonl> [--mode article|cards]
 */
function main() {
  const args = process.argv.slice(2)
  const { mode, rest } = parseMode(args)

  if (rest.length === 0) {
    console.error('Usage: npx tsx src/pipeline/prepare.ts <session.jsonl> [--mode article|cards]')
    process.exit(1)
  }

  const jsonlPath = rest[0]

  const entries = parseJsonl(jsonlPath)
  const sessionId = entries[0]?.sessionId ?? 'unknown'
  console.error(`Session: ${sessionId}`)
  console.error(`Entries: ${entries.length}`)
  console.error(`Mode: ${mode}`)

  const messages = extractMessages(entries)
  console.error(`Messages: ${messages.length}`)

  const chunks = chunkByConversation(messages)
  console.error(`Chunks: ${chunks.length}`)

  for (const chunk of chunks) {
    chunk.insightScore = scoreChunk(chunk)
  }

  const filtered = filterChunks(chunks)
  console.error(`Signal chunks: ${filtered.length} / ${chunks.length} (${Math.round((filtered.length / Math.max(chunks.length, 1)) * 100)}%)`)

  // Extract rich stats
  console.error('Extracting rich stats...')
  const richStats = extractRichStats(jsonlPath)
  if (richStats) {
    const rs = richStats as Record<string, Record<string, unknown>>
    console.error(`  Tokens: ${(rs.tokens?.total as number)?.toLocaleString() ?? '?'} | Cost: $${rs.cost_estimate?.total_cost ?? '?'} | Tools: ${rs.tool_calls?.total ?? '?'}`)
  }

  const meta = {
    entries: entries.length,
    messages: messages.length,
    chunks: chunks.length,
    signalChunks: filtered.length,
    startTime: messages[0]?.timestamp ?? '',
    endTime: messages[messages.length - 1]?.timestamp ?? '',
    richStats,
  }

  if (filtered.length === 0) {
    console.error('No signal chunks found.')
    console.log(JSON.stringify({ sessionId, mode, prompt: null, chunkSummaries: [], segmentationPrompt: null, meta }))
    process.exit(0)
  }

  // Cards mode: single prompt (unchanged)
  if (mode === 'cards') {
    const prompt = buildExtractionPrompt(filtered, sessionId)
    console.error(`Prompt: ${prompt.length} chars (~${Math.round(prompt.length / 4)} tokens)`)
    console.log(JSON.stringify({ sessionId, mode, prompt, chunkSummaries: [], segmentationPrompt: null, meta }))
    return
  }

  // Article mode: output chunk summaries + segmentation prompt for LLM
  // Pass ALL chunks (not just filtered) so the LLM sees full context.
  // Scores are already set from the scoring loop above. The segmentation
  // prompt tells the LLM "score < 0.25 可以跳过", so low-score chunks
  // are visible but flagged.
  const summaries = buildChunkSummaries(chunks)
  const segPrompt = buildSegmentationPrompt(summaries)

  console.error(`Chunk summaries: ${summaries.length}`)
  console.error(`Segmentation prompt: ${segPrompt.length} chars`)

  console.log(JSON.stringify({
    sessionId,
    mode,
    prompt: null,
    chunkSummaries: summaries,
    segmentationPrompt: segPrompt,
    meta,
  }))
}

main()
