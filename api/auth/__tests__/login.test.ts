/**
 * Tests for api/auth/login.ts — the OAuth initiator.
 * Guards:
 *   - state is CSPRNG hex (not Math.random)
 *   - scope is read:user (not repo)
 *   - state cookie carries Lax + HttpOnly
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import loginHandler from '../login'

function mockRes() {
  const headers: Record<string, string> = {}
  let redirected: string | null = null
  return {
    redirect(url: string) { redirected = url },
    setHeader(k: string, v: string) { headers[k] = v },
    get headers() { return headers },
    get redirected() { return redirected },
  } as any
}

describe('api/auth/login', () => {
  beforeEach(() => { process.env.GITHUB_CLIENT_ID = 'test-client' })
  afterEach(() => {
    delete process.env.GITHUB_CLIENT_ID
    delete process.env.PUBLIC_HOST
    delete process.env.VERCEL_URL
    vi.restoreAllMocks()
  })

  it('redirects to GitHub OAuth with scope=read:user only', () => {
    const res = mockRes()
    loginHandler({ headers: {} } as any, res)
    const url = res.redirected as string
    expect(url).toContain('github.com/login/oauth/authorize')
    expect(url).toContain('scope=read%3Auser')
    // Must NOT include write-grant scopes
    expect(url).not.toMatch(/scope=[^&]*\brepo\b/)
    expect(url).not.toMatch(/public_repo/)
  })

  it('state is 32-char hex (CSPRNG), never Math.random output', () => {
    // Spy on Math.random to assert NOT called
    const spy = vi.spyOn(Math, 'random')
    const res = mockRes()
    loginHandler({ headers: {} } as any, res)
    const url = new URL(res.redirected as string)
    const state = url.searchParams.get('state') ?? ''
    expect(state).toMatch(/^[0-9a-f]{32}$/)
    expect(spy).not.toHaveBeenCalled()
  })

  it('two consecutive calls produce different states (randomness)', () => {
    const states = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const res = mockRes()
      loginHandler({ headers: {} } as any, res)
      const url = new URL(res.redirected as string)
      states.add(url.searchParams.get('state') ?? '')
    }
    expect(states.size).toBe(20)
  })

  it('sets oauth_state cookie with HttpOnly + SameSite=Lax', () => {
    const res = mockRes()
    loginHandler({ headers: {} } as any, res)
    const cookie = res.headers['Set-Cookie'] as string
    expect(cookie).toContain('oauth_state=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
  })

  it('redirects to /api/auth/setup when GITHUB_CLIENT_ID is missing', () => {
    delete process.env.GITHUB_CLIENT_ID
    const res = mockRes()
    loginHandler({ headers: {} } as any, res)
    expect(res.redirected).toBe('/api/auth/setup')
  })
})
