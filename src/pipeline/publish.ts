import { readFileSync } from 'node:fs'
import { Octokit } from '@octokit/rest'
import { resolveGitHubToken, maskToken } from '../lib/github-token.js'
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
      'upstream changed faster than we could rebase — exhausted retries after re-fetching index.json each iteration',
    )
    this.name = 'SHAConflictError'
  }
}

export class RateLimitedError extends Error {
  constructor(
    public readonly resetAt: Date | null,
    public readonly retryAfterSec: number | null,
  ) {
    const when = resetAt
      ? `at ${resetAt.toISOString()}`
      : retryAfterSec != null
        ? `in ${retryAfterSec}s`
        : 'later (no reset header seen)'
    super(
      `GitHub rate limit exceeded — retry ${when}. Not auto-retrying; rerun once the window resets.`,
    )
    this.name = 'RateLimitedError'
  }
}

export class InsufficientScopeError extends Error {
  constructor(public readonly scopes: string) {
    super(
      `GitHub token is missing required 'repo' scope (token scopes: '${scopes}'). `
      + 'Regenerate a classic PAT with repo scope at https://github.com/settings/tokens/new',
    )
    this.name = 'InsufficientScopeError'
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
 * Inspect a 403-flavoured Octokit error and return a typed error when the
 * shape matches (rate limit, missing scope). Returns null if no special
 * handling applies — caller should rethrow the original.
 */
export function classifyGitHubError(e: unknown): Error | null {
  const err = e as {
    status?: number
    response?: { headers?: Record<string, string | undefined> }
    message?: string
  }
  if (err?.status !== 403) return null
  const headers = err.response?.headers ?? {}
  const remaining = headers['x-ratelimit-remaining']
  const resetRaw = headers['x-ratelimit-reset']
  const retryAfter = headers['retry-after']
  const msg = err.message ?? ''
  if (remaining === '0' || retryAfter || /rate limit/i.test(msg)) {
    const resetAt = resetRaw ? new Date(Number(resetRaw) * 1000) : null
    const retryAfterSec = retryAfter ? Number(retryAfter) : null
    return new RateLimitedError(resetAt, retryAfterSec)
  }
  const scopes = headers['x-oauth-scopes']
  if (typeof scopes === 'string') {
    const list = scopes.split(',').map((s) => s.trim()).filter(Boolean)
    if (!list.includes('repo')) return new InsufficientScopeError(scopes)
  }
  return null
}

/**
 * Single-attempt commit of a batch of files as one atomic commit.
 * Pre-validates blob sizes. Rethrows 409 so caller can retry with a fresh
 * parent. Throws `RateLimitedError` / `InsufficientScopeError` for
 * recognisable 403 shapes instead of opaque error bodies.
 *
 * Callers that need to rebuild the tree on conflict should drive the retry
 * themselves (see `publishRun`) so the in-memory state they ship in the
 * tree (e.g. `index.json`) can be refreshed against the new parent.
 */
export async function commitBatch(
  octokit: OctokitLike,
  files: FileSpec[],
  message: string,
  blobShaCache?: Map<string, string>,
): Promise<{ commitSha: string }> {
  for (const f of files) assertBlobSize(f)
  try {
    const { sha: parentSha } = await getRef(octokit)
    const baseTreeSha = await getCommitTreeSha(octokit, parentSha)

    const blobs = await Promise.all(
      files.map(async (f) => {
        const cacheKey = `${f.encoding}:${f.content}`
        if (blobShaCache?.has(cacheKey)) {
          return { path: f.path, sha: blobShaCache.get(cacheKey)! }
        }
        const res = await octokit.rest.git.createBlob({
          owner: DATA_REPO_OWNER,
          repo: DATA_REPO_NAME,
          content: f.content,
          encoding: f.encoding === 'utf-8' ? 'utf-8' : 'base64',
        })
        blobShaCache?.set(cacheKey, res.data.sha)
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

    await octokit.rest.git.updateRef({
      owner: DATA_REPO_OWNER,
      repo: DATA_REPO_NAME,
      ref: `heads/${DATA_REPO_BRANCH}`,
      sha: commitRes.data.sha,
    })
    return { commitSha: commitRes.data.sha }
  } catch (e) {
    const classified = classifyGitHubError(e)
    if (classified) throw classified
    throw e
  }
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

interface PreparedArticle {
  dec: MatchDecision
  article: NewArticle
  slug: string
  articleDate: string
  primaryLang: Lang
  i18nMap: Partial<Record<Lang, LangMeta>>
  preservedHeroImage: string
  preservedStats: Record<string, unknown>
  preservedDuration: string
  isUpdate: boolean
  existingSlug?: string
}

/**
 * Merge prepared article entries into a fresh-from-remote `IndexFile`.
 * Pure function — call once per retry iteration with a freshly fetched
 * index so any concurrent writer's entries are preserved.
 */
export function mergeIndex(
  index: IndexFile,
  prepared: PreparedArticle[],
  sessionId: string,
  date: string,
): { index: IndexFile; results: PublishRunResult['results'] } {
  const results: PublishRunResult['results'] = []
  for (const p of prepared) {
    const entry: ExistingArticleMeta = {
      slug: p.slug,
      date: p.articleDate,
      project: p.article.project ?? '',
      tags: p.article.tags,
      sessionId,
      heroImage: p.preservedHeroImage,
      chunkIndices: p.article.chunkIndices,
      duration: p.preservedDuration,
      stats: p.preservedStats,
      primaryLang: p.primaryLang,
      i18n: p.i18nMap,
    }

    let existingIdx = -1
    if (p.isUpdate && p.existingSlug) {
      existingIdx = index.articles.findIndex((a) => a.slug === p.existingSlug)
    }

    if (existingIdx !== -1) {
      const existing = index.articles[existingIdx]
      const mergedI18n: Partial<Record<Lang, LangMeta>> = { ...(existing.i18n ?? {}) }
      for (const [lang, meta] of Object.entries(p.i18nMap) as Array<[Lang, LangMeta]>) {
        mergedI18n[lang] = meta
      }
      entry.i18n = mergedI18n
      entry.primaryLang = p.article.lang ?? existing.primaryLang ?? p.primaryLang
      index.articles[existingIdx] = entry
      results.push({
        slug: p.slug, action: 'updated', title: p.article.title,
        langs: Object.keys(mergedI18n) as Lang[],
      })
    } else {
      index.articles.push(entry)
      results.push({
        slug: p.slug, action: 'inserted', title: p.article.title,
        langs: Object.keys(p.i18nMap) as Lang[],
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
  return { index, results }
}

export async function publishRun(input: PublishRunInput): Promise<PublishRunResult> {
  const { octokit, sessionId, newArticles, decisions } = input
  let { index } = input

  // Fail fast: enforce bilingual invariant BEFORE committing anything.
  newArticles.forEach((a, i) => assertBilingual(a, i))

  const skipHero = process.env.LOGEX_SKIP_HERO === 'true'
  const date = today()
  const articleFileSpecs: FileSpec[] = []
  const prepared: PreparedArticle[] = []

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

    if (dec.action === 'update' && dec.existingSlug) {
      const existingIdx = index.articles.findIndex((a) => a.slug === dec.existingSlug)
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
      articleFileSpecs.push({ path: imgPath, content: article.heroImageBase64, encoding: 'base64' })
      preservedHeroImage = `/${imgPath}`
    } else if (!skipHero && (!preservedHeroImage || preservedHeroImage.trim() === '')) {
      try {
        const img = await generateHeroImage(slug!, article.title)
        const ext = img.mime === 'image/png' ? 'png'
          : img.mime === 'image/svg+xml' ? 'svg'
          : 'png'
        const imgPath = `images/${slug!}.${ext}`
        articleFileSpecs.push({
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
      articleFileSpecs.push({
        path: relPath,
        content: JSON.stringify(articleData, null, 2),
        encoding: 'utf-8',
      })
      i18nMap[lang] = { title: content.title, summary: content.summary, path: relPath }
    }

    prepared.push({
      dec, article,
      slug: slug!, articleDate: articleDate!,
      primaryLang, i18nMap,
      preservedHeroImage, preservedStats, preservedDuration,
      isUpdate, existingSlug: dec.existingSlug,
    })
  }

  // sessionId injection on entry — mergeIndex stamps sessionId directly.

  // Retry loop: on 409, re-fetch index and re-merge before rebuilding the
  // commit. Article blobs are content-addressed so we cache their SHAs
  // across attempts (S2).
  const blobShaCache = new Map<string, string>()
  let results: PublishRunResult['results'] = []
  let finalFileCount = 0
  let finalTotalArticles = 0

  for (let attempt = 1; attempt <= MAX_REF_RETRIES; attempt++) {
    const mergeResult = mergeIndex(index, prepared, sessionId, date)
    results = mergeResult.results

    const fileSpecs: FileSpec[] = [
      ...articleFileSpecs,
      {
        path: 'index.json',
        content: JSON.stringify(mergeResult.index, null, 2),
        encoding: 'utf-8',
      },
    ]
    finalFileCount = fileSpecs.length
    finalTotalArticles = mergeResult.index.articles.length

    const message = `articles: ${results.length} from session ${sessionId}`
    try {
      const { commitSha } = await commitBatch(octokit, fileSpecs, message, blobShaCache)
      return { results, totalArticles: finalTotalArticles, commitSha, filesCommitted: finalFileCount }
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status !== 409) throw e
      if (attempt >= MAX_REF_RETRIES) break
      // Re-fetch index.json from current tip and re-run the merge.
      index = await fetchIndex(octokit)
    }
  }
  throw new SHAConflictError()
}

// ─── CLI ─────────────────────────────────────────────────────────────

export interface CliIO {
  argv: string[]
  stderr: (s: string) => void
  stdout?: (s: string) => void
  exit: (code: number) => never
  resolveToken?: () => string
  makeOctokit?: (token: string) => OctokitLike
}

export function parseArgv(args: string[]):
  | { kind: 'usage' }
  | { kind: 'prepare-match'; sessionId: string; articles: string }
  | { kind: 'execute'; sessionId: string; articles: string; decisions: string }
  | { kind: 'missing'; name: string }
{
  const command = args[0]
  if (command !== 'prepare-match' && command !== 'execute') return { kind: 'usage' }
  const pick = (name: string): string | null => {
    const idx = args.indexOf(`--${name}`)
    if (idx === -1 || !args[idx + 1]) return null
    return args[idx + 1]
  }
  const sessionId = pick('session-id')
  if (!sessionId) return { kind: 'missing', name: 'session-id' }
  const articles = pick('articles')
  if (!articles) return { kind: 'missing', name: 'articles' }
  if (command === 'prepare-match') {
    return { kind: 'prepare-match', sessionId, articles }
  }
  const decisions = pick('decisions')
  if (!decisions) return { kind: 'missing', name: 'decisions' }
  return { kind: 'execute', sessionId, articles, decisions }
}

/**
 * Redact any token-shaped substring from an error message before it hits
 * stderr. Masks `ghp_...`, `github_pat_...`, `gho_...`, `ghs_...` and raw
 * 40-char hex (legacy PAT) segments. Relies on `maskToken` so both
 * producers share one code path.
 */
export function redactTokensInMessage(msg: string): string {
  return msg.replace(/(github_pat_[A-Za-z0-9_]+|gh[posru]_[A-Za-z0-9]+|\b[a-f0-9]{40}\b)/g, (m) => maskToken(m))
}

/**
 * Pure CLI tail. Runs the parse / dispatch path with injected IO so it
 * is unit-testable. Calls `io.exit` on terminal paths — keep it typed
 * `never` so type checks remain strict downstream.
 */
export async function runCli(io: CliIO): Promise<void> {
  const parsed = parseArgv(io.argv)
  if (parsed.kind === 'usage') {
    io.stderr('Usage:\n')
    io.stderr('  npx tsx src/pipeline/publish.ts prepare-match --session-id <id> --articles <path>\n')
    io.stderr('  npx tsx src/pipeline/publish.ts execute --session-id <id> --articles <path> --decisions <path>\n')
    io.exit(1)
  }
  if (parsed.kind === 'missing') {
    io.stderr(`Missing required argument: --${parsed.name}\n`)
    io.exit(1)
  }

  try {
    const token = (io.resolveToken ?? resolveGitHubToken)()
    const octokit: OctokitLike = io.makeOctokit
      ? io.makeOctokit(token)
      : (new Octokit({ auth: token }) as OctokitLike)

    if (parsed.kind === 'prepare-match') {
      await prepareMatch(octokit, parsed.sessionId, parsed.articles)
    } else if (parsed.kind === 'execute') {
      await execute(octokit, parsed.sessionId, parsed.articles, parsed.decisions)
    }
  } catch (e) {
    const rawMsg = (e as Error).message ?? String(e)
    const safe = redactTokensInMessage(rawMsg)
    io.stderr(`publish failed: ${safe}\n`)
    io.exit(1)
  }
}

export async function main(): Promise<void> {
  /* v8 ignore start */
  await runCli({
    argv: process.argv.slice(2),
    stderr: (s) => { process.stderr.write(s) },
    stdout: (s) => { process.stdout.write(s) },
    exit: (code) => process.exit(code),
  })
  /* v8 ignore stop */
}

/* v8 ignore start -- module bootstrap; exercised only when run as CLI */
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
/* v8 ignore stop */
