import { parseJsonl, extractMessages } from './parse'
import { chunkByConversation, scoreChunk, filterChunks } from './chunk'
import { buildExtractionPrompt, buildArticlePrompt } from './prompt'

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
 * Prepare extraction prompt from a session JSONL.
 * Does NOT call any API — just parse, chunk, filter, build prompt.
 * Output goes to stdout as JSON: { sessionId, mode, prompt, meta }
 *
 * Usage:
 *   npx tsx src/pipeline/prepare.ts <session.jsonl> [--mode article|cards]
 *   Default mode: article
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
  console.error(
    `Signal chunks: ${filtered.length} / ${chunks.length} (${Math.round((filtered.length / Math.max(chunks.length, 1)) * 100)}%)`,
  )

  const meta = {
    entries: entries.length,
    messages: messages.length,
    chunks: chunks.length,
    signalChunks: filtered.length,
    startTime: messages[0]?.timestamp ?? '',
    endTime: messages[messages.length - 1]?.timestamp ?? '',
  }

  if (filtered.length === 0) {
    console.error('No signal chunks found.')
    console.log(JSON.stringify({ sessionId, mode, prompt: null, meta }))
    process.exit(0)
  }

  const prompt = mode === 'article'
    ? buildArticlePrompt(filtered, sessionId, meta)
    : buildExtractionPrompt(filtered, sessionId)

  console.error(`Prompt: ${prompt.length} chars (~${Math.round(prompt.length / 4)} tokens)`)

  console.log(JSON.stringify({
    sessionId,
    mode,
    prompt,
    meta,
  }))
}

main()
