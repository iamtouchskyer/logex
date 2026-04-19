/**
 * Pure helper functions for share link API.
 * Kept dependency-free from HTTP layer so unit tests are clean.
 */
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { verifySession } from '../_session.js'

export interface ShareRecord {
  id: string
  slug: string
  /** Bcrypt hash; `null` means no password (public link). */
  passwordHash: string | null
  createdBy: string
  createdAt: string
  expiresAt: string
  attempts: number
  locked: boolean
  /**
   * Frozen copy of the article JSON at share creation time. Makes share links
   * resilient to later article deletion / rename, and means `handleGet` never
   * needs to touch GitHub at runtime.
   *
   * Optional for backwards-compat with records created before this field
   * existed; those records will simply 404 on GET.
   */
  articleSnapshot?: unknown
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
  const full = getAuthUserFull(cookieHeader)
  return full?.login ?? null
}

export interface AuthPayload {
  login: string
  name?: string | null
  avatar?: string | null
  access_token?: string
  exp?: number
}

/**
 * Extract full session payload including `access_token` for server-side use
 * (e.g. proxying to the user's GitHub data repo). Never return this shape to
 * the client — `access_token` must never cross the wire to browser JS.
 */
export function getAuthUserFull(cookieHeader: string | undefined): AuthPayload | null {
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

  // Single source of truth for secret resolution — throws in prod if missing,
  // falls back to dev secret only in non-prod.
  const payload = verifySession(token) as Record<string, unknown> | null
  if (!payload || typeof payload.login !== 'string') return null
  return {
    login: payload.login,
    name: typeof payload.name === 'string' ? payload.name : null,
    avatar: typeof payload.avatar === 'string' ? payload.avatar : null,
    access_token: typeof payload.access_token === 'string' ? payload.access_token : undefined,
    exp: typeof payload.exp === 'number' ? payload.exp : undefined,
  }
}

// ---------- blob key helpers ----------

export function shareKey(id: string): string {
  return `shares/${id}.json`
}

export function indexKey(userId: string): string {
  return `shares/index-${userId}.json`
}

export const MAX_SHARES_PER_USER = 50
