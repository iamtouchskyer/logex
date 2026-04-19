/**
 * Tests for api/share/index.ts — POST handleCreate + GET handleList paths.
 *
 * Regression guards:
 *   - BUG-1: put() must pass allowOverwrite:true so re-create / index update never 500s.
 *   - BUG-4: stored title is sourced from articleSnapshot.title, NOT top-level body.title.
 *
 * Mock boundary (per harness rules):
 *   - @vercel/blob (external SDK) — mocked.
 *   - articles/_lib.js fetchFromUserRepo — mocked at the boundary wrapper that does
 *     GitHub fetch calls. (Flagged as 🟡 in handshake: strictly it's own code;
 *     ideal is mocking global fetch. Left for a future unit.)
 *   - ../_lib.js (session, shareKey, isValidId, etc.) — REAL. We sign real JWTs
 *     via ../../_session.js:signSession so getAuthUser/getAuthUserFull run for real.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { signSession } from '../../_session'
import type { ShareRecord, ShareIndex } from '../_lib'

// ---------- @vercel/blob mock ----------

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  putCalls: [] as Array<{ key: string; body: string; opts: Record<string, unknown> }>,
  // control hook: when set, put() with this key throws
  putFailKey: null as string | null,
  getFailKey: null as string | null,
}))

vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (key: string) => {
    if (mocks.getFailKey === key) throw new Error('get failed')
    if (!mocks.store.has(key)) return null
    const data = mocks.store.get(key)
    return {
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(data)))
          controller.close()
        },
      }),
    }
  }),
  put: vi.fn(async (key: string, data: string, opts?: Record<string, unknown>) => {
    if (mocks.putFailKey === key) throw new Error('put failed')
    mocks.putCalls.push({ key, body: data, opts: opts ?? {} })
    mocks.store.set(key, JSON.parse(data))
    return { url: `blob://${key}` }
  }),
  del: vi.fn(async (key: string) => { mocks.store.delete(key) }),
  list: vi.fn(async () => ({ blobs: [] })),
}))

// ---------- fetchFromUserRepo mock (external boundary wrapper for GitHub) ----------

const fetchMocks = vi.hoisted(() => ({
  indexStatus: 200 as number,
  indexBody: null as unknown,
  articleStatus: 200 as number,
  articleBody: null as unknown,
}))

vi.mock('../../articles/_lib.js', () => ({
  fetchFromUserRepo: vi.fn(async (_login: string, _token: string, path: string) => {
    if (path === 'index.json') {
      return {
        status: fetchMocks.indexStatus,
        body: fetchMocks.indexBody ?? {
          articles: [
            { slug: 'slug-a', path: 'articles/slug-a.md' },
            { slug: 'slug-b', path: 'articles/slug-b.md' },
            { slug: 'slug-i18n', primaryLang: 'en', i18n: { en: { path: 'articles/slug-i18n.en.md' } } },
          ],
        },
      }
    }
    return {
      status: fetchMocks.articleStatus,
      body: fetchMocks.articleBody ?? { title: 'Real Title', body: '# content', heroImage: 'hero.png' },
    }
  }),
}))

import handler from '../index'

// ---------- helpers ----------

function mockRes() {
  const headers: Record<string, string> = {}
  return {
    statusCode: 0,
    body: null as unknown,
    _ended: false,
    headers,
    headersSent: false,
    status(n: number) { this.statusCode = n; return this },
    json(b: unknown) { this.body = b; return this },
    end() { this._ended = true },
    setHeader(k: string, v: string) { headers[k] = v },
  }
}

function validCookie(overrides: Record<string, unknown> = {}): string {
  const token = signSession({ login: 'alice', access_token: 'tok_test', ...overrides })
  return `session=${token}`
}

function expiredCookie(): string {
  // exp in the past — verifySession will reject
  const token = signSession({ login: 'alice', access_token: 'tok_test', exp: Math.floor(Date.now() / 1000) - 3600 })
  return `session=${token}`
}

const NO_COOKIE = Symbol('no-cookie')
function makeReq(method: string, body?: unknown, cookie: string | typeof NO_COOKIE = validCookie()) {
  const headers: Record<string, string> = {}
  if (cookie !== NO_COOKIE && typeof cookie === 'string') headers.cookie = cookie
  return { method, query: {}, body, headers } as any
}

function resetFetchMocks() {
  fetchMocks.indexStatus = 200
  fetchMocks.indexBody = null
  fetchMocks.articleStatus = 200
  fetchMocks.articleBody = null
}

// ---------- tests ----------

describe('api/share/index — method routing', () => {
  beforeEach(() => { mocks.store.clear(); mocks.putCalls.length = 0; mocks.putFailKey = null; mocks.getFailKey = null; resetFetchMocks() })
  afterEach(() => { vi.clearAllMocks() })

  it('OPTIONS returns 204', async () => {
    const res = mockRes()
    await handler(makeReq('OPTIONS'), res as any)
    expect(res.statusCode).toBe(204)
    expect(res._ended).toBe(true)
  })

  it('PUT returns 405 Method not allowed', async () => {
    const res = mockRes()
    await handler(makeReq('PUT', {}), res as any)
    expect(res.statusCode).toBe(405)
  })

  it('DELETE returns 405 Method not allowed', async () => {
    const res = mockRes()
    await handler(makeReq('DELETE'), res as any)
    expect(res.statusCode).toBe(405)
  })

  it('unhandled error falls through to 500', async () => {
    // Force any internal op to throw by making getAuthUserFull-path pass but
    // index fetchFromUserRepo throw. fetchFromUserRepo is mocked — temporarily
    // make it throw to hit the catch-block.
    const mod = await import('../../articles/_lib.js')
    ;(mod.fetchFromUserRepo as any).mockImplementationOnce(() => { throw new Error('boom') })
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(500)
    expect((res.body as any).error).toMatch(/temporarily unavailable/i)
  })
})

describe('api/share/index POST (handleCreate)', () => {
  beforeEach(() => { mocks.store.clear(); mocks.putCalls.length = 0; mocks.putFailKey = null; mocks.getFailKey = null; resetFetchMocks() })
  afterEach(() => { vi.clearAllMocks() })

  // ─── auth ───

  it('401 when no cookie', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a' }, NO_COOKIE), res as any)
    expect(res.statusCode).toBe(401)
  })

  it('401 when session cookie is an expired JWT', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a' }, expiredCookie()), res as any)
    expect(res.statusCode).toBe(401)
  })

  it('401 when session cookie present but no access_token in payload', async () => {
    // Sign a session with NO access_token — handleCreate requires it for GitHub fetch
    const token = signSession({ login: 'alice' })
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a' }, `session=${token}`), res as any)
    expect(res.statusCode).toBe(401)
  })

  // ─── validation ───

  it('400 missing slug', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(400)
    expect((res.body as any).error).toMatch(/slug/i)
  })

  it('400 when slug is empty string', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: '   ', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(400)
  })

  it('400 when slug is wrong type', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 123 as any, expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(400)
  })

  it('400 when password is too short', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', password: 'abc', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(400)
    expect((res.body as any).error).toMatch(/4 characters/)
  })

  it('400 when expiresInDays out of range (<1)', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 0 }), res as any)
    expect(res.statusCode).toBe(400)
  })

  it('400 when expiresInDays out of range (>365)', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 9999 }), res as any)
    expect(res.statusCode).toBe(400)
  })

  it('400 when expiresInDays is non-numeric', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 'seven' as any }), res as any)
    expect(res.statusCode).toBe(400)
  })

  // ─── cap ───

  it('429 when user has reached MAX_SHARES_PER_USER', async () => {
    const { indexKey, MAX_SHARES_PER_USER } = await import('../_lib')
    const idx: ShareIndex = { shares: Array.from({ length: MAX_SHARES_PER_USER }, (_, i) => `share${i}aaaaa`.slice(0, 12)) }
    mocks.store.set(indexKey('alice'), idx)
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(429)
  })

  // ─── upstream (GitHub) failures ───

  it('400 when article index fetch fails (non-200)', async () => {
    fetchMocks.indexStatus = 502
    fetchMocks.indexBody = { error: 'UPSTREAM' }
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(400)
    expect((res.body as any).error).toMatch(/article index/i)
  })

  it('404 when requested slug is not in the index', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'does-not-exist', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(404)
    expect((res.body as any).error).toMatch(/not found/i)
  })

  it('400 when matched article has no path (neither i18n nor top-level)', async () => {
    fetchMocks.indexBody = { articles: [{ slug: 'slug-a' /* no path, no i18n */ }] }
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(400)
    expect((res.body as any).error).toMatch(/content path/i)
  })

  it('400 when article body fetch fails', async () => {
    fetchMocks.articleStatus = 502
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(400)
    expect((res.body as any).error).toMatch(/article body/i)
  })

  it('resolves path through i18n map when primaryLang entry is present', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-i18n', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(201)
  })

  it('resolves path through i18n first entry when primaryLang is missing', async () => {
    fetchMocks.indexBody = {
      articles: [{ slug: 'slug-nolang', i18n: { zh: { path: 'articles/slug-zh.md' } } }],
    }
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-nolang', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(201)
  })

  // ─── happy path ───

  it('happy path — creates share, returns 201 with id + expiresAt, no URL', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(201)
    const body = res.body as any
    expect(body.id).toMatch(/^[A-Za-z0-9]{12}$/)
    expect(typeof body.expiresAt).toBe('string')
    expect(body.url).toBeUndefined()
  })

  it('happy path — persists record with correct shape under shareKey', async () => {
    const { shareKey } = await import('../_lib')
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    const id = (res.body as any).id
    const stored = mocks.store.get(shareKey(id)) as ShareRecord
    expect(stored.slug).toBe('slug-a')
    expect(stored.createdBy).toBe('alice')
    expect(stored.attempts).toBe(0)
    expect(stored.locked).toBe(false)
    expect(stored.passwordHash).toBeNull()
    expect(stored.articleSnapshot).toMatchObject({ title: 'Real Title' })
  })

  it('happy path — persists a bcrypt hash (not plaintext) when password provided', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', password: 'hunter2', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(201)
    const { shareKey } = await import('../_lib')
    const id = (res.body as any).id
    const stored = mocks.store.get(shareKey(id)) as ShareRecord
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/) // bcrypt prefix
    expect(stored.passwordHash).not.toBe('hunter2')
  })

  it('happy path — updates index blob with the new share id appended', async () => {
    const { indexKey } = await import('../_lib')
    mocks.store.set(indexKey('alice'), { shares: ['existingid01'] })
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    const id = (res.body as any).id
    const idx = mocks.store.get(indexKey('alice')) as ShareIndex
    expect(idx.shares).toEqual(['existingid01', id])
  })

  it('swallows index-blob update failure (share still created, 201 returned)', async () => {
    const { indexKey } = await import('../_lib')
    mocks.putFailKey = indexKey('alice')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(201) // share record write succeeded
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('500 when share-record put() throws (caught at top-level handler)', async () => {
    // Rig put to throw regardless of key
    const { put } = await import('@vercel/blob')
    ;(put as any).mockImplementationOnce(async () => { throw new Error('blob write failed') })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(500)
    errSpy.mockRestore()
  })

  // ─── BUG-1: allowOverwrite ───

  it('BUG-1 regression: every put() call carries allowOverwrite:true', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(201)
    expect(mocks.putCalls.length).toBeGreaterThanOrEqual(2) // share record + index
    for (const call of mocks.putCalls) {
      expect(call.opts.allowOverwrite).toBe(true)
      expect(call.opts.access).toBe('private')
      expect(call.opts.addRandomSuffix).toBe(false)
    }
  })

  it('BUG-1 regression: re-create path (index already exists) still passes allowOverwrite:true on index update', async () => {
    const { indexKey } = await import('../_lib')
    // Seed an existing index so the second write is an upsert-overwrite
    mocks.store.set(indexKey('alice'), { shares: ['priorshareid'] })
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-b', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(201)
    const indexUpdateCall = mocks.putCalls.find((c) => c.key === indexKey('alice'))
    expect(indexUpdateCall, 'index blob must be re-written').toBeDefined()
    expect(indexUpdateCall!.opts.allowOverwrite).toBe(true)
  })

  it('BUG-1 regression: two sequential creates both return 201 (no 500 from BlobError) — covers the original bug', async () => {
    const res1 = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res1 as any)
    expect(res1.statusCode).toBe(201)
    const res2 = mockRes()
    await handler(makeReq('POST', { slug: 'slug-b', expiresInDays: 7 }), res2 as any)
    expect(res2.statusCode).toBe(201)
    for (const call of mocks.putCalls) {
      expect(call.opts.allowOverwrite).toBe(true)
    }
  })

  // ─── BUG-4: title from articleSnapshot, not top-level ───

  it('BUG-4 regression: stored articleSnapshot.title comes from the fetched article, NOT from top-level body.title', async () => {
    fetchMocks.articleBody = { title: 'CORRECT', body: '# real' }
    const res = mockRes()
    // Include a bogus top-level title that production MUST ignore
    await handler(makeReq('POST', { slug: 'slug-a', title: 'WRONG_TOP_LEVEL', expiresInDays: 7 } as any), res as any)
    expect(res.statusCode).toBe(201)
    const { shareKey } = await import('../_lib')
    const id = (res.body as any).id
    // Read from what was actually written (put mock captured it)
    const putCall = mocks.putCalls.find((c) => c.key === shareKey(id))
    expect(putCall).toBeDefined()
    const persisted = JSON.parse(putCall!.body) as ShareRecord
    const snap = persisted.articleSnapshot as { title?: string }
    expect(snap.title).toBe('CORRECT')
    // And explicitly: the persisted record has no copy of the top-level 'WRONG' title
    expect((persisted as any).title).toBeUndefined()
  })

  it('BUG-4 regression: listing uses articleSnapshot.title, not a top-level title', async () => {
    fetchMocks.articleBody = { title: 'SnapshotTitle', body: '# body' }
    const createRes = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', title: 'IGNORED_TOP', expiresInDays: 7 } as any), createRes as any)
    expect(createRes.statusCode).toBe(201)
    const listRes = mockRes()
    await handler(makeReq('GET', undefined), listRes as any)
    expect(listRes.statusCode).toBe(200)
    const shares = (listRes.body as any).shares as Array<{ title?: string }>
    expect(shares).toHaveLength(1)
    expect(shares[0].title).toBe('SnapshotTitle')
  })
})

describe('api/share/index GET (handleList)', () => {
  beforeEach(() => { mocks.store.clear(); mocks.putCalls.length = 0; mocks.putFailKey = null; mocks.getFailKey = null; resetFetchMocks() })
  afterEach(() => { vi.clearAllMocks() })

  it('401 when no cookie', async () => {
    const res = mockRes()
    await handler(makeReq('GET', undefined, NO_COOKIE), res as any)
    expect(res.statusCode).toBe(401)
  })

  it('401 when session JWT is expired', async () => {
    const res = mockRes()
    await handler(makeReq('GET', undefined, expiredCookie()), res as any)
    expect(res.statusCode).toBe(401)
  })

  it('200 with empty shares array when no index blob exists', async () => {
    const res = mockRes()
    await handler(makeReq('GET', undefined), res as any)
    expect(res.statusCode).toBe(200)
    expect((res.body as any).shares).toEqual([])
  })

  it('200 with empty shares array when index exists but has no entries', async () => {
    const { indexKey } = await import('../_lib')
    mocks.store.set(indexKey('alice'), { shares: [] })
    const res = mockRes()
    await handler(makeReq('GET', undefined), res as any)
    expect(res.statusCode).toBe(200)
    expect((res.body as any).shares).toEqual([])
  })

  it('200 returns ShareMeta records with correct shape and ordering (newest first)', async () => {
    const { indexKey, shareKey } = await import('../_lib')
    const older: ShareRecord = {
      id: 'olderid00001', slug: 'a', passwordHash: null, createdBy: 'alice',
      createdAt: '2020-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
      attempts: 0, locked: false, articleSnapshot: { title: 'A' },
    }
    const newer: ShareRecord = {
      id: 'newerid00001', slug: 'b', passwordHash: null, createdBy: 'alice',
      createdAt: '2024-06-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
      attempts: 0, locked: true, articleSnapshot: { title: 'B' },
    }
    mocks.store.set(shareKey(older.id), older)
    mocks.store.set(shareKey(newer.id), newer)
    mocks.store.set(indexKey('alice'), { shares: [older.id, newer.id] })

    const res = mockRes()
    await handler(makeReq('GET', undefined), res as any)
    expect(res.statusCode).toBe(200)
    const shares = (res.body as any).shares as Array<any>
    expect(shares).toHaveLength(2)
    expect(shares[0].id).toBe('newerid00001')
    expect(shares[0].title).toBe('B')
    expect(shares[0].locked).toBe(true)
    expect(shares[1].id).toBe('olderid00001')
    // Ensure sensitive fields not leaked into meta
    expect(shares[0].passwordHash).toBeUndefined()
    expect(shares[0].articleSnapshot).toBeUndefined()
    expect(shares[0].attempts).toBeUndefined()
  })

  it('gracefully skips orphan IDs (index references a share whose blob is missing)', async () => {
    const { indexKey, shareKey } = await import('../_lib')
    const good: ShareRecord = {
      id: 'goodshareid1', slug: 'a', passwordHash: null, createdBy: 'alice',
      createdAt: '2024-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
      attempts: 0, locked: false, articleSnapshot: { title: 'Good' },
    }
    mocks.store.set(shareKey(good.id), good)
    mocks.store.set(indexKey('alice'), { shares: ['orphanrecrd1', good.id] })

    const res = mockRes()
    await handler(makeReq('GET', undefined), res as any)
    expect(res.statusCode).toBe(200)
    const shares = (res.body as any).shares as Array<any>
    expect(shares).toHaveLength(1)
    expect(shares[0].id).toBe('goodshareid1')
  })

  it('handles undefined articleSnapshot (legacy record) without crashing', async () => {
    const { indexKey, shareKey } = await import('../_lib')
    const legacy: ShareRecord = {
      id: 'legacyshare1', slug: 'a', passwordHash: null, createdBy: 'alice',
      createdAt: '2024-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
      attempts: 0, locked: false,
      // no articleSnapshot
    }
    mocks.store.set(shareKey(legacy.id), legacy)
    mocks.store.set(indexKey('alice'), { shares: [legacy.id] })

    const res = mockRes()
    await handler(makeReq('GET', undefined), res as any)
    expect(res.statusCode).toBe(200)
    const shares = (res.body as any).shares as Array<any>
    expect(shares).toHaveLength(1)
    expect(shares[0].title).toBeUndefined()
  })
})
