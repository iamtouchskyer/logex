import type { SessionArticle, Lang } from '../../pipeline/types'
import type { StorageAdapter, ArticleIndex, ArticleIndexEntry, ArticleIndexEntryLegacy } from './types'
import { normalizeIndexEntry } from './types'

/**
 * Multi-tenant GitHub adapter.
 *
 * Talks ONLY to same-origin `/api/articles/*` endpoints — never direct to
 * `api.github.com` or any CDN. The server proxies to the user's
 * `<login>/logex-data` repo using the OAuth access_token stored in the
 * httpOnly session cookie, so no tokens or repo identifiers ship to the
 * browser bundle.
 */

const TTL_INDEX = 5 * 60 * 1000    // 5 min
const TTL_ARTICLE = 30 * 60 * 1000 // 30 min

export class RepoNotFoundError extends Error {
  readonly code = 'REPO_NOT_FOUND'
  readonly login: string | undefined
  constructor(login?: string, message?: string) {
    super(message ?? 'logex-data repo not found')
    this.name = 'RepoNotFoundError'
    this.login = login
  }
}

export class UnauthenticatedError extends Error {
  readonly code = 'UNAUTHENTICATED'
  constructor() {
    super('Not authenticated')
    this.name = 'UnauthenticatedError'
  }
}

export class InsufficientScopeError extends Error {
  readonly code = 'INSUFFICIENT_SCOPE'
  constructor() {
    super('OAuth token lacks required scope')
    this.name = 'InsufficientScopeError'
  }
}

// ---------------------------------------------------------------------------
// In-memory cache (process lifetime, cleared on page reload). Server sets
// Cache-Control: private, max-age=60 so we don't need a separate Cache API
// layer here.
//
// Cache keys are scoped by login so that user A logging out then user B
// logging into the same browser tab cannot read A's cached articles. The
// adapter fetches /api/auth/me once on construction to learn the login, and
// setUserScope() is exported for tests / explicit resets.
// ---------------------------------------------------------------------------
interface CacheEntry { data: unknown; expiresAt: number }
const memCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<unknown>>()

let currentUserScope: string | null = null

/** Exported for tests + explicit logout flows. */
export function setUserScope(login: string | null): void {
  if (currentUserScope !== login) {
    memCache.clear()
    inFlight.clear()
  }
  currentUserScope = login
}

export function getUserScope(): string | null {
  return currentUserScope
}

export function getCached<T>(key: string): T | null {
  const entry = memCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key)
    return null
  }
  return entry.data as T
}

export function setCached(key: string, data: unknown, ttl: number): void {
  memCache.set(key, { data, expiresAt: Date.now() + ttl })
}

export function clearMemCache(): void {
  memCache.clear()
  inFlight.clear()
  currentUserScope = null
}

async function fetchJson<T>(url: string, ttl: number, cacheKey: string): Promise<T> {
  const hit = getCached<T>(cacheKey)
  if (hit !== null) return hit

  const pending = inFlight.get(cacheKey)
  if (pending) return pending as Promise<T>

  const promise = (async (): Promise<T> => {
    const res = await fetch(url, { credentials: 'same-origin' })
    if (res.status === 401) {
      throw new UnauthenticatedError()
    }
    if (res.status === 404) {
      let body: unknown = null
      try { body = await res.json() } catch { /* ignore */ }
      const err = body as { error?: string; login?: string; message?: string } | null
      if (err?.error === 'REPO_NOT_FOUND') {
        throw new RepoNotFoundError(err.login, err.message)
      }
      throw new Error(`Not found: ${url}`)
    }
    if (res.status === 403) {
      throw new InsufficientScopeError()
    }
    if (!res.ok) {
      throw new Error(`Fetch failed: ${url} (${res.status})`)
    }
    const data = await res.json() as T
    setCached(cacheKey, data, ttl)
    return data
  })().finally(() => { inFlight.delete(cacheKey) })

  inFlight.set(cacheKey, promise)
  return promise
}

/**
 * Fetch /api/auth/me once per adapter instance to learn current user login.
 * Used to prefix cache keys so cross-user cache reads are impossible.
 * Returns 'anon' for unauthenticated calls (still tenant-isolated from any
 * logged-in user's entries).
 */
async function resolveLogin(): Promise<string> {
  if (currentUserScope !== null) return currentUserScope
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (!res.ok) {
      setUserScope('anon')
      return 'anon'
    }
    const data = await res.json() as { user?: { login?: string } | null }
    const login = data.user?.login ?? 'anon'
    setUserScope(login)
    return login
  } catch {
    setUserScope('anon')
    return 'anon'
  }
}

export class GitHubAdapter implements StorageAdapter {
  async loadIndex(): Promise<ArticleIndex> {
    const login = await resolveLogin()
    return fetchJson<ArticleIndex>('/api/articles/index', TTL_INDEX, `pub:${login}:idx:index.json`)
  }

  async loadArticle(slug: string, lang: Lang): Promise<SessionArticle> {
    const login = await resolveLogin()
    const index = await this.loadIndex()
    const raw = index.articles.find((a) => a.slug === slug) as
      | ArticleIndexEntry
      | ArticleIndexEntryLegacy
      | undefined
    if (!raw) throw new Error(`Article not found: ${slug}`)
    const entry = normalizeIndexEntry(raw)
    const target: Lang = entry.i18n[lang]
      ? lang
      : entry.i18n[entry.primaryLang]
        ? entry.primaryLang
        : (Object.keys(entry.i18n)[0] as Lang)
    const meta = entry.i18n[target]
    if (!meta) throw new Error(`Article has no content in any language: ${slug}`)
    const url = `/api/articles/${meta.path.split('/').map(encodeURIComponent).join('/')}`
    const article = await fetchJson<SessionArticle>(url, TTL_ARTICLE, `art:${login}:${meta.path}`)
    // index.heroImage is the single source of truth (language-independent field).
    // Body JSONs historically wrote heroImage:"" which poisons the ?? fallback.
    return { ...article, heroImage: entry.heroImage }
  }
}
