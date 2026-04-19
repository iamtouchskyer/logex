/**
 * GitHubAdapter tests — mocks only `fetch` at boundary, exercises success,
 * cache hit, RepoNotFoundError, UnauthenticatedError, InsufficientScopeError,
 * generic failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  GitHubAdapter,
  RepoNotFoundError,
  UnauthenticatedError,
  InsufficientScopeError,
  clearMemCache,
  getCached,
  setCached,
  setUserScope,
  getUserScope,
} from '../GitHubAdapter'

function mockFetchJson(status: number, body: unknown) {
  return vi.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('GitHubAdapter', () => {
  let origFetch: typeof fetch
  beforeEach(() => { origFetch = globalThis.fetch; clearMemCache(); setUserScope('testuser') })
  afterEach(() => { globalThis.fetch = origFetch; clearMemCache() })

  it('loadIndex() hits /api/articles/index', async () => {
    const fetchMock = mockFetchJson(200, { articles: [], lastUpdated: 'now' })
    globalThis.fetch = fetchMock
    const adapter = new GitHubAdapter()
    const idx = await adapter.loadIndex()
    expect(idx.articles).toEqual([])
    const call = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(call[0]).toBe('/api/articles/index')
    expect(call[1]?.credentials).toBe('same-origin')
  })

  it('loadIndex() returns cached value on second call', async () => {
    const fetchMock = mockFetchJson(200, { articles: [], lastUpdated: 'now' })
    globalThis.fetch = fetchMock
    const adapter = new GitHubAdapter()
    await adapter.loadIndex()
    await adapter.loadIndex()
    expect((fetchMock as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1)
  })

  it('throws RepoNotFoundError on 404 REPO_NOT_FOUND', async () => {
    globalThis.fetch = mockFetchJson(404, { error: 'REPO_NOT_FOUND', login: 'alice', message: 'nope' })
    const adapter = new GitHubAdapter()
    await expect(adapter.loadIndex()).rejects.toBeInstanceOf(RepoNotFoundError)
  })

  it('throws generic Error on 404 without REPO_NOT_FOUND', async () => {
    globalThis.fetch = mockFetchJson(404, { error: 'other' })
    const adapter = new GitHubAdapter()
    await expect(adapter.loadIndex()).rejects.toThrow(/Not found/)
  })

  it('throws UnauthenticatedError on 401', async () => {
    globalThis.fetch = mockFetchJson(401, {})
    const adapter = new GitHubAdapter()
    await expect(adapter.loadIndex()).rejects.toBeInstanceOf(UnauthenticatedError)
  })

  it('throws InsufficientScopeError on 403', async () => {
    globalThis.fetch = mockFetchJson(403, {})
    const adapter = new GitHubAdapter()
    await expect(adapter.loadIndex()).rejects.toBeInstanceOf(InsufficientScopeError)
  })

  it('throws generic Error on 502', async () => {
    globalThis.fetch = mockFetchJson(502, {})
    const adapter = new GitHubAdapter()
    await expect(adapter.loadIndex()).rejects.toThrow(/Fetch failed/)
  })

  it('loadArticle() resolves lang + fetches /api/articles/<path>', async () => {
    let call = 0
    globalThis.fetch = vi.fn(async () => {
      call++
      if (call === 1) {
        return {
          status: 200, ok: true,
          json: async () => ({
            articles: [{
              slug: 'foo', date: '2026-04-19', project: 'logex', tags: [],
              primaryLang: 'en', i18n: { en: { title: 'T', summary: 'S', path: '2026/04/19/foo.en.json' } },
            }],
            lastUpdated: 'now',
          }),
        } as unknown as Response
      }
      return {
        status: 200, ok: true,
        json: async () => ({ slug: 'foo', title: 'T', body: '', project: 'logex', date: '2026-04-19', duration: '', sessionId: '', tags: [], stats: { entries: 0, messages: 0, chunks: 0 } }),
      } as unknown as Response
    }) as unknown as typeof fetch

    const adapter = new GitHubAdapter()
    const art = await adapter.loadArticle('foo', 'en')
    expect(art.slug).toBe('foo')
    const calls = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
    expect(calls[1][0]).toBe('/api/articles/2026/04/19/foo.en.json')
  })

  it('loadArticle() throws when slug missing', async () => {
    globalThis.fetch = mockFetchJson(200, { articles: [], lastUpdated: 'now' })
    const adapter = new GitHubAdapter()
    await expect(adapter.loadArticle('nope', 'en')).rejects.toThrow(/Article not found/)
  })

  it('loadArticle() uses index heroImage over body empty string', async () => {
    let call = 0
    globalThis.fetch = vi.fn(async () => {
      call++
      if (call === 1) {
        return {
          status: 200, ok: true,
          json: async () => ({
            articles: [{
              slug: 'hero-test', date: '2026-04-19', project: 'logex', tags: [],
              primaryLang: 'en', heroImage: 'https://x/y.png',
              i18n: { en: { title: 'T', summary: 'S', path: 'hero.en.json' } },
            }],
            lastUpdated: 'now',
          }),
        } as unknown as Response
      }
      return {
        status: 200, ok: true,
        json: async () => ({ slug: 'hero-test', title: 'T', body: '', heroImage: '', project: 'logex', date: '2026-04-19', duration: '', sessionId: '', tags: [], stats: { entries: 0, messages: 0, chunks: 0 } }),
      } as unknown as Response
    }) as unknown as typeof fetch
    const adapter = new GitHubAdapter()
    const art = await adapter.loadArticle('hero-test', 'en')
    expect(art.heroImage).toBe('https://x/y.png')
  })

  it('loadArticle() index heroImage wins even when body has different URL', async () => {
    let call = 0
    globalThis.fetch = vi.fn(async () => {
      call++
      if (call === 1) {
        return {
          status: 200, ok: true,
          json: async () => ({
            articles: [{
              slug: 'hero-test2', date: '2026-04-19', project: 'logex', tags: [],
              primaryLang: 'en', heroImage: 'https://x/y.png',
              i18n: { en: { title: 'T', summary: 'S', path: 'hero2.en.json' } },
            }],
            lastUpdated: 'now',
          }),
        } as unknown as Response
      }
      return {
        status: 200, ok: true,
        json: async () => ({ slug: 'hero-test2', title: 'T', body: '', heroImage: 'https://z/w.png', project: 'logex', date: '2026-04-19', duration: '', sessionId: '', tags: [], stats: { entries: 0, messages: 0, chunks: 0 } }),
      } as unknown as Response
    }) as unknown as typeof fetch
    const adapter = new GitHubAdapter()
    const art = await adapter.loadArticle('hero-test2', 'en')
    expect(art.heroImage).toBe('https://x/y.png')
  })

  it('loadArticle() returns undefined heroImage when index has none', async () => {
    let call = 0
    globalThis.fetch = vi.fn(async () => {
      call++
      if (call === 1) {
        return {
          status: 200, ok: true,
          json: async () => ({
            articles: [{
              slug: 'hero-test3', date: '2026-04-19', project: 'logex', tags: [],
              primaryLang: 'en',
              i18n: { en: { title: 'T', summary: 'S', path: 'hero3.en.json' } },
            }],
            lastUpdated: 'now',
          }),
        } as unknown as Response
      }
      return {
        status: 200, ok: true,
        json: async () => ({ slug: 'hero-test3', title: 'T', body: '', heroImage: 'https://should-be-ignored.png', project: 'logex', date: '2026-04-19', duration: '', sessionId: '', tags: [], stats: { entries: 0, messages: 0, chunks: 0 } }),
      } as unknown as Response
    }) as unknown as typeof fetch
    const adapter = new GitHubAdapter()
    const art = await adapter.loadArticle('hero-test3', 'en')
    expect(art.heroImage).toBeUndefined()
  })

  it('loadArticle() falls back to primaryLang when requested lang missing', async () => {
    let call = 0
    globalThis.fetch = vi.fn(async () => {
      call++
      if (call === 1) {
        return {
          status: 200, ok: true,
          json: async () => ({
            articles: [{
              slug: 'foo', date: '2026-04-19', project: 'logex', tags: [],
              primaryLang: 'zh', i18n: { zh: { title: 'T', summary: 'S', path: 'zh.json' } },
            }],
            lastUpdated: 'now',
          }),
        } as unknown as Response
      }
      return { status: 200, ok: true, json: async () => ({ slug: 'foo' }) } as unknown as Response
    }) as unknown as typeof fetch
    const adapter = new GitHubAdapter()
    const art = await adapter.loadArticle('foo', 'en')
    expect(art.slug).toBe('foo')
  })

  it('getCached expires entries', () => {
    setCached('k', { hi: 1 }, -1)
    expect(getCached('k')).toBeNull()
  })

  it('getCached returns null for unknown keys', () => {
    clearMemCache()
    expect(getCached('missing')).toBeNull()
  })

  it('in-flight dedup: two concurrent loadIndex calls trigger one fetch', async () => {
    let resolveFn: (v: Response) => void = () => {}
    const deferred = new Promise<Response>((r) => { resolveFn = r })
    const fetchMock = vi.fn(() => deferred)
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const adapter = new GitHubAdapter()
    const p1 = adapter.loadIndex()
    const p2 = adapter.loadIndex()
    resolveFn({ status: 200, ok: true, json: async () => ({ articles: [], lastUpdated: 'now' }) } as Response)
    await Promise.all([p1, p2])
    expect((fetchMock as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1)
  })

  it('cross-user cache isolation: user B cannot read user A cached index', async () => {
    // User A logs in, loads index → one fetch hits /api/articles/index.
    setUserScope('alice')
    const aliceArticles = { articles: [{ slug: 'a-secret', lastUpdated: 'now' }], lastUpdated: 'now' }
    const bobArticles = { articles: [{ slug: 'b-public', lastUpdated: 'now' }], lastUpdated: 'now' }
    let call = 0
    globalThis.fetch = vi.fn(async () => {
      call++
      return {
        status: 200, ok: true,
        json: async () => (call === 1 ? aliceArticles : bobArticles),
      } as unknown as Response
    }) as unknown as typeof fetch

    const a = new GitHubAdapter()
    const aIdx = await a.loadIndex()
    expect(aIdx.articles[0].slug).toBe('a-secret')

    // User A logs out, user B logs in — simulate via setUserScope (prod path
    // is `clearMemCache()` in useAuth.logout, then /api/auth/me sets new scope).
    setUserScope('bob')
    const b = new GitHubAdapter()
    const bIdx = await b.loadIndex()

    // If caches were user-keyed incorrectly, bIdx would be aliceArticles (leak).
    expect(bIdx.articles[0].slug).toBe('b-public')
    // And two real fetches happened — bob did not read alice's cache.
    expect(call).toBe(2)
  })

  it('setUserScope same login does not clear cache', async () => {
    setUserScope('alice')
    globalThis.fetch = vi.fn(async () => ({
      status: 200, ok: true, json: async () => ({ articles: [], lastUpdated: 'now' }),
    })) as unknown as typeof fetch
    const a = new GitHubAdapter()
    await a.loadIndex()
    setUserScope('alice') // no-op
    await a.loadIndex()
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1)
  })

  it('setUserScope changing login clears cache + inFlight', () => {
    setUserScope('alice')
    setCached('pub:alice:idx:index.json', { articles: [] }, 60_000)
    expect(getCached('pub:alice:idx:index.json')).not.toBeNull()
    setUserScope('bob')
    // Cache flushed on scope change
    expect(getCached('pub:alice:idx:index.json')).toBeNull()
    expect(getUserScope()).toBe('bob')
  })

  it('clearMemCache resets user scope', () => {
    setUserScope('alice')
    clearMemCache()
    expect(getUserScope()).toBeNull()
  })

  it('adapter auto-resolves login from /api/auth/me when scope unset', async () => {
    clearMemCache() // ensure scope is null
    let call = 0
    globalThis.fetch = vi.fn(async (url: string) => {
      call++
      if (String(url).includes('/api/auth/me')) {
        return { status: 200, ok: true, json: async () => ({ user: { login: 'carol' } }) } as unknown as Response
      }
      return { status: 200, ok: true, json: async () => ({ articles: [], lastUpdated: 'now' }) } as unknown as Response
    }) as unknown as typeof fetch
    const adapter = new GitHubAdapter()
    await adapter.loadIndex()
    expect(getUserScope()).toBe('carol')
    expect(call).toBeGreaterThanOrEqual(2)
  })
})
