/**
 * Tests for api/share/[id].ts — GET, POST, DELETE branches.
 *
 * Mock boundary = @vercel/blob only. verifyPassword uses real bcryptjs.
 * Session JWT minted via real signSession() so getAuthUser runs for real.
 *
 * BUG regression locks:
 *   - BUG-3: public (null passwordHash) share on POST must return 200, not 403.
 *   - BUG-5: DELETE with missing OR mismatched Origin header must 403 (CSRF).
 *   - BUG-6: isLocked() branch must 403 on both GET and POST once attempts hit MAX.
 *   - BUG-7: isExpired() branch must 410 on both GET and POST once expiresAt is past.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import type { ShareRecord, ShareIndex } from '../_lib'
import { signSession } from '../../_session'

// ---------- @vercel/blob mock (boundary only) ----------

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  putCalls: [] as { key: string; data: unknown }[],
  delCalls: [] as string[],
  delThrow: null as Error | null,
}))

vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (key: string) => {
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
  put: vi.fn(async (key: string, data: string) => {
    const parsed = JSON.parse(data)
    mocks.store.set(key, parsed)
    mocks.putCalls.push({ key, data: parsed })
    return { url: `blob://${key}` }
  }),
  del: vi.fn(async (key: string) => {
    if (mocks.delThrow) throw mocks.delThrow
    mocks.delCalls.push(key)
    mocks.store.delete(key)
  }),
}))

import handler from '../[id]'

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

function makeReq(
  method: string,
  query: Record<string, unknown>,
  body?: unknown,
  extraHeaders?: Record<string, string>,
) {
  return { method, query, body, headers: { ...(extraHeaders ?? {}) } } as any
}

function validCookie(login = 'alice'): string {
  const token = signSession({ login, access_token: 'tok_test' })
  return `session=${token}`
}

async function seedRecord(id: string, overrides: Partial<ShareRecord> = {}): Promise<ShareRecord> {
  const rec: ShareRecord = {
    id,
    slug: 'test-slug',
    passwordHash: await bcrypt.hash('correct-pw', 4),
    createdBy: 'alice',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    attempts: 0,
    locked: false,
    articleSnapshot: { title: 'Hello', body: '# hi' },
    ...overrides,
  }
  mocks.store.set(`shares/${id}.json`, rec)
  return rec
}

function seedIndex(login: string, shares: string[]): void {
  const idx: ShareIndex = { shares }
  mocks.store.set(`shares/index-${login}.json`, idx)
}

describe('api/share/[id]', () => {
  beforeEach(() => {
    mocks.store.clear()
    mocks.putCalls.length = 0
    mocks.delCalls.length = 0
    mocks.delThrow = null
  })
  afterEach(() => { vi.clearAllMocks() })

  // ─────────────────────────────── GET ───────────────────────────────
  describe('GET', () => {
    it('200 returns article for public (no-password) share', async () => {
      await seedRecord('idpublic0001', { passwordHash: null })
      const res = mockRes()
      await handler(makeReq('GET', { id: 'idpublic0001' }), res as any)
      expect(res.statusCode).toBe(200)
      expect((res.body as any).article.title).toBe('Hello')
      expect((res.body as any).slug).toBe('test-slug')
    })

    it('200 returns article=null when snapshot missing', async () => {
      await seedRecord('idpublic0003', { passwordHash: null, articleSnapshot: undefined })
      const res = mockRes()
      await handler(makeReq('GET', { id: 'idpublic0003' }), res as any)
      expect(res.statusCode).toBe(200)
      expect((res.body as any).article).toBeNull()
    })

    it('401 PASSWORD_REQUIRED for protected share — refuses ?password query', async () => {
      await seedRecord('idprotect001')
      const res = mockRes()
      await handler(makeReq('GET', { id: 'idprotect001', password: 'correct-pw' }), res as any)
      expect(res.statusCode).toBe(401)
      expect((res.body as any).error).toBe('PASSWORD_REQUIRED')
    })

    it('CORS allow-origin:* only on GET', async () => {
      await seedRecord('idpublic0002', { passwordHash: null })
      const res = mockRes()
      await handler(makeReq('GET', { id: 'idpublic0002' }), res as any)
      expect(res.headers['Access-Control-Allow-Origin']).toBe('*')
    })

    it('404 when share does not exist', async () => {
      const res = mockRes()
      await handler(makeReq('GET', { id: 'idmissing001' }), res as any)
      expect(res.statusCode).toBe(404)
    })

    it('BUG-7 regression: GET on expired share returns 410 (isExpired branch)', async () => {
      await seedRecord('idexpired001', {
        passwordHash: null,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      })
      const res = mockRes()
      await handler(makeReq('GET', { id: 'idexpired001' }), res as any)
      expect(res.statusCode).toBe(410)
      expect((res.body as any).error).toBe('Share expired')
    })

    it('BUG-6 regression: GET on locked share returns 403 (isLocked branch)', async () => {
      // attempts already at MAX_ATTEMPTS (10) -> isLocked() true even w/o locked flag
      await seedRecord('idlocked0001', { attempts: 10 })
      const res = mockRes()
      await handler(makeReq('GET', { id: 'idlocked0001' }), res as any)
      expect(res.statusCode).toBe(403)
      expect((res.body as any).error).toMatch(/locked/i)
    })

    it('400 on invalid id format (isValidId false)', async () => {
      const res = mockRes()
      await handler(makeReq('GET', { id: 'bad!!' }), res as any)
      expect(res.statusCode).toBe(400)
    })
  })

  // ─────────────────────────────── POST ───────────────────────────────
  describe('POST', () => {
    it('200 with correct password (real bcryptjs verifyPassword)', async () => {
      await seedRecord('idpost000001')
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000001' }, { password: 'correct-pw' }), res as any)
      expect(res.statusCode).toBe(200)
      expect((res.body as any).article.title).toBe('Hello')
    })

    it('403 wrong password AND asserts real writeBlob call with attempts incremented', async () => {
      await seedRecord('idpost000002', { attempts: 3 })
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000002' }, { password: 'wrong-pw' }), res as any)
      expect(res.statusCode).toBe(403)
      // Real writeBlob (put) call happens — assert it
      const writeCall = mocks.putCalls.find((c) => c.key === 'shares/idpost000002.json')
      expect(writeCall).toBeDefined()
      expect((writeCall!.data as ShareRecord).attempts).toBe(4)
      expect((writeCall!.data as ShareRecord).locked).toBe(false)
      // And the stored record now has attempts=4
      const stored = mocks.store.get('shares/idpost000002.json') as ShareRecord
      expect(stored.attempts).toBe(4)
    })

    it('wrong password at threshold writes locked=true', async () => {
      await seedRecord('idpost000006', { attempts: 9 })
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000006' }, { password: 'nope' }), res as any)
      expect(res.statusCode).toBe(403)
      const stored = mocks.store.get('shares/idpost000006.json') as ShareRecord
      expect(stored.attempts).toBe(10)
      expect(stored.locked).toBe(true)
    })

    it('parses JSON string body (raw string fallback path)', async () => {
      await seedRecord('idpost000003')
      const res = mockRes()
      await handler(
        makeReq('POST', { id: 'idpost000003' }, JSON.stringify({ password: 'correct-pw' })),
        res as any,
      )
      expect(res.statusCode).toBe(200)
    })

    it('invalid JSON string body is ignored — 400 missing password', async () => {
      await seedRecord('idpost000003b')
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000003b' }, 'not-json{'), res as any)
      expect(res.statusCode).toBe(400)
    })

    it('JSON string body with non-string password is ignored — 400', async () => {
      await seedRecord('idpost000003c')
      const res = mockRes()
      await handler(
        makeReq('POST', { id: 'idpost000003c' }, JSON.stringify({ password: 12345 })),
        res as any,
      )
      expect(res.statusCode).toBe(400)
    })

    it('400 when body is missing password', async () => {
      await seedRecord('idpost000004')
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000004' }, {}), res as any)
      expect(res.statusCode).toBe(400)
    })

    it('400 when body object has non-string password', async () => {
      await seedRecord('idpost000004c')
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000004c' }, { password: 999 }), res as any)
      expect(res.statusCode).toBe(400)
    })

    it('does NOT set Access-Control-Allow-Origin:* on POST (same-origin only)', async () => {
      await seedRecord('idpost000005', { passwordHash: null })
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000005' }, { password: 'any' }), res as any)
      expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
    })

    it('404 when share does not exist on POST', async () => {
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost0absnt' }, { password: 'x' }), res as any)
      expect(res.statusCode).toBe(404)
    })

    it('400 on invalid id on POST', async () => {
      const res = mockRes()
      await handler(makeReq('POST', { id: 'bad!!' }, { password: 'x' }), res as any)
      expect(res.statusCode).toBe(400)
    })

    it('BUG-3 regression: POST to public (null passwordHash) share returns 200 with article, no password required', async () => {
      // If prod code were flipped to 403 here, this test MUST fail.
      await seedRecord('idbug3public', {
        passwordHash: null,
        articleSnapshot: { title: 'Public!', body: 'x' },
      })
      const res = mockRes()
      await handler(
        makeReq('POST', { id: 'idbug3public' }, { password: 'ignored-anyway' }),
        res as any,
      )
      expect(res.statusCode).toBe(200)
      expect((res.body as any).article.title).toBe('Public!')
      expect((res.body as any).slug).toBe('test-slug')
      // Crucially, no writeBlob (no attempts increment on public shares)
      expect(mocks.putCalls.length).toBe(0)
    })

    it('BUG-7 regression: POST on expired share returns 410 (isExpired branch)', async () => {
      await seedRecord('idbug7expire', {
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      })
      const res = mockRes()
      await handler(
        makeReq('POST', { id: 'idbug7expire' }, { password: 'correct-pw' }),
        res as any,
      )
      expect(res.statusCode).toBe(410)
      expect((res.body as any).error).toBe('Share expired')
      expect(mocks.putCalls.length).toBe(0)
    })

    it('BUG-6 regression: POST on locked share returns 403 (isLocked branch), no verify, no increment', async () => {
      await seedRecord('idbug6locked', { attempts: 10, locked: true })
      const res = mockRes()
      await handler(
        makeReq('POST', { id: 'idbug6locked' }, { password: 'correct-pw' }),
        res as any,
      )
      expect(res.statusCode).toBe(403)
      expect((res.body as any).error).toMatch(/locked/i)
      // Locked short-circuits BEFORE verifyPassword — no writeBlob
      expect(mocks.putCalls.length).toBe(0)
    })
  })

  // ─────────────────────────────── DELETE ───────────────────────────────
  describe('DELETE', () => {
    const ORIGIN = 'https://logex.example'
    const HOST = 'logex.example'

    it('BUG-5 regression: DELETE with no Origin header returns 403 CSRF (no-origin hole closed)', async () => {
      await seedRecord('iddel00no001')
      const res = mockRes()
      await handler(
        makeReq('DELETE', { id: 'iddel00no001' }, undefined, {
          host: HOST,
          cookie: validCookie(),
        }),
        res as any,
      )
      expect(res.statusCode).toBe(403)
      expect((res.body as any).error).toMatch(/CSRF/i)
      expect(mocks.delCalls.length).toBe(0)
    })

    it('BUG-5 regression: DELETE with mismatched Origin host returns 403 CSRF', async () => {
      await seedRecord('iddelmismatc')
      const res = mockRes()
      await handler(
        makeReq('DELETE', { id: 'iddelmismatc' }, undefined, {
          origin: 'https://attacker.evil',
          host: HOST,
          cookie: validCookie(),
        }),
        res as any,
      )
      expect(res.statusCode).toBe(403)
      expect((res.body as any).error).toMatch(/CSRF/i)
      expect(mocks.delCalls.length).toBe(0)
    })

    it('DELETE with malformed Origin returns 403 (URL parse throws)', async () => {
      await seedRecord('iddelbadurl1')
      const res = mockRes()
      await handler(
        makeReq('DELETE', { id: 'iddelbadurl1' }, undefined, {
          origin: 'not-a-url',
          host: HOST,
          cookie: validCookie(),
        }),
        res as any,
      )
      expect(res.statusCode).toBe(403)
    })

    it('DELETE with missing host header returns 403 CSRF', async () => {
      await seedRecord('iddelnohost1')
      const res = mockRes()
      await handler(
        makeReq('DELETE', { id: 'iddelnohost1' }, undefined, {
          origin: ORIGIN,
          cookie: validCookie(),
        }),
        res as any,
      )
      expect(res.statusCode).toBe(403)
    })

    it('DELETE 401 when unauthenticated (no session cookie)', async () => {
      await seedRecord('iddelnoauth1')
      const res = mockRes()
      await handler(
        makeReq('DELETE', { id: 'iddelnoauth1' }, undefined, {
          origin: ORIGIN,
          host: HOST,
        }),
        res as any,
      )
      expect(res.statusCode).toBe(401)
    })

    it('DELETE 400 on invalid id', async () => {
      const res = mockRes()
      await handler(
        makeReq('DELETE', { id: 'bad!!' }, undefined, {
          origin: ORIGIN,
          host: HOST,
          cookie: validCookie(),
        }),
        res as any,
      )
      expect(res.statusCode).toBe(400)
    })

    it('DELETE 404 when share does not exist', async () => {
      const res = mockRes()
      await handler(
        makeReq('DELETE', { id: 'iddelabsent1' }, undefined, {
          origin: ORIGIN,
          host: HOST,
          cookie: validCookie(),
        }),
        res as any,
      )
      expect(res.statusCode).toBe(404)
    })

    it('DELETE 403 when user does not own the share', async () => {
      await seedRecord('iddelnotmine', { createdBy: 'bob' })
      const res = mockRes()
      await handler(
        makeReq('DELETE', { id: 'iddelnotmine' }, undefined, {
          origin: ORIGIN,
          host: HOST,
          cookie: validCookie('alice'),
        }),
        res as any,
      )
      expect(res.statusCode).toBe(403)
      expect((res.body as any).error).toBe('Forbidden')
      expect(mocks.delCalls.length).toBe(0)
    })

    it('DELETE 204 happy path — removes blob and filters index', async () => {
      await seedRecord('iddelhappy01')
      seedIndex('alice', ['iddelhappy01', 'other0000001'])
      const res = mockRes()
      await handler(
        makeReq('DELETE', { id: 'iddelhappy01' }, undefined, {
          origin: ORIGIN,
          host: HOST,
          cookie: validCookie('alice'),
        }),
        res as any,
      )
      expect(res.statusCode).toBe(204)
      expect(res._ended).toBe(true)
      expect(mocks.delCalls).toContain('shares/iddelhappy01.json')
      const idx = mocks.store.get('shares/index-alice.json') as ShareIndex
      expect(idx.shares).toEqual(['other0000001'])
    })

    it('DELETE 204 when index does not exist — still succeeds', async () => {
      await seedRecord('iddelnoindex')
      const res = mockRes()
      await handler(
        makeReq('DELETE', { id: 'iddelnoindex' }, undefined, {
          origin: ORIGIN,
          host: HOST,
          cookie: validCookie('alice'),
        }),
        res as any,
      )
      expect(res.statusCode).toBe(204)
      expect(mocks.delCalls).toContain('shares/iddelnoindex.json')
    })

    it('DELETE 500 when blob del() throws', async () => {
      await seedRecord('iddelthrow01')
      mocks.delThrow = new Error('blob down')
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const res = mockRes()
      await handler(
        makeReq('DELETE', { id: 'iddelthrow01' }, undefined, {
          origin: ORIGIN,
          host: HOST,
          cookie: validCookie('alice'),
        }),
        res as any,
      )
      expect(res.statusCode).toBe(500)
      errSpy.mockRestore()
    })
  })

  // ─────────────────────────────── misc ───────────────────────────────
  it('405 on PUT', async () => {
    const res = mockRes()
    await handler(makeReq('PUT', { id: 'idpost000008' }), res as any)
    expect(res.statusCode).toBe(405)
  })

  it('OPTIONS returns 204', async () => {
    const res = mockRes()
    await handler(makeReq('OPTIONS', { id: 'idpost000009' }), res as any)
    expect(res.statusCode).toBe(204)
  })

  it('400 when id query param missing entirely', async () => {
    const res = mockRes()
    await handler(makeReq('GET', {}), res as any)
    expect(res.statusCode).toBe(400)
  })
})
