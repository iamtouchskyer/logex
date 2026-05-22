import type { Chunk, Lang, SessionArticle, TopicSegment } from './types'

interface ArticlePromptOptions {
  segment?: TopicSegment
  maxTotalChars?: number
  /** Target language for the generated article. Defaults to 'zh' for backward compat. */
  lang?: Lang
}

/**
 * Build the article prompt from filtered chunks.
 * Produces a prompt for writing a full session paper (blog article) in the
 * requested language. If segment is provided, adds project and topic hint
 * for focus.
 */
export function buildArticlePrompt(
  chunks: Chunk[],
  sessionId: string,
  meta: { entries: number; messages: number; chunks: number; startTime: string; endTime: string },
  options?: ArticlePromptOptions,
): string {
  const maxTotalChars = options?.maxTotalChars ?? 50000
  const segment = options?.segment
  const lang: Lang = options?.lang ?? 'zh'

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

  const metaBlock = `## Session metadata
- Session ID: ${sessionId}
- Entries: ${meta.entries}
- Messages: ${meta.messages}
- Chunks: ${meta.chunks}
- Time range: ${meta.startTime} → ${meta.endTime}
${segment ? `- Project: ${segment.project ?? 'unknown'}\n- Topic: ${segment.topicHint}\n- Segment time: ${segment.timeRange[0]} → ${segment.timeRange[1]}` : ''}`

  if (lang === 'en') {
    return buildEnArticlePrompt(transcript, metaBlock)
  }
  return buildZhArticlePrompt(transcript, metaBlock)
}

// ---------------------------------------------------------------------------
// Chinese (zh) article prompt — the original, preserved verbatim
// ---------------------------------------------------------------------------
function buildZhArticlePrompt(transcript: string, metaBlock: string): string {
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
  "body": "完整的 markdown 文章（5000-9000 个非空白字符；低于 5000 会被 publish gate 拒绝）",
  "tags": ["tag1", "tag2", ...],
  "project": "primary-project-name"
}
\`\`\`

${metaBlock}

## Session transcript

${transcript}

写文章。只输出 JSON object，不要其他内容。`
}

// ---------------------------------------------------------------------------
// English (en) article prompt — parallel rewrite, NOT a translation of the zh
// prompt. Same voice, same anti-patterns, same JSON shape.
// ---------------------------------------------------------------------------
function buildEnArticlePrompt(transcript: string, metaBlock: string): string {
  return `You are a technical blogger. Your voice borrows from real engineering writing — direct, opinionated, specific.

## Voice reference

**Opening**: Always start with a concrete scene or problem, never an abstract summary. Drop the reader into the moment.
- ✅ "The first time I noticed the AI review was phoning it in, it had just said 'Code looks correct.'"
- ✅ "Anyone who uses an AI coding agent has had this moment: you spend twenty minutes in session A teaching the agent a bug pattern..."
- ❌ "This post introduces how we built Session Brain..."
- ❌ "Using an OPC loop, we completed the following in a single session..."

**Have a spine**: Take positions. Say "this is over-engineered", "I'm not going to pretend this is a breakthrough", "that isn't a bug — you can't fix an architectural property". No hedge-everything prose.

**Be honest**: Show trade-offs. Admit what didn't work. "OPC found fewer code bugs — but it caught five things Claude was blind to." Don't only write the success case.

**Structured but not mechanical**: Use \`##\` headings, but let sections flow as narrative. Use \`---\` for visual breathing room. Code blocks, diagrams, and tables live *inside* the narrative, not piled at the bottom.

**Keep technical terms in their native form**: Don't translate or rename known terms — \`context window\`, \`pre-commit hook\`, \`session\`, \`pipeline\`, \`rubric\`, \`OAuth\`, \`JWT\` stay as-is. Technical vocabulary is a shared dialect; translating it breaks the handshake.

**A little warmth**: Occasional first-person voice — "the lazy path is the only one I'll actually use", "this one was dragged out of me by a failure mode". Not a cold spec sheet.

**Be specific**: Give file paths, error messages, numbers. "67 vitest unit tests and 12 Playwright E2E tests" beats "comprehensive test coverage" ten times over.

## Anti-patterns (hard bans)

- No emoji in section headings (❌ "🎯 Goals", "🛠️ Process"). Use plain \`##\` titles.
- No bullet-list summaries pretending to be content (❌ "Ported pipeline, built UI, wrote tests, deployed."). Write narrative.
- No throat-clearing openings (❌ "In this post...", "This article describes..."). Drop us into the story.
- No generic praise (❌ "this is a great approach"). Say *why* it's good — or where it's weak.
- Don't fake perfection. If the session pivoted mid-way, fell into a trap, or made a compromise — write it. That's the value.

## Task

From the session transcript below, write one technical blog post.

**Article shape (reference, not a rigid template)**:
1. Opening: one concrete scene (pick the most dramatic moment in the transcript).
2. Context: why this matters.
3. Narrative: how it went, including wrong turns, reversals, gotchas.
4. Key insights: what's actually worth remembering, in hindsight.
5. Close: honest verdict + what's next.

**Don't literally copy those section names. Let the content drive the structure.**

## Output format (JSON)
\`\`\`json
{
  "title": "One-line title with a hook",
  "summary": "2-3 sentences, reads like a blog meta description that makes you want to click",
  "body": "Full markdown article (1500-3000 words; below 1500 is rejected by the publish gate)",
  "tags": ["tag1", "tag2", ...],
  "project": "primary-project-name"
}
\`\`\`

${metaBlock}

## Session transcript

${transcript}

Write the article. Output only the JSON object — nothing else.`
}

// ---------------------------------------------------------------------------
// Translation + rewrite prompt.
// The goal is NOT a literal translation — it's a parallel-voice rewrite
// that preserves structure, code, paths, and numbers but reads natively in
// the target language.
// ---------------------------------------------------------------------------
export interface TranslatableArticle {
  title: string
  summary: string
  body: string
  tags: string[]
  project?: string
}

export function buildTranslateRewritePrompt(
  source: TranslatableArticle,
  sourceLang: Lang,
  targetLang: Lang,
): string {
  if (sourceLang === targetLang) {
    throw new Error(`buildTranslateRewritePrompt: source and target are both ${sourceLang}`)
  }

  const langNameEn = targetLang === 'en' ? 'English' : 'Chinese'
  const langNameCn = targetLang === 'en' ? '英文' : '中文'
  const sourceNameEn = sourceLang === 'en' ? 'English' : 'Chinese'

  const header = targetLang === 'en'
    ? `You are rewriting a technical blog article from ${sourceNameEn} into ${langNameEn}.
This is a REWRITE, not a translation — the result must read like it was written natively in ${langNameEn}.`
    : `你要把一篇技术博客从${sourceNameEn === 'English' ? '英文' : '中文'}改写成${langNameCn}。
这是**改写**不是翻译 —— 最终读起来必须像原生${langNameCn}写的。`

  const rules = `## Hard rules

1. Keep ALL of the following **unchanged, character-for-character**:
   - Code blocks (\`\`\`...\`\`\`) and inline code (\`...\`)
   - File paths (e.g. \`src/pipeline/publish.ts\`)
   - Command-line invocations
   - Error messages and log lines
   - Numbers and URLs
   - Names of libraries, frameworks, commands, and products (React, Playwright, vitest, Claude, OPC, Vercel, etc.)

2. **Don't translate technical terms that are conventionally English**, even in Chinese prose:
   session, pipeline, prompt, rubric, hook, token, cache, JWT, OAuth, context window,
   pre-commit, E2E, CI, SDK, MCP, subagent, chunk, retry, fallback, schema, API.
   (In English prose these already are English; leave them be.)

3. **Title must be rewritten with a hook**, not mechanically translated. Find a
   phrasing that works natively in the target language. Same energy, different words.

4. **Preserve the markdown structure**: same \`##\` sections, same ordering of
   code blocks and tables, same \`---\` separators. Section headings should be
   rewritten to read naturally in the target language.

5. **Keep the voice**: specific, opinionated, warm, honest about trade-offs.
   If the source hedges, the rewrite hedges. If the source is blunt, the rewrite is blunt.

6. \`tags\` are internal identifiers — **do not translate**. Return them unchanged.

7. \`project\` is a project key — **do not translate**. Return unchanged (or omitted if absent).

## Output format (JSON only, no prose)
\`\`\`json
{
  "title": "...",
  "summary": "...",
  "body": "...",
  "tags": [...],
  "project": "..."
}
\`\`\`

Output only the JSON object.`

  const sourcePayload = `## Source article (${sourceNameEn})

### title
${source.title}

### summary
${source.summary}

### tags
${JSON.stringify(source.tags)}

### project
${source.project ?? ''}

### body
${source.body}`

  return `${header}

${rules}

${sourcePayload}`
}

/**
 * Narrow helper: convert a full SessionArticle into the minimal
 * TranslatableArticle shape used by the translation prompt.
 */
export function toTranslatable(a: SessionArticle): TranslatableArticle {
  return {
    title: a.title,
    summary: a.summary,
    body: a.body,
    tags: a.tags,
    project: a.project,
  }
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
