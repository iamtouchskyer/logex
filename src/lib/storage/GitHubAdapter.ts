import type { SessionArticle, Lang } from '../../pipeline/types'
import type { StorageAdapter, ArticleIndex, ArticleIndexEntry, ArticleIndexEntryLegacy } from './types'
import { normalizeIndexEntry } from './types'

const REPO = import.meta.env.VITE_GITHUB_REPO ?? 'iamtouchskyer/logex-data'
const BRANCH = import.meta.env.VITE_GITHUB_BRANCH ?? 'main'
// ⚠️  SECURITY: VITE_* vars are inlined into the browser bundle at build time.
// NEVER set VITE_GITHUB_TOKEN in .env.production or CI for public deployments —
// it exposes the token to all visitors. Private repo access must go through a
// server-side proxy that holds the token out of the client bundle.
const TOKEN = import.meta.env.VITE_GITHUB_TOKEN ?? ''

// ---------------------------------------------------------------------------
// In-memory cache (process lifetime, cleared on page reload)
// ---------------------------------------------------------------------------
const TTL_INDEX = 5 * 60 * 1000    // 5 min
const TTL_ARTICLE = 30 * 60 * 1000 // 30 min

interface CacheEntry { data: unknown; expiresAt: number }
const memCache = new Map<string, CacheEntry>()

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

/** Expose for testing only */
export function clearMemCache(): void {
  memCache.clear()
  inFlight.clear()
}

// ---------------------------------------------------------------------------
// In-flight dedup — prevents thundering herd on cold cache
// ---------------------------------------------------------------------------
const inFlight = new Map<string, Promise<unknown>>()

// ---------------------------------------------------------------------------
// Cache Storage API (browser cache, stale-while-revalidate)
// Only used for the public CDN path (TOKEN === '').
// ---------------------------------------------------------------------------
const CACHE_NAME = 'logex-v1'

async function fetchWithCache<T>(url: string, ttl: number): Promise<T> {
  if ('caches' in globalThis) {
    try {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(url)
      if (cached) {
        let data: T
        try {
          data = await cached.clone().json() as T
        } catch {
          // Corrupt cache entry — delete and fall through to fresh fetch
          await cache.delete(url)
          throw new Error('corrupt-cache-entry')
        }
        const age = Date.now() - Number(cached.headers.get('x-cached-at') ?? 0)
        if (age < ttl) return data
        // Stale — serve immediately, refresh in background
        fetch(url).then((r) => r.json()).then((fresh) => {
          cache.put(url, new Response(JSON.stringify(fresh), {
            headers: { 'Content-Type': 'application/json', 'x-cached-at': String(Date.now()) },
          })).catch(() => {})
        }).catch(() => {
          // Background refresh failed — delete stale entry so next request gets fresh data
          cache.delete(url).catch(() => {})
        })
        return data
      }
      // Not in cache — fetch and store
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`)
      const data = await res.json() as T
      cache.put(url, new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'x-cached-at': String(Date.now()) },
      })).catch(() => {})
      return data
    } catch (e) {
      const msg = (e as Error)?.message ?? ''
      if (msg.startsWith('Fetch failed:')) throw e
      if (msg !== 'corrupt-cache-entry') { /* fall through */ }
    }
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`)
  return res.json()
}

function rawUrl(path: string): string {
  if (TOKEN) {
    return `https://api.github.com/repos/${REPO}/contents/${path}`
  }
  return `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/${path}`
}

async function fetchFile<T>(path: string, ttl: number): Promise<T> {
  const url = rawUrl(path)

  if (TOKEN) {
    const cached = getCached<T>(`mem:${path}`)
    if (cached !== null) return cached
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.raw+json',
      Authorization: `Bearer ${TOKEN}`,
    }
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`GitHub fetch failed: ${path} (${res.status})`)
    const data = await res.json() as T
    setCached(`mem:${path}`, data, ttl)
    return data
  }

  const memKey = `pub:${path}`
  const memHit = getCached<T>(memKey)
  if (memHit !== null) return memHit

  const existing = inFlight.get(memKey)
  if (existing) return existing as Promise<T>

  const promise = fetchWithCache<T>(url, ttl).then((data) => {
    setCached(memKey, data, ttl)
    inFlight.delete(memKey)
    return data
  }).catch((err) => {
    inFlight.delete(memKey)
    throw err
  })
  inFlight.set(memKey, promise)
  return promise
}

export class GitHubAdapter implements StorageAdapter {
  async loadIndex(): Promise<ArticleIndex> {
    return fetchFile<ArticleIndex>('index.json', TTL_INDEX)
  }

  async loadArticle(slug: string, lang: Lang): Promise<SessionArticle> {
    const index = await this.loadIndex()
    const raw = index.articles.find((a) => a.slug === slug) as
      | ArticleIndexEntry
      | ArticleIndexEntryLegacy
      | undefined
    if (!raw) throw new Error(`Article not found: ${slug}`)
    const entry = normalizeIndexEntry(raw)
    // Pick: requested lang → primaryLang → any available
    const target: Lang = entry.i18n[lang]
      ? lang
      : entry.i18n[entry.primaryLang]
        ? entry.primaryLang
        : (Object.keys(entry.i18n)[0] as Lang)
    const meta = entry.i18n[target]
    if (!meta) throw new Error(`Article has no content in any language: ${slug}`)
    const article = await fetchFile<SessionArticle>(meta.path, TTL_ARTICLE)
    // heroImage lives at index top-level (lang-agnostic) — override per-lang JSON copy
    // to keep card and detail page in sync after backfill / republish drift.
    return { ...article, heroImage: entry.heroImage ?? article.heroImage }
  }
}
