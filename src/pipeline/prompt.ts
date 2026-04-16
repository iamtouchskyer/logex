import type { Chunk, TopicSegment } from './types'

/**
 * Build the article prompt from filtered chunks.
 * Produces a prompt for writing a full session paper (blog article).
 * If segment is provided, adds project and topic hint for focus.
 */
export function buildArticlePrompt(
  chunks: Chunk[],
  sessionId: string,
  meta: { entries: number; messages: number; chunks: number; startTime: string; endTime: string },
  options?: { segment?: TopicSegment; maxTotalChars?: number },
): string {
  const maxTotalChars = options?.maxTotalChars ?? 50000
  const segment = options?.segment
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

  return `你是一个技术博客作者。你的写作风格参考以下真实博客：

## 写作风格参考

**开头**：永远以一个具体场景或问题开始，不是抽象总结。让读者一秒代入。
- ✅ "第一次发现 AI review 在偷懒，是在它说了一句 'Code looks correct' 之后。"
- ✅ "每个用 AI coding agent 的人都遇到过这个场景：你在 session A 花了 20 分钟教 agent 一个 bug pattern..."
- ❌ "本文介绍了我们如何构建 Session Brain..."
- ❌ "用 OPC loop 驱动，在一个 session 里完成了..."

**有观点、有 spine**：敢下判断，敢说"这是过度工程"、"我不会假装这是什么突破"、"这不是 bug，你没法 fix 一个架构特性"。不要四平八稳的废话。

**诚实**：展示 trade-off，承认不完美。"OPC 找的 code bug 更少——但抓到了 5 个 Claude 完全看不到的东西"。不要只说好的。

**有结构但不机械**：用 ## 分段，但每个 section 之间有叙事逻辑，不是并列 bullet list。用 --- 做视觉呼吸。代码块、架构图、表格穿插在叙事中，不是堆在最后。

**中英混排自然**：技术名词英文（context window、satisfice、attention decay、pre-commit hooks），叙事中文。不翻译专有名词。

**有温度**：偶尔有个人口吻 — "省事 = 会真正用起来"、"被 failure mode 逼出来的"。不是冷冰冰的文档。

**具体**：给 file path、给 error message、给数字。"67 个 vitest 单元测试 + 12 个 Playwright E2E 测试"比"全面的测试覆盖"好 10 倍。

## Anti-patterns（绝对不要）

- 不要用 emoji 做 section header（❌ "🎯 目标"、"🛠️ 过程"）。用正常的 ## 标题。
- 不要写 bullet list 摘要（❌ "包括 pipeline 移植、UI 构建、测试、部署"）。写有温度的叙事。
- 不要总结式开头（❌ "本文介绍..."、"这篇文章讲述了..."）。
- 不要 generic praise（❌ "这是一个很好的方案"）。说为什么好，或者说哪里不够好。
- 不要假装完美。如果 session 中途改了方向、踩了坑、做了妥协——写出来，那才是有价值的。

## Task

基于下面的 session transcript，写一篇技术博客文章。

**文章结构（参考，不是死板模板）**：
1. 开头：一个具体场景引入（从 transcript 里找最有戏剧性的瞬间）
2. 背景：为什么要做这件事
3. 过程叙事：怎么做的（包括走弯路、改方向、踩坑）
4. 关键 insight：做完之后回头看，最值得记住的几件事
5. 结尾：诚实评价 + 下一步

**不要照搬上面的 section 名称。根据内容自然分段。**

## Output format (JSON)
\`\`\`json
{
  "title": "一句话标题，要有hook感",
  "summary": "2-3 句话，像 blog 的 description meta tag，让人想点进来",
  "body": "完整的 markdown 文章（1500-3000 字）",
  "tags": ["tag1", "tag2", ...],
  "project": "primary-project-name"
}
\`\`\`

## Session metadata
- Session ID: ${sessionId}
- Entries: ${meta.entries}
- Messages: ${meta.messages}
- Chunks: ${meta.chunks}
- Time range: ${meta.startTime} → ${meta.endTime}
${segment ? `- Project: ${segment.project ?? 'unknown'}\n- Topic: ${segment.topicHint}\n- Segment time: ${segment.timeRange[0]} → ${segment.timeRange[1]}` : ''}

## Session transcript

${transcript}

写文章。只输出 JSON object，不要其他内容。`
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
