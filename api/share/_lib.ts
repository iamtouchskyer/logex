/**
 * Pure helper functions for share link API.
 * Kept dependency-free from HTTP layer so unit tests are clean.
 */
import crypto from 'crypto'
import bcrypt from 'bcryptjs'

export interface ShareRecord {
  id: string
  slug: string
  passwordHash: string
  createdBy: string
  createdAt: string
  expiresAt: string
  attempts: number
  locked: boolean
}

export interface ShareIndex {
  shares: string[]
}

export interface ShareMeta {
  id: string
  slug: string
  createdAt: string
  expiresAt: string
  locked: boolean
}

// ---------- token ----------

/**
 * Generate a 12-char alphanumeric ID using crypto with rejection sampling.
 * Rejection sampling eliminates modulo bias — uniform distribution across 62 chars.
 * Entropy: log2(62^12) ≈ 71.45 bits.
 */
export function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' // 62 chars
  const maxValid = 256 - (256 % chars.length) // 248 — reject bytes ≥ 248 to eliminate modulo bias
  let result = ''
  while (result.length < 12) {
    const bytes = crypto.randomBytes(18)
    for (let i = 0; i < bytes.length && result.length < 12; i++) {
      if (bytes[i] < maxValid) {
        result += chars[bytes[i] % chars.length]
      }
      // Reject bytes >= maxValid — no padding, no bias
    }
  }
  return result
}

// ---------- password ----------

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ---------- expiry ----------

export function computeExpiresAt(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now()
}

// ---------- rate limit ----------

export const MAX_ATTEMPTS = 10

export function isLocked(record: ShareRecord): boolean {
  return record.locked || record.attempts >= MAX_ATTEMPTS
}

export function incrementAttempts(record: ShareRecord): ShareRecord {
  const attempts = record.attempts + 1
  return { ...record, attempts, locked: attempts >= MAX_ATTEMPTS }
}

// ---------- blob key validation ----------

/** Validate share ID — only alphanumeric, exactly 12 chars. Prevents path traversal. */
export function isValidId(id: string): boolean {
  return /^[A-Za-z0-9]{12}$/.test(id)
}

// ---------- JWT verify (same as me.ts) ----------

export function verifySessionToken(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  if (signature !== expected) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

/** Extract authenticated user login from cookie header. Returns null if unauthenticated. */
export function getAuthUser(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(';').reduce((acc, c) => {
    const eq = c.indexOf('=')
    if (eq < 0) return acc
    const k = c.slice(0, eq).trim()
    const v = c.slice(eq + 1).trim()
    if (k) acc[k] = v
    return acc
  }, {} as Record<string, string>)

  const token = cookies.session
  if (!token) return null

  // In production SESSION_SECRET must be set — no fallback (prevents token forgery).
  // In local dev allow the hardcoded dev secret so `vercel dev` works without setup.
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: SESSION_SECRET env var not set in production — refusing auth')
      return null
    }
    const devSecret = 'logex-dev-secret'
    const payload = verifySessionToken(token, devSecret)
    if (!payload || typeof payload.login !== 'string') return null
    return payload.login
  }

  const payload = verifySessionToken(token, secret)
  if (!payload || typeof payload.login !== 'string') return null
  return payload.login
}

// ---------- blob key helpers ----------

export function shareKey(id: string): string {
  return `shares/${id}.json`
}

export function indexKey(userId: string): string {
  return `shares/index-${userId}.json`
}

export const MAX_SHARES_PER_USER = 50
