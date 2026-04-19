/**
 * Centralized session HS256 sign/verify + SESSION_SECRET resolution.
 *
 * Contract:
 *   - In production (NODE_ENV==='production' OR VERCEL_ENV==='production'):
 *     SESSION_SECRET MUST be set. If missing, `resolveSessionSecret()` throws.
 *   - In non-prod: falls back to the hardcoded dev secret so `vercel dev` works
 *     without extra env setup.
 *
 * One place for sign + verify means the issuer and the verifiers can never
 * drift out of sync — which is what let run_1 sign with `'logex-dev-secret'`
 * while `share/_lib.ts` refused to verify it.
 */
import crypto from 'crypto'

export const DEV_FALLBACK_SECRET = 'logex-dev-secret'

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
}

/**
 * Returns the session HMAC secret.
 * Throws in production if SESSION_SECRET is missing (refuses to sign/verify
 * with a publicly-known dev secret).
 */
export function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret && secret.length > 0) return secret
  if (isProduction()) {
    throw new Error('SESSION_SECRET env var is required in production')
  }
  return DEV_FALLBACK_SECRET
}

export interface SessionPayload {
  login: string
  name?: string | null
  avatar?: string | null
  access_token?: string
  exp?: number
  [key: string]: unknown
}

export function signSession(payload: SessionPayload): string {
  const secret = resolveSessionSecret()
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

export function verifySession(token: string): SessionPayload | null {
  let secret: string
  try {
    secret = resolveSessionSecret()
  } catch {
    // In prod with missing SESSION_SECRET we refuse to verify — fail closed.
    return null
  }
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  // Constant-time compare
  const sigBuf = Buffer.from(signature, 'base64url')
  const expBuf = Buffer.from(expected, 'base64url')
  if (sigBuf.length !== expBuf.length) return null
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}
