/**
 * Tests for api/auth/logout.ts — cookie clear attributes must match login.
 * Guards S4: previously Max-Age=0 clear dropped Secure + SameSite=Lax,
 * which per RFC6265 §5.3 some browsers treat as a distinct cookie.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, afterEach } from 'vitest'
import logoutHandler from '../logout'

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

describe('api/auth/logout', () => {
  afterEach(() => { delete process.env.VERCEL_URL })

  it('clears session cookie with HttpOnly + SameSite=Lax', () => {
    const res = mockRes()
    logoutHandler({} as any, res)
    const cookie = res.headers['Set-Cookie'] as string
    expect(cookie).toContain('session=')
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
  })

  it('includes Secure in production (VERCEL_URL set)', () => {
    process.env.VERCEL_URL = 'logex-io.vercel.app'
    const res = mockRes()
    logoutHandler({} as any, res)
    const cookie = res.headers['Set-Cookie'] as string
    expect(cookie).toContain('Secure')
  })

  it('redirects to /#/logged-out landing (not / — avoids auto re-login loop)', () => {
    const res = mockRes()
    logoutHandler({} as any, res)
    expect(res.redirected).toBe('/#/logged-out')
  })
})
