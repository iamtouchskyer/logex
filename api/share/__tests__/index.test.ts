/**
 * Tests for api/share/index.ts — POST handleCreate path.
 * Regression guard: allowOverwrite:true prevents BlobError on re-create.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------- @vercel/blob mock ----------

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  putCalls: [] as Array<{ key: string; opts: Record<string, unknown> }>,
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
  put: vi.fn(async (key: string, data: string, opts?: Record<string, unknown>) => {
    mocks.putCalls.push({ key, opts: opts ?? {} })
    mocks.store.set(key, JSON.parse(data))
    return { url: `blob://${key}` }
  }),
  del: vi.fn(async (key: string) => { mocks.store.delete(key) }),
}))

// ---------- mock session ----------

vi.mock('../_lib.js', async (importOriginal) => {
  const original = await importOriginal() as any
  return {
    ...original,
    getAuthUser: vi.fn(() => 'alice'),
    getAuthUserFull: vi.fn(() => ({ login: 'alice', access_token: 'tok_test' })),
  }
})

vi.mock('../../articles/_lib.js', () => ({
  fetchFromUserRepo: vi.fn(async (_login: string, _token: string, path: string) => {
    if (path === 'index.json') {
      return {
        status: 200,
        body: {
          articles: [
            { slug: 'slug-a', path: 'articles/slug-a.md' },
            { slug: 'slug-b', path: 'articles/slug-b.md' },
          ],
        },
      }
    }
    return { status: 200, body: { title: `Article ${path}`, body: '# content' } }
  }),
}))

import handler from '../index'

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

function makeReq(method: string, body?: unknown) {
  return {
    method,
    query: {},
    body,
    headers: { cookie: 'session=test' },
  } as any
}

describe('api/share/index POST (handleCreate)', () => {
  beforeEach(() => { mocks.store.clear(); mocks.putCalls.length = 0 })
  afterEach(() => { vi.clearAllMocks(); mocks.store.clear(); mocks.putCalls.length = 0 })

  it('happy path — creates share and returns 201', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(201)
    expect((res.body as any).id).toBeTruthy()
    expect((res.body as any).url).toBeUndefined()
  })

  it('all put() calls include allowOverwrite: true', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    expect(res.statusCode).toBe(201)
    expect(mocks.putCalls.length).toBeGreaterThanOrEqual(1)
    for (const call of mocks.putCalls) {
      expect(call.opts).toHaveProperty('allowOverwrite', true)
    }
  })

  it('regression: second create (re-create) returns 201, not 500 — allowOverwrite prevents BlobError', async () => {
    // First create with slug-a
    const res1 = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res1 as any)
    expect(res1.statusCode).toBe(201)

    // Second create with slug-b — index blob already exists
    const res2 = mockRes()
    await handler(makeReq('POST', { slug: 'slug-b', expiresInDays: 7 }), res2 as any)
    expect(res2.statusCode).toBe(201)

    // Verify all put calls had allowOverwrite
    for (const call of mocks.putCalls) {
      expect(call.opts.allowOverwrite).toBe(true)
    }
  })

  it('keeps access: private on all put calls', async () => {
    const res = mockRes()
    await handler(makeReq('POST', { slug: 'slug-a', expiresInDays: 7 }), res as any)
    for (const call of mocks.putCalls) {
      expect(call.opts.access).toBe('private')
    }
  })
})
