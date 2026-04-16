import type { Message, Chunk } from './types'

const SIGNAL_CATEGORIES: Record<string, string[]> = {
  debugging: ['bug', 'error', 'fix', 'debug', 'root cause', 'traceback', 'broken', '问题', '修复'],
  architecture: ['architecture', 'design', 'pattern', 'trade-off', 'decision', 'approach', '架构', '设计'],
  discovery: ['learned', 'discovered', 'insight', 'gotcha', 'trap', 'pitfall', 'trick', '发现', '陷阱', '关键'],
  reasoning: ['because', 'instead of', 'rather than', 'why', 'the reason', '原因', '所以', '因为'],
  evaluation: ['review', 'evaluate', 'score', 'verdict', 'assessment', '评估', '审查'],
}

/**
 * Chunk messages into conversation segments.
 * Splits on user messages after accumulating > maxChars or > 3000 chars with > 3 messages.
 */
export function chunkByConversation(messages: Message[], maxChars = 6000): Chunk[] {
  const chunks: Chunk[] = []
  let current: Chunk = { messages: [], userTextLen: 0, totalLen: 0, startTs: '', endTs: '' }

  for (const msg of messages) {
    const textLen = msg.text.length
    const userContribution = msg.role === 'user' && !msg.isToolOutput ? textLen : 0

    const shouldSplit =
      current.totalLen > maxChars ||
      (msg.role === 'user' && current.totalLen > 3000 && current.messages.length > 3)

    if (shouldSplit && current.messages.length > 0) {
      chunks.push(current)
      current = { messages: [], userTextLen: 0, totalLen: 0, startTs: '', endTs: '' }
    }

    if (!current.startTs) current.startTs = msg.timestamp
    current.endTs = msg.timestamp
    current.messages.push(msg)
    current.totalLen += textLen
    current.userTextLen += userContribution
  }

  if (current.messages.length > 0) {
    chunks.push(current)
  }

  return chunks
}

/**
 * Score a chunk's insight potential (0-1).
 * Requires signals from >= 2 categories to score above 0.1.
 */
export function scoreChunk(chunk: Chunk): number {
  const conversationText = chunk.messages
    .filter((m) => !m.isToolOutput)
    .map((m) => m.text.toLowerCase())
    .join(' ')

  if (!conversationText.trim()) return 0.0

  let categoryHits = 0
  let totalHits = 0

  for (const keywords of Object.values(SIGNAL_CATEGORIES)) {
    const hits = keywords.filter((kw) => conversationText.includes(kw)).length
    if (hits > 0) {
      categoryHits++
      totalHits += hits
    }
  }

  // Require signals from at least 2 categories
  if (categoryHits < 2) return 0.1

  // Bonus for substantial user participation
  const userRatio = chunk.userTextLen / Math.max(chunk.totalLen, 1)

  // Score: category breadth + keyword density + user participation
  return Math.min(1.0, (categoryHits / 5) * 0.4 + (totalHits / 15) * 0.3 + userRatio * 0.3)
}

/**
 * Filter chunks by insight score. Returns only chunks >= threshold.
 * Assumes insightScore is already set (via scoreChunk). Does not re-score.
 */
export function filterChunks(chunks: Chunk[], threshold = 0.25): Chunk[] {
  return chunks.filter(c => (c.insightScore ?? 0) >= threshold)
}
