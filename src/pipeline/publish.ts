import { readFileSync } from 'node:fs'
import { Octokit } from '@octokit/rest'
import { resolveGitHubToken } from '../lib/github-token.js'
import type { Lang } from './types.js'
import { generateHeroImage } from './hero.js'

/**
 * publish.ts — Deterministic publish pipeline for logex articles.
 *
 * Writes article JSONs + optional hero images + updated index.json directly
 * to `iamtouchskyer/logex-data` on GitHub via the Contents/Git API as a
 * single atomic commit per run. No local working copy, no shell git.
 *
 * Modes:
 *   1. `prepare-match` — reads remote index + local new articles, outputs a
 *      matching prompt for the LLM to decide upsert/insert.
 *   2. `execute` — takes the LLM's matching decisions and commits files.
 *
 * Usage:
 *   npx tsx src/pipeline/publish.ts prepare-match \
 *     --session-id abc123 \
 *     --articles /tmp/articles.json
 *
 *   npx tsx src/pipeline/publish.ts execute \
 *     --session-id abc123 \
 *     --articles /tmp/articles.json \
 *     --decisions /tmp/decisions.json
 */

// ─── Constants ───────────────────────────────────────────────────────

export const DATA_REPO_OWNER = 'iamtouchskyer'
export const DATA_REPO_NAME = 'logex-data'
export const DATA_REPO_BRANCH = 'main'
export const MAX_BLOB_BYTES = 90 * 1024 * 1024
export const MAX_REF_RETRIES = 3

// ─── Errors ──────────────────────────────────────────────────────────

export class BlobTooLargeError extends Error {
  constructor(path: string, size: number) {
    super(`Blob at ${path} is ${size} bytes, exceeds ${MAX_BLOB_BYTES} limit`)
    this.name = 'BlobTooLargeError'
  }
}

export class SHAConflictError extends Error {
  constructor() {
    super(
      'upstream index.json changed — try again (ref updateRef returned 409 after max retries)',
    )
    this.name = 'SHAConflictError'
  }
}

export class BilingualRequiredError extends Error {
  constructor(articleIndex: number, title: string, primary: Lang, missing: Lang) {
    super(
      `Article [${articleIndex}] "${title}" has primaryLang="${primary}" `
      + `but is missing required "${missing}" translation (title/summary/body). `
      + `Bilingual is mandatory for zh-primary articles — never emit monolingual.`,
    )
    this.name = 'BilingualRequiredError'
  }
}

// ─── Types ───────────────────────────────────────────────────────────

interface LangContent {
  title: string
  summary: string
  body: string
}

interface NewArticle {
  title: string
  summary: string
  body: string
  lang?: Lang
  translations?: Partial<Record<Lang, LangContent>>
  tags: string[]
  project?: string
  chunkIndices: number[]
  slug?: string
  stats?: Record<string, unknown>
  /** Optional base64-encoded hero image PNG. */
  heroImageBase64?: string
}

interface LangMeta {
  title: string
  summary: string
  path: string
}

interface ExistingArticleMeta {
  slug: string
  title?: string
  summary?: string
  path?: string
  primaryLang?: Lang
  i18n?: Partial<Record<Lang, LangMeta>>
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

export interface FileSpec {
  /** Path relative to repo root. */
  path: string
  /** Either utf-8 text or base64. `encoding` selects which. */
  content: string
  encoding: 'utf-8' | 'base64'
}

// ─── Invariants ──────────────────────────────────────────────────────

export const REQUIRED_TRANSLATIONS: Partial<Record<Lang, Lang[]>> = {
  zh: ['en'],
}

export function assertBilingual(article: NewArticle, idx: number): void {
  const primary: Lang = article.lang ?? 'zh'
  const required = REQUIRED_TRANSLATIONS[primary] ?? []
  for (const need of required) {
    const t = article.translations?.[need]
    if (!t || !t.title?.trim() || !t.summary?.trim() || !t.body?.trim()) {
      throw new BilingualRequiredError(idx, article.title, primary, need)
    }
  }
}

// ─── Size check ──────────────────────────────────────────────────────

export function assertBlobSize(spec: FileSpec): void {
  const size = spec.encoding === 'base64'
    ? Buffer.from(spec.content, 'base64').length
    : Buffer.byteLength(spec.content, 'utf-8')
  if (size > MAX_BLOB_BYTES) throw new BlobTooLargeError(spec.path, size)
}

// ─── GitHub helpers ──────────────────────────────────────────────────

export type OctokitLike = Pick<Octokit, 'rest'>

async function getRef(octokit: OctokitLike): Promise<{ sha: string }> {
  const res = await octokit.rest.git.getRef({
    owner: DATA_REPO_OWNER,
    repo: DATA_REPO_NAME,
    ref: `heads/${DATA_REPO_BRANCH}`,
  })
  return { sha: res.data.object.sha }
}

async function getCommitTreeSha(octokit: OctokitLike, commitSha: string): Promise<string> {
  const res = await octokit.rest.git.getCommit({
    owner: DATA_REPO_OWNER,
    repo: DATA_REPO_NAME,
    commit_sha: commitSha,
  })
  return res.data.tree.sha
}

export async function fetchIndex(octokit: OctokitLike): Promise<IndexFile> {
  try {
    const res = await octokit.rest.repos.getContent({
      owner: DATA_REPO_OWNER,
      repo: DATA_REPO_NAME,
      path: 'index.json',
      ref: DATA_REPO_BRANCH,
    })
    const data = res.data as { content?: string; encoding?: string }
    if (data.content && data.encoding === 'base64') {
      const decoded = Buffer.from(data.content, 'base64').toString('utf-8')
      return JSON.parse(decoded)
    }
    return { articles: [], lastUpdated: '' }
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 404) return { articles: [], lastUpdated: '' }
    throw e
  }
}

/**
 * Commit a batch of files to the data repo as a single atomic commit.
 * Pre-validates blob sizes. Retries on 409 ref conflict up to MAX_REF_RETRIES
 * times by rebuilding the tree on the new parent.
 */
export async function commitBatch(
  octokit: OctokitLike,
  files: FileSpec[],
  message: string,
): Promise<{ commitSha: string; attempts: number }> {
  for (const f of files) assertBlobSize(f)

  let attempt = 0
  while (attempt < MAX_REF_RETRIES) {
    attempt++
    const { sha: parentSha } = await getRef(octokit)
    const baseTreeSha = await getCommitTreeSha(octokit, parentSha)

    const blobs = await Promise.all(
      files.map(async (f) => {
        const res = await octokit.rest.git.createBlob({
          owner: DATA_REPO_OWNER,
          repo: DATA_REPO_NAME,
          content: f.content,
          encoding: f.encoding === 'utf-8' ? 'utf-8' : 'base64',
        })
        return { path: f.path, sha: res.data.sha }
      }),
    )

    const treeRes = await octokit.rest.git.createTree({
      owner: DATA_REPO_OWNER,
      repo: DATA_REPO_NAME,
      base_tree: baseTreeSha,
      tree: blobs.map((b) => ({
        path: b.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: b.sha,
      })),
    })

    const commitRes = await octokit.rest.git.createCommit({
      owner: DATA_REPO_OWNER,
      repo: DATA_REPO_NAME,
      message,
      tree: treeRes.data.sha,
      parents: [parentSha],
    })

    try {
      await octokit.rest.git.updateRef({
        owner: DATA_REPO_OWNER,
        repo: DATA_REPO_NAME,
        ref: `heads/${DATA_REPO_BRANCH}`,
        sha: commitRes.data.sha,
      })
      return { commitSha: commitRes.data.sha, attempts: attempt }
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status !== 409) throw e
      if (attempt >= MAX_REF_RETRIES) throw new SHAConflictError()
      // loop again with fresh parent
    }
  }
  throw new SHAConflictError()
}

// ─── Helpers ─────────────────────────────────────────────────────────

function generateSlug(article: NewArticle, sessionId: string, index: number, date: string): string {
  if (article.slug && article.slug.length > 10) {
    if (/^\d{4}-\d{2}-\d{2}-/.test(article.slug)) return article.slug
    return `${date}-${article.slug}`
  }
  return `${date}-${sessionId.slice(0, 8)}-article-${index + 1}`
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function articlePath(slug: string, lang: Lang): string {
  const parts = slug.slice(0, 10).split('-')
  return `${parts[0]}/${parts[1]}/${parts[2]}/${slug}.${lang}.json`
}

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
      if (lang === primary) continue
      if (!content) continue
      out.push({ lang, content })
    }
  }
  return out
}

// ─── prepare-match ───────────────────────────────────────────────────

export async function prepareMatch(
  octokit: OctokitLike,
  sessionId: string,
  articlesPath: string,
): Promise<void> {
  const index = await fetchIndex(octokit)
  const newArticles: NewArticle[] = JSON.parse(readFileSync(articlesPath, 'utf-8'))

  const existing = index.articles.filter(
    (a) => a.sessionId === sessionId && a.chunkIndices && a.chunkIndices.length > 0,
  )

  if (existing.length === 0) {
    const decisions: MatchDecision[] = newArticles.map((_, i) => ({
      newIndex: i,
      action: 'insert' as const,
    }))
    process.stdout.write(JSON.stringify({
      needsLlm: false,
      decisions,
      matchingPrompt: null,
    }) + '\n')
    return
  }

  const existingDesc = existing.map((a, i) => {
    const ci = (a.chunkIndices ?? []).join(', ')
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

  process.stdout.write(JSON.stringify({
    needsLlm: true,
    decisions: null,
    matchingPrompt: prompt,
    existingCount: existing.length,
    newCount: newArticles.length,
  }) + '\n')
}

// ─── execute ─────────────────────────────────────────────────────────

export async function execute(
  octokit: OctokitLike,
  sessionId: string,
  articlesPath: string,
  decisionsPath: string,
): Promise<void> {
  const index = await fetchIndex(octokit)
  const newArticles: NewArticle[] = JSON.parse(readFileSync(articlesPath, 'utf-8'))
  const decisionsRaw = JSON.parse(readFileSync(decisionsPath, 'utf-8'))
  const decisions: MatchDecision[] = decisionsRaw.decisions ?? decisionsRaw

  const result = await publishRun({ octokit, sessionId, index, newArticles, decisions })
  process.stdout.write(JSON.stringify(result) + '\n')
}

export interface PublishRunInput {
  octokit: OctokitLike
  sessionId: string
  index: IndexFile
  newArticles: NewArticle[]
  decisions: MatchDecision[]
}

export interface PublishRunResult {
  results: Array<{ slug: string; action: string; title: string; langs: Lang[] }>
  totalArticles: number
  commitSha: string
  filesCommitted: number
}

export async function publishRun(input: PublishRunInput): Promise<PublishRunResult> {
  const { octokit, sessionId, index, newArticles, decisions } = input

  // Fail fast: enforce bilingual invariant BEFORE committing anything.
  newArticles.forEach((a, i) => assertBilingual(a, i))

  const skipHero = process.env.LOGEX_SKIP_HERO === 'true'
  const date = today()
  const results: PublishRunResult['results'] = []
  const fileSpecs: FileSpec[] = []

  for (const dec of decisions) {
    const article = newArticles[dec.newIndex]
    if (!article) {
      process.stderr.write(`Warning: newIndex ${dec.newIndex} out of range, skipping\n`)
      continue
    }

    const primaryLang: Lang = article.lang ?? 'zh'
    const langContents = enumerateLangContent(article)

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
        process.stderr.write(`Warning: existing slug "${dec.existingSlug}" not found, treating as insert\n`)
      } else {
        const existing = index.articles[existingIdx]
        slug = existing.slug
        articleDate = existing.date ?? existing.slug.slice(0, 10)
        preservedHeroImage = (existing.heroImage as string) ?? ''
        preservedDuration = (existing.duration as string) ?? ''
        preservedStats = (existing.stats as Record<string, unknown>) ?? preservedStats
        isUpdate = true
      }
    }

    if (!isUpdate) {
      slug = generateSlug(article, sessionId, dec.newIndex, date)
      articleDate = slug.slice(0, 10)
    }

    if (article.heroImageBase64) {
      const imgPath = `images/${slug!}.png`
      fileSpecs.push({ path: imgPath, content: article.heroImageBase64, encoding: 'base64' })
      preservedHeroImage = `/${imgPath}`
    } else if (!skipHero && (!preservedHeroImage || preservedHeroImage.trim() === '')) {
      try {
        const img = await generateHeroImage(slug!, article.title)
        const ext = img.mime === 'image/png' ? 'png'
          : img.mime === 'image/svg+xml' ? 'svg'
          : 'png'
        const imgPath = `images/${slug!}.${ext}`
        fileSpecs.push({
          path: imgPath,
          content: img.data.toString('base64'),
          encoding: 'base64',
        })
        preservedHeroImage = `/${imgPath}`
      } catch (err) {
        process.stderr.write(
          `Warning: hero generation failed for ${slug!}: ${(err as Error).message}\n`,
        )
      }
    }

    const i18nMap: Partial<Record<Lang, LangMeta>> = {}
    for (const { lang, content } of langContents) {
      const relPath = articlePath(slug!, lang)
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
      fileSpecs.push({
        path: relPath,
        content: JSON.stringify(articleData, null, 2),
        encoding: 'utf-8',
      })
      i18nMap[lang] = { title: content.title, summary: content.summary, path: relPath }
    }

    const entry: ExistingArticleMeta = {
      slug: slug!,
      date: articleDate!,
      project: article.project ?? '',
      tags: article.tags,
      sessionId,
      heroImage: preservedHeroImage,
      chunkIndices: article.chunkIndices,
      duration: preservedDuration,
      stats: preservedStats,
      primaryLang,
      i18n: i18nMap,
    }

    if (isUpdate && existingIdx !== -1) {
      const existing = index.articles[existingIdx]
      const mergedI18n: Partial<Record<Lang, LangMeta>> = { ...(existing.i18n ?? {}) }
      for (const [lang, meta] of Object.entries(i18nMap) as Array<[Lang, LangMeta]>) {
        mergedI18n[lang] = meta
      }
      entry.i18n = mergedI18n
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

  index.articles.sort((a, b) => (b.slug > a.slug ? 1 : -1))
  const seen = new Set<string>()
  index.articles = index.articles.filter((a) => {
    if (seen.has(a.slug)) return false
    seen.add(a.slug)
    return true
  })
  index.lastUpdated = date

  fileSpecs.push({
    path: 'index.json',
    content: JSON.stringify(index, null, 2),
    encoding: 'utf-8',
  })

  const articleCount = results.length
  const message = `articles: ${articleCount} from session ${sessionId}`
  const { commitSha } = await commitBatch(octokit, fileSpecs, message)

  return {
    results,
    totalArticles: index.articles.length,
    commitSha,
    filesCommitted: fileSpecs.length,
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────

function getArg(args: string[], name: string): string {
  const idx = args.indexOf(`--${name}`)
  if (idx === -1 || !args[idx + 1]) {
    process.stderr.write(`Missing required argument: --${name}\n`)
    process.exit(1)
  }
  return args[idx + 1]
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0]

  if (command !== 'prepare-match' && command !== 'execute') {
    process.stderr.write('Usage:\n')
    process.stderr.write('  npx tsx src/pipeline/publish.ts prepare-match --session-id <id> --articles <path>\n')
    process.stderr.write('  npx tsx src/pipeline/publish.ts execute --session-id <id> --articles <path> --decisions <path>\n')
    process.exit(1)
  }

  const token = resolveGitHubToken()
  const octokit = new Octokit({ auth: token })

  try {
    if (command === 'prepare-match') {
      await prepareMatch(octokit, getArg(args, 'session-id'), getArg(args, 'articles'))
    } else {
      await execute(
        octokit,
        getArg(args, 'session-id'),
        getArg(args, 'articles'),
        getArg(args, 'decisions'),
      )
    }
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    process.stderr.write(`publish failed: ${msg}\n`)
    process.exit(1)
  }
}

const isMain = (() => {
  try {
    const argv1 = process.argv[1]
    if (!argv1) return false
    return argv1.endsWith('publish.ts') || argv1.endsWith('publish.js')
  } catch {
    return false
  }
})()

if (isMain) {
  main()
}
