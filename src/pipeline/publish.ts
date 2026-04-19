import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import type { Lang } from './types'

/**
 * publish.ts — Deterministic publish pipeline for logex articles.
 *
 * Code handles: reading index, writing files, upsert mechanics.
 * LLM handles: (a) deciding which new articles match existing ones,
 *              (b) generating primary-language article + translation.
 *
 * i18n note: every article has a `lang` field (primary language) and an
 * optional `translations` map keyed by other Lang. publish.ts writes one
 * file per language as `<slug>.<lang>.json` and emits an index entry with
 * `primaryLang` + `i18n: Partial<Record<Lang, { title, summary, path }>>`.
 *
 * Two modes:
 *   1. `prepare-match` — reads index + new articles, outputs a matchingPrompt
 *      for the LLM to decide upsert/insert per article.
 *   2. `execute` — takes the LLM's matching decisions and writes files.
 *
 * Usage:
 *   npx tsx src/pipeline/publish.ts prepare-match \
 *     --data-dir ~/Code/logex-data \
 *     --session-id abc123 \
 *     --articles /tmp/articles.json
 *
 *   npx tsx src/pipeline/publish.ts execute \
 *     --data-dir ~/Code/logex-data \
 *     --session-id abc123 \
 *     --articles /tmp/articles.json \
 *     --decisions /tmp/decisions.json
 */

// ─── Types ────────────────────────────────────────────────────────────

interface LangContent {
  title: string
  summary: string
  body: string
}

interface NewArticle {
  title: string
  summary: string
  body: string
  /** Primary (source-of-truth) language for this article. Defaults to 'zh'. */
  lang?: Lang
  /** Optional translations keyed by target language. */
  translations?: Partial<Record<Lang, LangContent>>
  tags: string[]
  project?: string
  chunkIndices: number[]
  slug?: string
  stats?: Record<string, unknown>
}

interface LangMeta {
  title: string
  summary: string
  path: string
}

interface ExistingArticleMeta {
  slug: string
  // Legacy flat shape:
  title?: string
  summary?: string
  path?: string
  // New i18n shape:
  primaryLang?: Lang
  i18n?: Partial<Record<Lang, LangMeta>>
  // Common:
  date?: string
  sessionId?: string
  chunkIndices?: number[]
  tags?: string[]
  project?: string
  heroImage?: string
  duration?: string
  stats?: Record<string, unknown>
  [key: string]: unknown
}

interface IndexFile {
  articles: ExistingArticleMeta[]
  lastUpdated: string
}

interface MatchDecision {
  newIndex: number
  action: 'update' | 'insert'
  existingSlug?: string
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
  if (article.slug && article.slug.length > 10) {
    // Idempotent: if slug already has ANY YYYY-MM-DD- prefix, return as-is
    if (/^\d{4}-\d{2}-\d{2}-/.test(article.slug)) {
      return article.slug
    }
    return `${date}-${article.slug}`
  }
  return `${date}-${sessionId.slice(0, 8)}-article-${index + 1}`
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Build the on-disk relative path for a (slug, lang) pair.
 * Always language-suffixed now: `YYYY/MM/DD/<slug>.<lang>.json`.
 */
function articlePath(slug: string, lang: Lang): string {
  const parts = slug.slice(0, 10).split('-')
  return `${parts[0]}/${parts[1]}/${parts[2]}/${slug}.${lang}.json`
}

/**
 * Collect (lang, content) pairs from an article: primary + all translations.
 * Primary first.
 */
function enumerateLangContent(article: NewArticle): Array<{ lang: Lang; content: LangContent }> {
  const primary: Lang = article.lang ?? 'zh'
  const out: Array<{ lang: Lang; content: LangContent }> = [
    {
      lang: primary,
      content: { title: article.title, summary: article.summary, body: article.body },
    },
  ]
  if (article.translations) {
    for (const [lang, content] of Object.entries(article.translations) as Array<[Lang, LangContent]>) {
      if (lang === primary) continue  // primary already added
      if (!content) continue
      out.push({ lang, content })
    }
  }
  return out
}

// ─── prepare-match ───────────────────────────────────────────────────

function prepareMatch(dataDir: string, sessionId: string, articlesPath: string): void {
  const index = loadIndex(dataDir)
  const newArticles: NewArticle[] = JSON.parse(readFileSync(articlesPath, 'utf-8'))

  const existing = index.articles.filter(
    (a) => a.sessionId === sessionId && a.chunkIndices && a.chunkIndices.length > 0
  )

  if (existing.length === 0) {
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

  const existingDesc = existing.map((a, i) => {
    const ci = (a.chunkIndices ?? []).join(', ')
    // Support both legacy (title at top) and new (i18n[primaryLang].title) shapes
    const title = a.title
      ?? (a.primaryLang ? a.i18n?.[a.primaryLang]?.title : undefined)
      ?? '(untitled)'
    return `  [E${i}] slug: ${a.slug} | title: "${title}" | chunkIndices: [${ci}]`
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
  const results: Array<{ slug: string; action: string; title: string; langs: Lang[] }> = []

  for (const dec of decisions) {
    const article = newArticles[dec.newIndex]
    if (!article) {
      console.error(`Warning: newIndex ${dec.newIndex} out of range, skipping`)
      continue
    }

    const primaryLang: Lang = article.lang ?? 'zh'
    const langContents = enumerateLangContent(article)

    // Will be resolved below.
    let slug: string
    let articleDate: string
    let preservedHeroImage = ''
    let preservedStats: Record<string, unknown> = (article.stats as Record<string, unknown>) ?? {}
    let preservedDuration = ''
    let isUpdate = false
    let existingIdx = -1

    if (dec.action === 'update' && dec.existingSlug) {
      existingIdx = index.articles.findIndex((a) => a.slug === dec.existingSlug)
      if (existingIdx === -1) {
        console.error(`Warning: existing slug "${dec.existingSlug}" not found, treating as insert`)
      } else {
        const existing = index.articles[existingIdx]
        slug = existing.slug
        articleDate = existing.date ?? existing.slug.slice(0, 10)
        preservedHeroImage = (existing.heroImage as string) ?? ''
        preservedDuration = (existing.duration as string) ?? ''
        isUpdate = true

        // Try to read an existing body file to recover heroImage/stats/duration.
        // Try new-schema path first, then legacy flat path.
        const candidatePaths: string[] = []
        const i18nEntries = existing.i18n ?? {}
        for (const meta of Object.values(i18nEntries)) {
          if (meta?.path) candidatePaths.push(meta.path)
        }
        if (existing.path) candidatePaths.push(existing.path)

        for (const p of candidatePaths) {
          const abs = join(dataDir, p)
          if (!existsSync(abs)) continue
          try {
            const old = JSON.parse(readFileSync(abs, 'utf-8'))
            preservedHeroImage = old.heroImage ?? preservedHeroImage
            preservedStats = old.stats ?? preservedStats
            preservedDuration = old.duration ?? preservedDuration
            break
          } catch { /* ignore */ }
        }
      }
    }

    if (!isUpdate) {
      slug = generateSlug(article, sessionId, dec.newIndex, date)
      articleDate = slug.slice(0, 10)
    }

    // Write one file per language.
    const i18nMap: Partial<Record<Lang, LangMeta>> = {}
    for (const { lang, content } of langContents) {
      const relPath = articlePath(slug!, lang)
      const absPath = join(dataDir, relPath)

      const articleData = {
        slug: slug!,
        lang,
        title: content.title,
        summary: content.summary,
        body: content.body,
        heroImage: preservedHeroImage,
        tags: article.tags,
        sessionId,
        chunkIndices: article.chunkIndices,
        project: article.project ?? '',
        date: articleDate!,
        duration: preservedDuration,
        stats: preservedStats,
      }

      mkdirSync(dirname(absPath), { recursive: true })
      writeFileSync(absPath, JSON.stringify(articleData, null, 2))

      i18nMap[lang] = {
        title: content.title,
        summary: content.summary,
        path: relPath,
      }
    }

    // Compose index entry (new i18n schema).
    const entry: ExistingArticleMeta = {
      slug: slug!,
      date: articleDate!,
      project: article.project ?? '',
      tags: article.tags,
      sessionId,
      heroImage: preservedHeroImage,
      chunkIndices: article.chunkIndices,
      duration: preservedDuration,
      stats: preservedStats as Record<string, unknown>,
      primaryLang,
      i18n: i18nMap,
    }

    if (isUpdate && existingIdx !== -1) {
      // Merge: keep any pre-existing translations that the new article didn't re-emit
      const existing = index.articles[existingIdx]
      const mergedI18n: Partial<Record<Lang, LangMeta>> = { ...(existing.i18n ?? {}) }
      for (const [lang, meta] of Object.entries(i18nMap) as Array<[Lang, LangMeta]>) {
        mergedI18n[lang] = meta
      }
      entry.i18n = mergedI18n
      // Preserve primaryLang if already set on existing and not overridden
      entry.primaryLang = article.lang ?? existing.primaryLang ?? primaryLang
      index.articles[existingIdx] = entry
      results.push({
        slug: slug!,
        action: 'updated',
        title: article.title,
        langs: Object.keys(mergedI18n) as Lang[],
      })
    } else {
      index.articles.push(entry)
      results.push({
        slug: slug!,
        action: 'inserted',
        title: article.title,
        langs: Object.keys(i18nMap) as Lang[],
      })
    }
  }

  // Sort by date desc, deduplicate by slug
  index.articles.sort((a, b) => (b.slug > a.slug ? 1 : -1))
  const seen = new Set<string>()
  index.articles = index.articles.filter((a) => {
    if (seen.has(a.slug)) return false
    seen.add(a.slug)
    return true
  })
  index.lastUpdated = date

  writeFileSync(join(dataDir, 'index.json'), JSON.stringify(index, null, 2))

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
