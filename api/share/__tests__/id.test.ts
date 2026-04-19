/**
 * Tests for api/share/[id].ts — POST password path + GET public path.
 * Mocks @vercel/blob at the boundary. Guards B4: password in body (POST),
 * never in URL (GET rejects password-protected with 401 PASSWORD_REQUIRED).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import type { ShareRecord } from '../_lib'

// ---------- @vercel/blob mock ----------

const blobStore = new Map<string, unknown>()
const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
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
    mocks.store.set(key, JSON.parse(data))
    return { url: `blob://${key}` }
  }),
  del: vi.fn(async (key: string) => { mocks.store.delete(key) }),
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

function makeReq(method: string, query: Record<string, unknown>, body?: unknown, extraHeaders?: Record<string, string>) {
  return {
    method,
    query,
    body,
    headers: { ...(extraHeaders ?? {}) },
  } as any
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

describe('api/share/[id]', () => {
  beforeEach(() => { mocks.store.clear() })
  afterEach(() => { vi.clearAllMocks(); mocks.store.clear() })

  // ─── GET ───
  describe('GET', () => {
    it('returns article for no-password share', async () => {
      await seedRecord('idpublic0001', { passwordHash: null })
      const res = mockRes()
      await handler(makeReq('GET', { id: 'idpublic0001' }), res as any)
      expect(res.statusCode).toBe(200)
      expect((res.body as any).article.title).toBe('Hello')
    })

    it('returns 401 PASSWORD_REQUIRED for protected share (never reads ?password)', async () => {
      await seedRecord('idprotect001')
      const res = mockRes()
      // Even if attacker puts ?password=correct-pw in URL, GET must NOT accept it.
      await handler(makeReq('GET', { id: 'idprotect001', password: 'correct-pw' }), res as any)
      expect(res.statusCode).toBe(401)
      expect((res.body as any).error).toBe('PASSWORD_REQUIRED')
    })

    it('returns CORS allow-origin:* on GET', async () => {
      await seedRecord('idpublic0002', { passwordHash: null })
      const res = mockRes()
      await handler(makeReq('GET', { id: 'idpublic0002' }), res as any)
      expect(res.headers['Access-Control-Allow-Origin']).toBe('*')
    })

    it('returns 404 for missing share', async () => {
      const res = mockRes()
      await handler(makeReq('GET', { id: 'idmissing001' }), res as any)
      expect(res.statusCode).toBe(404)
    })
  })

  // ─── POST ───
  describe('POST (password in body)', () => {
    it('returns article for correct password in body', async () => {
      await seedRecord('idpost000001')
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000001' }, { password: 'correct-pw' }), res as any)
      expect(res.statusCode).toBe(200)
      expect((res.body as any).article.title).toBe('Hello')
    })

    it('returns 403 for wrong password', async () => {
      await seedRecord('idpost000002')
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000002' }, { password: 'wrong-pw' }), res as any)
      expect(res.statusCode).toBe(403)
    })

    it('parses JSON string body (raw fallback)', async () => {
      await seedRecord('idpost000003')
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000003' }, JSON.stringify({ password: 'correct-pw' })), res as any)
      expect(res.statusCode).toBe(200)
    })

    it('returns 400 when body is missing password', async () => {
      await seedRecord('idpost000004')
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000004' }, {}), res as any)
      expect(res.statusCode).toBe(400)
    })

    it('does NOT set Access-Control-Allow-Origin:* on POST (same-origin only)', async () => {
      await seedRecord('idpost000005', { passwordHash: null })
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000005' }, { password: 'any' }), res as any)
      expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
    })

    it('increments attempts and locks after MAX_ATTEMPTS wrong submissions', async () => {
      await seedRecord('idpost000006', { attempts: 9 })
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000006' }, { password: 'nope' }), res as any)
      expect(res.statusCode).toBe(403)
      const stored = mocks.store.get('shares/idpost000006.json') as ShareRecord
      expect(stored.attempts).toBe(10)
      expect(stored.locked).toBe(true)
    })

    it('404 for missing share on POST', async () => {
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost0absnt' }, { password: 'x' }), res as any)
      expect(res.statusCode).toBe(404)
    })

    it('works for no-password share on POST (returns article)', async () => {
      await seedRecord('idpost000007', { passwordHash: null })
      const res = mockRes()
      await handler(makeReq('POST', { id: 'idpost000007' }, { password: 'ignored' }), res as any)
      expect(res.statusCode).toBe(200)
    })
  })

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
})

// Satisfy import-used
void blobStore
