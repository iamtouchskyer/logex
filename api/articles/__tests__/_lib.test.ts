/**
 * Unit tests for api/articles/_lib.ts — fetchFromUserRepo branch mapping
 * and path-traversal defense.
 */
import { describe, it, expect, vi } from 'vitest'
import { fetchFromUserRepo, isSafeArticlePath } from '../_lib'

function mockFetch(responses: Array<{ status: number; json?: unknown }>) {
  let i = 0
  return vi.fn(async () => {
    const r = responses[i] ?? responses[responses.length - 1]
    i++
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      json: async () => r.json ?? {},
    } as unknown as Response
  })
}

describe('isSafeArticlePath', () => {
  it('accepts normal nested paths', () => {
    expect(isSafeArticlePath('2026/04/19/foo.zh.json')).toBe(true)
    expect(isSafeArticlePath('index.json')).toBe(true)
  })
  it('rejects parent-dir traversal', () => {
    expect(isSafeArticlePath('../secret')).toBe(false)
    expect(isSafeArticlePath('a/../b')).toBe(false)
  })
  it('rejects absolute paths', () => {
    expect(isSafeArticlePath('/etc/passwd')).toBe(false)
  })
  it('rejects newlines, backslashes, nulls', () => {
    expect(isSafeArticlePath('a\nb')).toBe(false)
    expect(isSafeArticlePath('a\\b')).toBe(false)
    expect(isSafeArticlePath('a\0b')).toBe(false)
  })
  it('rejects empty segments and specials', () => {
    expect(isSafeArticlePath('')).toBe(false)
    expect(isSafeArticlePath('a//b')).toBe(false)
    expect(isSafeArticlePath('./x')).toBe(false)
    expect(isSafeArticlePath('a/b@c')).toBe(false)
  })
  it('rejects non-strings and over-long paths', () => {
    expect(isSafeArticlePath(123 as unknown as string)).toBe(false)
    expect(isSafeArticlePath('a'.repeat(600))).toBe(false)
  })
})

describe('fetchFromUserRepo', () => {
  it('returns 200 + parsed body on success', async () => {
    const fetchImpl = mockFetch([{ status: 200, json: { articles: [] } }])
    const r = await fetchFromUserRepo('alice', 'ghu_x', 'index.json', fetchImpl as unknown as typeof fetch)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ articles: [] })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/alice/logex-data/contents/index.json')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ghu_x')
    expect((init.headers as Record<string, string>).Accept).toContain('raw')
  })

  it('returns 502 with UPSTREAM_PARSE_ERROR when body is not JSON', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => { throw new Error('not json') },
    })) as unknown as typeof fetch
    const r = await fetchFromUserRepo('alice', 'ghu_x', 'index.json', fetchImpl)
    expect(r.status).toBe(502)
    expect((r.body as { error: string }).error).toBe('UPSTREAM_PARSE_ERROR')
  })

  it('returns 404 REPO_NOT_FOUND when repo itself missing', async () => {
    // First call (file) → 404; second call (repo probe) → 404
    const fetchImpl = mockFetch([{ status: 404 }, { status: 404 }])
    const r = await fetchFromUserRepo('alice', 'ghu_x', 'index.json', fetchImpl as unknown as typeof fetch)
    expect(r.status).toBe(404)
    expect((r.body as { error: string }).error).toBe('REPO_NOT_FOUND')
    expect((r.body as { login: string }).login).toBe('alice')
  })

  it('returns 404 FILE_NOT_FOUND when repo exists but file missing', async () => {
    // First 404 for file, then 200 for repo probe
    const fetchImpl = mockFetch([{ status: 404 }, { status: 200, json: { name: 'logex-data' } }])
    const r = await fetchFromUserRepo('alice', 'ghu_x', 'nope.json', fetchImpl as unknown as typeof fetch)
    expect(r.status).toBe(404)
    expect((r.body as { error: string }).error).toBe('FILE_NOT_FOUND')
  })

  it('returns 403 INSUFFICIENT_SCOPE for 403 from GitHub', async () => {
    const fetchImpl = mockFetch([{ status: 403 }])
    const r = await fetchFromUserRepo('alice', 'ghu_x', 'index.json', fetchImpl as unknown as typeof fetch)
    expect(r.status).toBe(403)
    expect((r.body as { error: string }).error).toBe('INSUFFICIENT_SCOPE')
  })

  it('returns 403 INSUFFICIENT_SCOPE for 401 from GitHub (token revoked)', async () => {
    const fetchImpl = mockFetch([{ status: 401 }])
    const r = await fetchFromUserRepo('alice', 'ghu_x', 'index.json', fetchImpl as unknown as typeof fetch)
    expect(r.status).toBe(403)
  })

  it('returns 502 UPSTREAM_ERROR for other GitHub errors', async () => {
    const fetchImpl = mockFetch([{ status: 500 }])
    const r = await fetchFromUserRepo('alice', 'ghu_x', 'index.json', fetchImpl as unknown as typeof fetch)
    expect(r.status).toBe(502)
    expect((r.body as { upstreamStatus: number }).upstreamStatus).toBe(500)
  })
})
