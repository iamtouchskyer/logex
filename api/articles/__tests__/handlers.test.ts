/**
 * Handler tests for api/articles/index.ts and api/articles/[...path].ts.
 * Mocks only the external GitHub fetch and the JWT helper via cookie.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import indexHandler from '../index'
import pathHandler from '../[...path]'

function signSession(payload: Record<string, unknown>): string {
  const secret = 'test-secret'
  process.env.SESSION_SECRET = secret
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

function mockRes() {
  const headers: Record<string, string> = {}
  return {
    statusCode: 0,
    body: null as unknown,
    headers,
    status(n: number) { this.statusCode = n; return this },
    json(b: unknown) { this.body = b; return this },
    setHeader(k: string, v: string) { headers[k] = v },
  }
}

function makeReq(method: string, cookie: string | undefined, query: Record<string, unknown> = {}) {
  return { method, headers: { cookie }, query } as any
}

describe('api/articles/index', () => {
  let origFetch: typeof fetch
  beforeEach(() => { origFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = origFetch; delete process.env.SESSION_SECRET })

  it('401 without session', async () => {
    const res = mockRes()
    await indexHandler(makeReq('GET', undefined), res as any)
    expect(res.statusCode).toBe(401)
  })

  it('405 for non-GET', async () => {
    const res = mockRes()
    await indexHandler(makeReq('POST', undefined), res as any)
    expect(res.statusCode).toBe(405)
  })

  it('401 when session has no access_token', async () => {
    const token = signSession({ login: 'alice', exp: Math.floor(Date.now() / 1000) + 60 })
    const res = mockRes()
    await indexHandler(makeReq('GET', `session=${token}`), res as any)
    expect(res.statusCode).toBe(401)
  })

  it('200 on success', async () => {
    const token = signSession({ login: 'alice', access_token: 'ghu_1', exp: Math.floor(Date.now() / 1000) + 60 })
    globalThis.fetch = vi.fn(async () => ({
      status: 200, ok: true, json: async () => ({ articles: [] }),
    })) as unknown as typeof fetch
    const res = mockRes()
    await indexHandler(makeReq('GET', `session=${token}`), res as any)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ articles: [] })
    expect(res.headers['Cache-Control']).toContain('private')
  })

  it('404 REPO_NOT_FOUND when repo missing', async () => {
    const token = signSession({ login: 'alice', access_token: 'ghu_1', exp: Math.floor(Date.now() / 1000) + 60 })
    globalThis.fetch = vi.fn(async () => ({
      status: 404, ok: false, json: async () => ({}),
    })) as unknown as typeof fetch
    const res = mockRes()
    await indexHandler(makeReq('GET', `session=${token}`), res as any)
    expect(res.statusCode).toBe(404)
    expect((res.body as { error: string }).error).toBe('REPO_NOT_FOUND')
  })

  it('403 on insufficient scope', async () => {
    const token = signSession({ login: 'alice', access_token: 'ghu_1', exp: Math.floor(Date.now() / 1000) + 60 })
    globalThis.fetch = vi.fn(async () => ({
      status: 403, ok: false, json: async () => ({}),
    })) as unknown as typeof fetch
    const res = mockRes()
    await indexHandler(makeReq('GET', `session=${token}`), res as any)
    expect(res.statusCode).toBe(403)
  })

  it('502 on upstream 500', async () => {
    const token = signSession({ login: 'alice', access_token: 'ghu_1', exp: Math.floor(Date.now() / 1000) + 60 })
    globalThis.fetch = vi.fn(async () => ({
      status: 500, ok: false, json: async () => ({}),
    })) as unknown as typeof fetch
    const res = mockRes()
    await indexHandler(makeReq('GET', `session=${token}`), res as any)
    expect(res.statusCode).toBe(502)
  })

  it('502 when fetch itself throws', async () => {
    const token = signSession({ login: 'alice', access_token: 'ghu_1', exp: Math.floor(Date.now() / 1000) + 60 })
    globalThis.fetch = vi.fn(async () => { throw new Error('network') }) as unknown as typeof fetch
    const res = mockRes()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await indexHandler(makeReq('GET', `session=${token}`), res as any)
    expect(res.statusCode).toBe(502)
    spy.mockRestore()
  })
})

describe('api/articles/[...path]', () => {
  let origFetch: typeof fetch
  beforeEach(() => { origFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = origFetch; delete process.env.SESSION_SECRET })

  it('405 on non-GET', async () => {
    const res = mockRes()
    await pathHandler(makeReq('POST', undefined, { path: ['x'] }), res as any)
    expect(res.statusCode).toBe(405)
  })

  it('401 without session', async () => {
    const res = mockRes()
    await pathHandler(makeReq('GET', undefined, { path: ['x.json'] }), res as any)
    expect(res.statusCode).toBe(401)
  })

  it('400 on traversal attempt', async () => {
    const token = signSession({ login: 'alice', access_token: 'ghu_1', exp: Math.floor(Date.now() / 1000) + 60 })
    const res = mockRes()
    await pathHandler(makeReq('GET', `session=${token}`, { path: ['..', 'secret'] }), res as any)
    expect(res.statusCode).toBe(400)
  })

  it('400 on absolute path', async () => {
    const token = signSession({ login: 'alice', access_token: 'ghu_1', exp: Math.floor(Date.now() / 1000) + 60 })
    const res = mockRes()
    await pathHandler(makeReq('GET', `session=${token}`, { path: '/etc/passwd' }), res as any)
    expect(res.statusCode).toBe(400)
  })

  it('400 on newline in path', async () => {
    const token = signSession({ login: 'alice', access_token: 'ghu_1', exp: Math.floor(Date.now() / 1000) + 60 })
    const res = mockRes()
    await pathHandler(makeReq('GET', `session=${token}`, { path: 'a\nb' }), res as any)
    expect(res.statusCode).toBe(400)
  })

  it('200 on success with array path', async () => {
    const token = signSession({ login: 'alice', access_token: 'ghu_1', exp: Math.floor(Date.now() / 1000) + 60 })
    globalThis.fetch = vi.fn(async () => ({
      status: 200, ok: true, json: async () => ({ slug: 'foo' }),
    })) as unknown as typeof fetch
    const res = mockRes()
    await pathHandler(makeReq('GET', `session=${token}`, { path: ['2026', '04', '19', 'foo.zh.json'] }), res as any)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ slug: 'foo' })
  })

  it('400 on empty path array', async () => {
    const token = signSession({ login: 'alice', access_token: 'ghu_1', exp: Math.floor(Date.now() / 1000) + 60 })
    const res = mockRes()
    await pathHandler(makeReq('GET', `session=${token}`, { path: [] }), res as any)
    expect(res.statusCode).toBe(400)
  })

  it('502 when fetch throws', async () => {
    const token = signSession({ login: 'alice', access_token: 'ghu_1', exp: Math.floor(Date.now() / 1000) + 60 })
    globalThis.fetch = vi.fn(async () => { throw new Error('oops') }) as unknown as typeof fetch
    const res = mockRes()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await pathHandler(makeReq('GET', `session=${token}`, { path: ['x.json'] }), res as any)
    expect(res.statusCode).toBe(502)
    spy.mockRestore()
  })
})
