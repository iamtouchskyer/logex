import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'

/**
 * publish.ts — Deterministic publish pipeline for logex articles.
 *
 * Code handles: reading index, writing files, upsert mechanics.
 * LLM handles: deciding which new articles match existing ones.
 *
 * Two modes:
 *   1. `prepare-match` — reads index + new articles, outputs a matchingPrompt
 *      for the LLM to decide upsert/insert per article.
 *   2. `execute` — takes the LLM's matching decisions and writes files.
 *
 * Usage:
 *   # Step 1: get matching prompt
 *   npx tsx src/pipeline/publish.ts prepare-match \
 *     --data-dir ~/Code/logex-data \
 *     --session-id abc123 \
 *     --articles /tmp/articles.json
 *
 *   # Step 2: LLM executes the prompt, outputs matching decisions
 *
 *   # Step 3: execute publish
 *   npx tsx src/pipeline/publish.ts execute \
 *     --data-dir ~/Code/logex-data \
 *     --session-id abc123 \
 *     --articles /tmp/articles.json \
 *     --decisions /tmp/decisions.json
 */

// ─── Types ────────────────────────────────────────────────────────────
// Note: SessionArticle in types.ts defines the canonical article shape.
// Types below are publish-specific (CLI I/O concerns).

interface NewArticle {
  title: string
  summary: string
  body: string
  tags: string[]
  project?: string
  chunkIndices: number[]
  slug?: string  // LLM-suggested slug, optional
  stats?: Record<string, unknown>  // optional stats from prepare output
}

interface ExistingArticleMeta {
  slug: string
  title: string
  sessionId?: string
  chunkIndices?: number[]
  path?: string
  [key: string]: unknown
}

interface IndexFile {
  articles: ExistingArticleMeta[]
  lastUpdated: string
}

interface MatchDecision {
  newIndex: number           // 0-based index into new articles array
  action: 'update' | 'insert'
  existingSlug?: string      // which existing article to update (if action=update)
}

// ─── Helpers ──────────────────────────────────────────────────────────

function loadIndex(dataDir: string): IndexFile {
  const indexPath = join(dataDir, 'index.json')
  if (!existsSync(indexPath)) {
    return { articles: [], lastUpdated: '' }
  }
  return JSON.parse(readFileSync(indexPath, 'utf-8'))
}

function generateSlug(article: NewArticle, sessionId: string, index: number, date: string): string {
  // Use LLM-suggested slug if present
  if (article.slug && article.slug.length > 10) {
    // Ensure date prefix
    if (!article.slug.startsWith(date)) {
      return `${date}-${article.slug}`
    }
    return article.slug
  }
  // Fallback: date + sessionId prefix + index
  return `${date}-${sessionId.slice(0, 8)}-article-${index + 1}`
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── prepare-match ───────────────────────────────────────────────────

function prepareMatch(dataDir: string, sessionId: string, articlesPath: string): void {
  const index = loadIndex(dataDir)
  const newArticles: NewArticle[] = JSON.parse(readFileSync(articlesPath, 'utf-8'))

  // Find existing articles from same session
  const existing = index.articles.filter(
    (a) => a.sessionId === sessionId && a.chunkIndices && a.chunkIndices.length > 0
  )

  if (existing.length === 0) {
    // No existing articles for this session — all inserts, no LLM needed
    const decisions: MatchDecision[] = newArticles.map((_, i) => ({
      newIndex: i,
      action: 'insert' as const,
    }))
    console.log(JSON.stringify({
      needsLlm: false,
      decisions,
      matchingPrompt: null,
    }))
    return
  }

  // Build matching prompt for LLM
  const existingDesc = existing.map((a, i) => {
    const ci = (a.chunkIndices ?? []).join(', ')
    return `  [E${i}] slug: ${a.slug} | title: "${a.title}" | chunkIndices: [${ci}]`
  }).join('\n')

  const newDesc = newArticles.map((a, i) => {
    const ci = a.chunkIndices.join(', ')
    return `  [N${i}] title: "${a.title}" | chunkIndices: [${ci}]`
  }).join('\n')

  const prompt = `你是一个文章匹配器。下面有两组文章：

## 已发布的文章（来自同一个 session ${sessionId}）

${existingDesc}

## 新生成的文章

${newDesc}

## 任务

判断每篇新文章应该 **更新** 已有文章还是 **新增**。

匹配标准（按优先级）：
1. chunkIndices 有显著重叠（交集 > 较小集合的 50%）→ 很可能是同一篇的更新版
2. 标题/主题相似 + 部分 chunk 重叠 → 也是更新
3. 没有任何重叠 → 新增

## 输出格式（JSON）

\`\`\`json
{
  "decisions": [
    { "newIndex": 0, "action": "update", "existingSlug": "2026-04-14-xxx" },
    { "newIndex": 1, "action": "insert" }
  ]
}
\`\`\`

每篇新文章必须恰好出现一次。只输出 JSON。`

  console.log(JSON.stringify({
    needsLlm: true,
    decisions: null,
    matchingPrompt: prompt,
    existingCount: existing.length,
    newCount: newArticles.length,
  }))
}

// ─── execute ─────────────────────────────────────────────────────────

function execute(
  dataDir: string,
  sessionId: string,
  articlesPath: string,
  decisionsPath: string,
): void {
  const index = loadIndex(dataDir)
  const newArticles: NewArticle[] = JSON.parse(readFileSync(articlesPath, 'utf-8'))
  const decisionsRaw = JSON.parse(readFileSync(decisionsPath, 'utf-8'))
  const decisions: MatchDecision[] = decisionsRaw.decisions ?? decisionsRaw

  const date = today()
  const results: Array<{ slug: string; action: string; title: string }> = []

  for (const dec of decisions) {
    const article = newArticles[dec.newIndex]
    if (!article) {
      console.error(`Warning: newIndex ${dec.newIndex} out of range, skipping`)
      continue
    }

    if (dec.action === 'update' && dec.existingSlug) {
      // ── UPDATE: overwrite existing article, keep slug & path ──
      const existingIdx = index.articles.findIndex((a) => a.slug === dec.existingSlug)
      if (existingIdx === -1) {
        console.error(`Warning: existing slug "${dec.existingSlug}" not found, treating as insert`)
        dec.action = 'insert'
      } else {
        const existing = index.articles[existingIdx]
        if (!existing.path) {
          console.error(`Warning: existing slug "${dec.existingSlug}" has no path, treating as insert`)
          dec.action = 'insert'
        } else {
        const filePath = join(dataDir, existing.path)

        const articleData = {
          slug: existing.slug,
          title: article.title,
          summary: article.summary,
          body: article.body,
          heroImage: (existing as any).heroImage ?? '',
          tags: article.tags,
          sessionId,
          chunkIndices: article.chunkIndices,
          project: article.project ?? '',
          date: existing.slug.slice(0, 10), // preserve original date
          duration: '',
          stats: {},
        }

        // Read existing to preserve stats/heroImage/duration
        if (existsSync(filePath)) {
          try {
            const old = JSON.parse(readFileSync(filePath, 'utf-8'))
            articleData.heroImage = old.heroImage ?? articleData.heroImage
            articleData.stats = old.stats ?? {}
            articleData.duration = old.duration ?? ''
          } catch { /* ignore */ }
        }

        mkdirSync(dirname(filePath), { recursive: true })
        writeFileSync(filePath, JSON.stringify(articleData, null, 2))

        // Update index entry
        index.articles[existingIdx] = {
          ...existing,
          title: article.title,
          summary: article.summary,
          tags: article.tags,
          chunkIndices: article.chunkIndices,
          project: article.project ?? existing.project,
        }

        results.push({ slug: existing.slug, action: 'updated', title: article.title })
        continue
        }
      }
    }

    // ── INSERT: new article ──
    const slug = generateSlug(article, sessionId, dec.newIndex, date)
    const dateParts = slug.slice(0, 10).split('-')
    const relPath = `${dateParts[0]}/${dateParts[1]}/${dateParts[2]}/${slug}.json`
    const filePath = join(dataDir, relPath)

    const articleData = {
      slug,
      title: article.title,
      summary: article.summary,
      body: article.body,
      heroImage: '',
      tags: article.tags,
      sessionId,
      chunkIndices: article.chunkIndices,
      project: article.project ?? '',
      date: slug.slice(0, 10),
      duration: '',
      stats: article.stats ?? {},
    }

    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(articleData, null, 2))

    index.articles.push({
      slug,
      title: article.title,
      summary: article.summary,
      date: slug.slice(0, 10),
      tags: article.tags,
      project: article.project,
      chunkIndices: article.chunkIndices,
      sessionId,
      heroImage: '',
      path: relPath,
    })

    results.push({ slug, action: 'inserted', title: article.title })
  }

  // Sort by date desc, deduplicate
  index.articles.sort((a, b) => (b.slug > a.slug ? 1 : -1))
  const seen = new Set<string>()
  index.articles = index.articles.filter((a) => {
    if (seen.has(a.slug)) return false
    seen.add(a.slug)
    return true
  })
  index.lastUpdated = date

  writeFileSync(join(dataDir, 'index.json'), JSON.stringify(index, null, 2))

  // Output results
  console.log(JSON.stringify({ results, totalArticles: index.articles.length }))
}

// ─── CLI ─────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  function getArg(name: string): string {
    const idx = args.indexOf(`--${name}`)
    if (idx === -1 || !args[idx + 1]) {
      console.error(`Missing required argument: --${name}`)
      process.exit(1)
    }
    return args[idx + 1]
  }

  if (command === 'prepare-match') {
    prepareMatch(
      getArg('data-dir'),
      getArg('session-id'),
      getArg('articles'),
    )
  } else if (command === 'execute') {
    execute(
      getArg('data-dir'),
      getArg('session-id'),
      getArg('articles'),
      getArg('decisions'),
    )
  } else {
    console.error('Usage:')
    console.error('  npx tsx src/pipeline/publish.ts prepare-match --data-dir <dir> --session-id <id> --articles <path>')
    console.error('  npx tsx src/pipeline/publish.ts execute --data-dir <dir> --session-id <id> --articles <path> --decisions <path>')
    process.exit(1)
  }
}

main()
