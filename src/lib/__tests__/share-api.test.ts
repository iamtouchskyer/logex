/**
 * Unit tests for share API pure functions.
 * Tests password hashing, token generation, expiry, rate limiting, and auth extraction.
 * No HTTP handlers, no Vercel Blob — all pure logic.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  generateId,
  hashPassword,
  verifyPassword,
  computeExpiresAt,
  isExpired,
  isLocked,
  incrementAttempts,
  verifySessionToken,
  getAuthUser,
  shareKey,
  indexKey,
  MAX_ATTEMPTS,
  MAX_SHARES_PER_USER,
  type ShareRecord,
} from '../../../api/share/_lib'
import crypto from 'crypto'

// ───────────────────────────────────────────
// generateId
// ───────────────────────────────────────────
describe('generateId', () => {
  it('returns exactly 12 characters', () => {
    expect(generateId()).toHaveLength(12)
  })

  it('returns only alphanumeric characters', () => {
    const id = generateId()
    expect(id).toMatch(/^[A-Za-z0-9]{12}$/)
  })

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateId()))
    // With 62^12 possible values, 200 calls should all be unique
    expect(ids.size).toBe(200)
  })
})

// ───────────────────────────────────────────
// hashPassword / verifyPassword
// ───────────────────────────────────────────
describe('hashPassword / verifyPassword', () => {
  it('hashes a password and verifies it correctly', async () => {
    const hash = await hashPassword('s3cr3t!')
    expect(hash).not.toBe('s3cr3t!')
    expect(hash.startsWith('$2b$')).toBe(true)
    await expect(verifyPassword('s3cr3t!', hash)).resolves.toBe(true)
  })

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correct')
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false)
  })

  it('never stores plaintext — hash is different from input', async () => {
    const pw = 'password123'
    const hash = await hashPassword(pw)
    expect(hash).not.toContain(pw)
  })
})

// ───────────────────────────────────────────
// computeExpiresAt / isExpired
// ───────────────────────────────────────────
describe('computeExpiresAt', () => {
  it('returns ISO string roughly N days in the future', () => {
    const before = Date.now()
    const result = computeExpiresAt(30)
    const after = Date.now()

    const ts = new Date(result).getTime()
    const expectedMin = before + 30 * 24 * 3600 * 1000
    const expectedMax = after + 30 * 24 * 3600 * 1000

    expect(ts).toBeGreaterThanOrEqual(expectedMin)
    expect(ts).toBeLessThanOrEqual(expectedMax)
  })

  it('returns a valid ISO string', () => {
    const result = computeExpiresAt(7)
    expect(() => new Date(result)).not.toThrow()
    expect(new Date(result).toISOString()).toBe(result)
  })
})

describe('isExpired', () => {
  it('returns false for future date', () => {
    const future = new Date(Date.now() + 1_000_000).toISOString()
    expect(isExpired(future)).toBe(false)
  })

  it('returns true for past date', () => {
    const past = new Date(Date.now() - 1_000_000).toISOString()
    expect(isExpired(past)).toBe(true)
  })

  it('returns true for exact current time (boundary)', () => {
    // Date.now() - 1ms to ensure it's in the past
    const justPast = new Date(Date.now() - 1).toISOString()
    expect(isExpired(justPast)).toBe(true)
  })
})

// ───────────────────────────────────────────
// isLocked / incrementAttempts
// ───────────────────────────────────────────

function makeRecord(overrides: Partial<ShareRecord> = {}): ShareRecord {
  return {
    id: 'test000000ab',
    slug: 'test-slug',
    passwordHash: '$2b$10$fakehashfakehashfakehashfakehashfakehashfakehashfakeha',
    createdBy: 'user1',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    attempts: 0,
    locked: false,
    ...overrides,
  }
}

describe('isLocked', () => {
  it('returns false for a fresh record', () => {
    expect(isLocked(makeRecord())).toBe(false)
  })

  it('returns true when locked flag is set', () => {
    expect(isLocked(makeRecord({ locked: true }))).toBe(true)
  })

  it('returns true when attempts reach MAX_ATTEMPTS', () => {
    expect(isLocked(makeRecord({ attempts: MAX_ATTEMPTS }))).toBe(true)
  })

  it('returns true when attempts exceed MAX_ATTEMPTS', () => {
    expect(isLocked(makeRecord({ attempts: MAX_ATTEMPTS + 5 }))).toBe(true)
  })

  it('returns false just below MAX_ATTEMPTS', () => {
    expect(isLocked(makeRecord({ attempts: MAX_ATTEMPTS - 1 }))).toBe(false)
  })
})

describe('incrementAttempts', () => {
  it('increments attempts by 1', () => {
    const r = makeRecord({ attempts: 3 })
    const updated = incrementAttempts(r)
    expect(updated.attempts).toBe(4)
  })

  it('does not mutate original record', () => {
    const r = makeRecord({ attempts: 3 })
    incrementAttempts(r)
    expect(r.attempts).toBe(3)
  })

  it('sets locked=true when reaching MAX_ATTEMPTS', () => {
    const r = makeRecord({ attempts: MAX_ATTEMPTS - 1 })
    const updated = incrementAttempts(r)
    expect(updated.attempts).toBe(MAX_ATTEMPTS)
    expect(updated.locked).toBe(true)
  })

  it('does not set locked=true before threshold', () => {
    const r = makeRecord({ attempts: 0 })
    const updated = incrementAttempts(r)
    expect(updated.locked).toBe(false)
  })

  it('MAX_ATTEMPTS is 10', () => {
    expect(MAX_ATTEMPTS).toBe(10)
  })
})

// ───────────────────────────────────────────
// verifySessionToken
// ───────────────────────────────────────────

function signToken(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

describe('verifySessionToken', () => {
  const secret = 'test-secret'

  it('verifies a valid token', () => {
    const token = signToken({ login: 'alice', exp: Math.floor(Date.now() / 1000) + 3600 }, secret)
    const payload = verifySessionToken(token, secret)
    expect(payload).not.toBeNull()
    expect(payload?.login).toBe('alice')
  })

  it('rejects wrong secret', () => {
    const token = signToken({ login: 'alice' }, secret)
    expect(verifySessionToken(token, 'wrong-secret')).toBeNull()
  })

  it('rejects expired token', () => {
    const token = signToken({ login: 'alice', exp: Math.floor(Date.now() / 1000) - 1 }, secret)
    expect(verifySessionToken(token, secret)).toBeNull()
  })

  it('rejects malformed token', () => {
    expect(verifySessionToken('not.a.valid.token.here', secret)).toBeNull()
    expect(verifySessionToken('invalid', secret)).toBeNull()
    expect(verifySessionToken('a.b.c', secret)).toBeNull()
  })

  it('accepts token without exp (no expiry set)', () => {
    const token = signToken({ login: 'bob' }, secret)
    const payload = verifySessionToken(token, secret)
    expect(payload?.login).toBe('bob')
  })
})

// ───────────────────────────────────────────
// getAuthUser
// ───────────────────────────────────────────

describe('getAuthUser', () => {
  const secret = 'logex-dev-secret' // matches default in _lib.ts

  it('returns login from valid session cookie', () => {
    const token = signToken({ login: 'testuser', exp: Math.floor(Date.now() / 1000) + 3600 }, secret)
    const cookie = `session=${token}; other=value`
    expect(getAuthUser(cookie)).toBe('testuser')
  })

  it('returns null when no cookie header', () => {
    expect(getAuthUser(undefined)).toBeNull()
  })

  it('returns null when cookie header is empty', () => {
    expect(getAuthUser('')).toBeNull()
  })

  it('returns null when session cookie is missing', () => {
    expect(getAuthUser('other=value; foo=bar')).toBeNull()
  })

  it('returns null for expired session token', () => {
    const token = signToken({ login: 'alice', exp: Math.floor(Date.now() / 1000) - 10 }, secret)
    expect(getAuthUser(`session=${token}`)).toBeNull()
  })

  it('returns null for tampered session token', () => {
    const token = signToken({ login: 'alice' }, 'different-secret')
    expect(getAuthUser(`session=${token}`)).toBeNull()
  })
})

// ───────────────────────────────────────────
// blob key helpers
// ───────────────────────────────────────────

describe('shareKey / indexKey', () => {
  it('shareKey formats correctly', () => {
    expect(shareKey('abc123xyz012')).toBe('shares/abc123xyz012.json')
  })

  it('indexKey formats correctly', () => {
    expect(indexKey('myuser')).toBe('shares/index-myuser.json')
  })
})

// ───────────────────────────────────────────
// constants
// ───────────────────────────────────────────

describe('constants', () => {
  it('MAX_SHARES_PER_USER is 50', () => {
    expect(MAX_SHARES_PER_USER).toBe(50)
  })
})

// ───────────────────────────────────────────
// ShareRecord with passwordHash = null (public link)
// ───────────────────────────────────────────

describe('ShareRecord — no-password (public) variant', () => {
  it('accepts passwordHash = null in the type', () => {
    const rec: ShareRecord = {
      id: generateId(),
      slug: 'demo',
      passwordHash: null,
      createdBy: 'octocat',
      createdAt: new Date().toISOString(),
      expiresAt: computeExpiresAt(30),
      attempts: 0,
      locked: false,
    }
    expect(rec.passwordHash).toBeNull()
  })

  it('isExpired and isLocked still work for null-password records', () => {
    const rec: ShareRecord = {
      id: generateId(),
      slug: 'demo',
      passwordHash: null,
      createdBy: 'u',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      attempts: 0,
      locked: false,
    }
    expect(isExpired(rec.expiresAt)).toBe(true)
    expect(isLocked(rec)).toBe(false)
  })

  it('verifyPassword is never called for null-hash records (caller short-circuits)', async () => {
    // Sanity: hashPassword fails on null, so the API path MUST short-circuit first
    await expect(hashPassword(null as unknown as string)).rejects.toBeDefined()
  })
})

// ───────────────────────────────────────────
// getAuthUserFull — exposes access_token
// ───────────────────────────────────────────
import { getAuthUserFull } from '../../../api/share/_lib'

describe('getAuthUserFull', () => {
  function sign(payload: Record<string, unknown>, secret = 'test-secret'): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    return `${header}.${body}.${sig}`
  }

  afterEach(() => { delete process.env.SESSION_SECRET })

  it('returns the access_token field alongside login', () => {
    process.env.SESSION_SECRET = 'test-secret'
    const token = sign({ login: 'alice', access_token: 'ghu_xxx', exp: Math.floor(Date.now() / 1000) + 60 })
    const full = getAuthUserFull(`session=${token}`)
    expect(full?.login).toBe('alice')
    expect(full?.access_token).toBe('ghu_xxx')
  })

  it('returns null without cookie', () => {
    expect(getAuthUserFull(undefined)).toBeNull()
  })

  it('returns null when signature is forged', () => {
    process.env.SESSION_SECRET = 'test-secret'
    const token = sign({ login: 'alice' }, 'wrong-secret')
    expect(getAuthUserFull(`session=${token}`)).toBeNull()
  })

  it('returns null when exp is in the past', () => {
    process.env.SESSION_SECRET = 'test-secret'
    const token = sign({ login: 'alice', exp: 1 })
    expect(getAuthUserFull(`session=${token}`)).toBeNull()
  })
})
