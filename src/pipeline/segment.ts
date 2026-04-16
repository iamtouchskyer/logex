import type { Chunk, TopicSegment } from './types'

/**
 * Extract project name from user messages in a chunk.
 * Looks for ~/Code/<project> patterns. Used as hint for LLM segmentation.
 */
export function detectProject(chunk: Chunk): string | undefined {
  const PROJECT_PATH_RE = /~\/Code\/([a-zA-Z0-9_-]+)/g
  const projects = new Map<string, number>()

  for (const msg of chunk.messages) {
    if (msg.role !== 'user') continue
    for (const match of msg.text.matchAll(PROJECT_PATH_RE)) {
      const name = match[1]
      projects.set(name, (projects.get(name) ?? 0) + 1)
    }
  }

  if (projects.size === 0) return undefined

  let best = ''
  let bestCount = 0
  for (const [name, count] of projects) {
    if (count > bestCount) {
      best = name
      bestCount = count
    }
  }
  return best
}

/**
 * Extract a short preview from a chunk (first ~200 chars of user messages).
 */
function chunkPreview(chunk: Chunk, maxChars = 200): string {
  const userTexts = chunk.messages
    .filter((m) => m.role === 'user' && !m.isToolOutput)
    .map((m) => m.text)
  const joined = userTexts.join(' ').replace(/\s+/g, ' ').trim()
  return joined.length > maxChars ? joined.slice(0, maxChars) + '…' : joined
}

export interface ChunkSummary {
  index: number            // 1-based chunk index
  startTs: string
  endTs: string
  score: number
  project?: string
  preview: string          // first ~200 chars of user text
  messageCount: number
}

/**
 * Build a summary list of all scored chunks for LLM segmentation.
 * The LLM reads this to decide which chunks form the same topic.
 */
export function buildChunkSummaries(chunks: Chunk[]): ChunkSummary[] {
  return chunks.map((chunk, i) => ({
    index: i + 1,
    startTs: chunk.startTs,
    endTs: chunk.endTs,
    score: chunk.insightScore ?? 0,
    project: detectProject(chunk),
    preview: chunkPreview(chunk),
    messageCount: chunk.messages.length,
  }))
}

/**
 * Build the segmentation prompt for Claude to decide topic groupings.
 * Returns a prompt string that Claude executes in-session.
 */
export function buildSegmentationPrompt(summaries: ChunkSummary[]): string {
  const summaryText = summaries
    .map((s) => {
      const parts = [
        `[${s.index}]`,
        `${s.startTs} → ${s.endTs}`,
        `score: ${s.score.toFixed(2)}`,
        s.project ? `project: ${s.project}` : null,
        `msgs: ${s.messageCount}`,
        `"${s.preview}"`,
      ]
      return parts.filter(Boolean).join(' | ')
    })
    .join('\n')

  return `你是一个 session 分析器。下面是一个 Claude Code session 的 chunk 列表摘要。

每个 chunk 是一段对话片段，包含时间范围、insight score、检测到的 project 路径、和内容预览。

## 任务

把这些 chunks 分成 **topic groups**。每个 group 应该对应一个独立的、值得写文章的主题/故事线。

分组原则：
- 围绕同一个问题、feature、或决策的 chunks 归为一组
- 一个 session 可能只有 1 个 topic，也可能有 5+ 个
- 不是所有 chunks 都值得写文章 — score < 0.25 的 chunk 可以跳过
- 宁可少分不要多分（两个相关话题合一组比拆成两篇半成品好）

## Chunk 列表

${summaryText}

## 输出格式（JSON）

\`\`\`json
{
  "groups": [
    {
      "title": "简短的 topic 描述（中文）",
      "chunkIndices": [1, 2, 3],
      "project": "primary-project-name or null",
      "worthWriting": true,
      "reason": "为什么这组值得写/不值得写"
    }
  ]
}
\`\`\`

只输出 JSON，不要其他内容。`
}

/**
 * Given LLM-decided groups, build TopicSegment objects from the original chunks.
 */
export function buildSegmentsFromGroups(
  chunks: Chunk[],
  groups: Array<{ title: string; chunkIndices: number[]; project?: string | null; worthWriting: boolean }>,
): TopicSegment[] {
  const segments: (TopicSegment | null)[] = groups
    .filter((g) => g.worthWriting)
    .map((g) => {
      const segChunks = g.chunkIndices
        .map((i) => chunks[i - 1]) // 1-based → 0-based
        .filter(Boolean)

      if (segChunks.length === 0) return null

      const scores = segChunks.map((c) => c.insightScore ?? 0)
      const totalScore = scores.reduce((a, b) => a + b, 0) / scores.length

      const seg: TopicSegment = {
        chunks: segChunks,
        topicHint: g.title,
        timeRange: [segChunks[0].startTs, segChunks[segChunks.length - 1].endTs] as [string, string],
        totalScore,
      }
      if (g.project != null) seg.project = g.project
      return seg
    })

  return segments.filter((s): s is TopicSegment => s !== null)
}
