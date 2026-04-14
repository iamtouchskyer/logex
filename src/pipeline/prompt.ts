import type { Chunk } from './types'

/**
 * Build the article prompt from filtered chunks.
 * Produces a prompt for writing a full session paper (blog article).
 */
export function buildArticlePrompt(
  chunks: Chunk[],
  sessionId: string,
  meta: { entries: number; messages: number; chunks: number; startTime: string; endTime: string },
  maxTotalChars = 50000,
): string {
  const sorted = [...chunks].sort(
    (a, b) => (b.insightScore ?? 0) - (a.insightScore ?? 0),
  )

  const selected: { chunk: Chunk; convText: string }[] = []
  let totalChars = 0

  for (const chunk of sorted) {
    const convText = chunk.messages
      .filter((m) => !m.isToolOutput)
      .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.text.slice(0, 2000)}`)
      .join('\n')

    if (totalChars + convText.length > maxTotalChars) break
    selected.push({ chunk, convText })
    totalChars += convText.length
  }

  const segments = selected.map(
    ({ chunk, convText }, i) =>
      `### Segment ${i + 1} (score: ${(chunk.insightScore ?? 0).toFixed(2)})\n${convText}`,
  )

  const transcript = segments.join('\n\n---\n\n')

  return `Write a session paper (blog article) summarizing this AI coding session.

## Structure
- **Title**: Concise, descriptive (Chinese OK, technical terms in English)
- **Summary**: 2-3 sentences capturing what was accomplished and key decisions
- **Body**: Full markdown article with these sections:
  - 🎯 目标 — What the session set out to do
  - 🛠️ 过程 — Narrative of what happened (decisions, problems, solutions)
  - 💡 关键洞察 — Non-obvious things learned
  - 📊 成果 — What was delivered
  - 🔮 Next Steps — What's left to do
- **Tags**: 3-8 relevant tags
- **Project**: Primary project name

## Rules
- Write in the session's language (Chinese + English technical terms)
- Be specific — include file paths, command outputs, error messages where relevant
- Focus on WHY decisions were made, not just WHAT was done
- Include code snippets if they illustrate a key point
- Tone: technical blog post, not academic paper

## Output format (JSON)
\`\`\`json
{
  "title": "...",
  "summary": "...",
  "body": "... (markdown) ...",
  "tags": ["..."],
  "project": "..."
}
\`\`\`

## Session metadata
- Session ID: ${sessionId}
- Entries: ${meta.entries}
- Messages: ${meta.messages}
- Chunks: ${meta.chunks}
- Time range: ${meta.startTime} → ${meta.endTime}

## Session transcript

${transcript}

Write the session paper now. Output ONLY the JSON object.`
}

/**
 * Build the extraction prompt from filtered chunks.
 * Sorts by score descending, packs within a character budget.
 */
export function buildExtractionPrompt(
  chunks: Chunk[],
  sessionId: string,
  maxTotalChars = 30000,
): string {
  const sorted = [...chunks].sort(
    (a, b) => (b.insightScore ?? 0) - (a.insightScore ?? 0),
  )

  const selected: { chunk: Chunk; convText: string }[] = []
  let totalChars = 0

  for (const chunk of sorted) {
    const convText = chunk.messages
      .filter((m) => !m.isToolOutput)
      .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.text.slice(0, 1000)}`)
      .join('\n')

    if (totalChars + convText.length > maxTotalChars) break
    selected.push({ chunk, convText })
    totalChars += convText.length
  }

  const segments = selected.map(
    ({ chunk, convText }, i) =>
      `### Segment ${i + 1} (score: ${(chunk.insightScore ?? 0).toFixed(2)})\n${convText}`,
  )

  const transcript = segments.join('\n\n---\n\n')

  return `Extract card-worthy insights from this AI coding session.

## Rules
- ATOMIC: one insight per card
- SELECTIVE: only genuinely useful insights (quality > quantity)
- Categories: GOTCHA (non-obvious trap), PATTERN (reusable technique), DECISION (arch choice + rationale), DISCOVERY (new capability learned)
- Confidence 0.0-1.0, only output >= 0.7
- Write in session language (Chinese + English technical terms)
- Format as YAML list

## Output format
\`\`\`yaml
- slug: "kebab-case-english"
  category: "GOTCHA"
  confidence: 0.85
  title: "Title here"
  body: |
    Body with context. Use [[links]] for related concepts.
  tags: ["tag1", "tag2"]
\`\`\`

## Session: ${sessionId}

${transcript}

Extract insights now. Zero insights is fine if nothing is card-worthy.`
}
