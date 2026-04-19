/**
 * Unit tests for api/_session.ts — centralized signSession/verifySession +
 * resolveSessionSecret. Guards the run_1 bug: asymmetric SESSION_SECRET
 * fallback between issuer (callback.ts) and verifier (share/_lib.ts).
 */
import { describe, it, expect, afterEach } from 'vitest'
import crypto from 'crypto'
import {
  signSession,
  verifySession,
  resolveSessionSecret,
  isProduction,
  DEV_FALLBACK_SECRET,
} from '../_session'

describe('resolveSessionSecret', () => {
  afterEach(() => {
    delete process.env.SESSION_SECRET
    delete process.env.NODE_ENV
    delete process.env.VERCEL_ENV
  })

  it('returns SESSION_SECRET when set (any env)', () => {
    process.env.SESSION_SECRET = 'real-secret'
    process.env.NODE_ENV = 'production'
    expect(resolveSessionSecret()).toBe('real-secret')
  })

  it('returns dev fallback in non-prod when SESSION_SECRET missing', () => {
    process.env.NODE_ENV = 'development'
    expect(resolveSessionSecret()).toBe(DEV_FALLBACK_SECRET)
  })

  it('throws in production when SESSION_SECRET missing (NODE_ENV)', () => {
    process.env.NODE_ENV = 'production'
    expect(() => resolveSessionSecret()).toThrow(/SESSION_SECRET/)
  })

  it('throws in production when SESSION_SECRET missing (VERCEL_ENV)', () => {
    process.env.VERCEL_ENV = 'production'
    expect(() => resolveSessionSecret()).toThrow(/SESSION_SECRET/)
  })

  it('rejects empty string SESSION_SECRET in prod', () => {
    process.env.NODE_ENV = 'production'
    process.env.SESSION_SECRET = ''
    expect(() => resolveSessionSecret()).toThrow(/SESSION_SECRET/)
  })
})

describe('isProduction', () => {
  afterEach(() => {
    delete process.env.NODE_ENV
    delete process.env.VERCEL_ENV
  })

  it('true for NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production'
    expect(isProduction()).toBe(true)
  })

  it('true for VERCEL_ENV=production', () => {
    process.env.VERCEL_ENV = 'production'
    expect(isProduction()).toBe(true)
  })

  it('false otherwise', () => {
    process.env.NODE_ENV = 'development'
    expect(isProduction()).toBe(false)
  })
})

describe('signSession / verifySession round-trip', () => {
  afterEach(() => { delete process.env.SESSION_SECRET })

  it('signs and verifies back the same payload', () => {
    process.env.SESSION_SECRET = 'round-trip-secret'
    const payload = {
      login: 'alice',
      access_token: 'ghu_xxx',
      exp: Math.floor(Date.now() / 1000) + 60,
    }
    const token = signSession(payload)
    const verified = verifySession(token)
    expect(verified?.login).toBe('alice')
    expect(verified?.access_token).toBe('ghu_xxx')
  })

  it('works with dev fallback in non-prod (signer & verifier agree)', () => {
    // No SESSION_SECRET, NODE_ENV=test (not prod) → both sign and verify
    // fall back to DEV_FALLBACK_SECRET. This is exactly the behaviour that
    // run_1 broke asymmetrically.
    const token = signSession({ login: 'bob', exp: Math.floor(Date.now() / 1000) + 60 })
    const verified = verifySession(token)
    expect(verified?.login).toBe('bob')
  })

  it('rejects a forged signature', () => {
    process.env.SESSION_SECRET = 'real-secret'
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify({ login: 'attacker' })).toString('base64url')
    const sig = crypto.createHmac('sha256', 'wrong-secret').update(`${header}.${body}`).digest('base64url')
    const forged = `${header}.${body}.${sig}`
    expect(verifySession(forged)).toBeNull()
  })

  it('rejects malformed token', () => {
    process.env.SESSION_SECRET = 'x'
    expect(verifySession('not-a-jwt')).toBeNull()
    expect(verifySession('a.b')).toBeNull()
  })

  it('rejects expired token', () => {
    process.env.SESSION_SECRET = 'x'
    const token = signSession({ login: 'bob', exp: Math.floor(Date.now() / 1000) - 1 })
    expect(verifySession(token)).toBeNull()
  })

  it('signing throws in prod without SESSION_SECRET (no forgeable-by-default)', () => {
    process.env.NODE_ENV = 'production'
    // SESSION_SECRET intentionally missing
    expect(() => signSession({ login: 'carol' })).toThrow(/SESSION_SECRET/)
    delete process.env.NODE_ENV
  })

  it('verifying returns null in prod without SESSION_SECRET (fail closed)', () => {
    process.env.NODE_ENV = 'production'
    // Even if a forged-with-dev-secret token shows up, verify refuses.
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify({ login: 'attacker' })).toString('base64url')
    const sig = crypto.createHmac('sha256', DEV_FALLBACK_SECRET).update(`${header}.${body}`).digest('base64url')
    const token = `${header}.${body}.${sig}`
    expect(verifySession(token)).toBeNull()
    delete process.env.NODE_ENV
  })
})
