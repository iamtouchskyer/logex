import type { VercelRequest, VercelResponse } from '@vercel/node'
import { put, del, get } from '@vercel/blob'
import {
  getAuthUser,
  shareKey,
  indexKey,
  isExpired,
  isLocked,
  incrementAttempts,
  verifyPassword,
  isValidId,
  type ShareRecord,
  type ShareIndex,
} from './_lib.js'

// ---------- blob helpers ----------

/**
 * Read blob by key. Uses get() for private store access (downloadUrl from list() requires auth on private blobs).
 * useCache:false avoids stale reads after recent writes/deletes.
 */
async function readBlob<T>(key: string): Promise<T | null> {
  try {
    const result = await get(key, { access: 'private', useCache: false })
    if (!result || result.statusCode !== 200) return null
    return await new Response(result.stream).json() as T
  } catch {
    return null
  }
}

async function writeBlob(key: string, data: unknown): Promise<void> {
  // access: 'private' — BLOB URLs never exposed to client; reads go through server proxy (handleGet)
  // index + record semantics are upsert (create OR update an existing share).
  // Default non-overwrite would 500 on re-creates.
  await put(key, JSON.stringify(data), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true })
}

// ---------- handlers ----------

/**
 * GET = public no-password shares only. If the share is password-protected,
 * return 401 PASSWORD_REQUIRED so the client issues a POST with the password
 * in the JSON body (never the URL).
 */
async function handleGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string

  if (!id || !isValidId(id)) {
    res.status(400).json({ error: 'Invalid share id' })
    return
  }

  const record = await readBlob<ShareRecord>(shareKey(id))
  if (!record) {
    res.status(404).json({ error: 'Share not found' })
    return
  }

  if (isExpired(record.expiresAt)) {
    res.status(410).json({ error: 'Share expired' })
    return
  }

  if (isLocked(record)) {
    res.status(403).json({ error: 'Share locked due to too many failed attempts' })
    return
  }

  // No-password share — skip verification, return article directly
  if (record.passwordHash === null) {
    res.status(200).json({ article: record.articleSnapshot ?? null, slug: record.slug })
    return
  }

  // Password-protected — refuse to read password from URL (leaks to logs/Referer).
  // Client must POST password in body.
  res.status(401).json({ error: 'PASSWORD_REQUIRED' })
}

/**
 * POST = password submission for password-protected shares.
 * Body: `{ "password": string }`. Returns article JSON on success.
 * Same-origin only (CORS above restricts). Never accepts password via query.
 */
async function handlePost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string
  if (!id || !isValidId(id)) {
    res.status(400).json({ error: 'Invalid share id' })
    return
  }

  // Parse body — Vercel auto-parses application/json but guard for raw strings too.
  let password: string | undefined
  const body = req.body as unknown
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as { password?: unknown }
      if (typeof parsed.password === 'string') password = parsed.password
    } catch { /* ignore */ }
  } else if (body && typeof body === 'object' && 'password' in body) {
    const p = (body as { password?: unknown }).password
    if (typeof p === 'string') password = p
  }

  if (!password) {
    res.status(400).json({ error: 'Missing password in body' })
    return
  }

  const record = await readBlob<ShareRecord>(shareKey(id))
  if (!record) {
    res.status(404).json({ error: 'Share not found' })
    return
  }

  if (isExpired(record.expiresAt)) {
    res.status(410).json({ error: 'Share expired' })
    return
  }

  if (isLocked(record)) {
    res.status(403).json({ error: 'Share locked due to too many failed attempts' })
    return
  }

  // Public share — POST isn't required; just return it.
  if (record.passwordHash === null) {
    res.status(200).json({ article: record.articleSnapshot ?? null, slug: record.slug })
    return
  }

  const valid = await verifyPassword(password, record.passwordHash)
  if (!valid) {
    const updated = incrementAttempts(record)
    await writeBlob(shareKey(id), updated)
    res.status(403).json({ error: 'Wrong password' })
    return
  }

  res.status(200).json({ article: record.articleSnapshot ?? null, slug: record.slug })
}

async function handleDelete(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CSRF protection: require request to originate from same host.
  // Tightened: mutating methods REQUIRE Origin header — requests without one
  // (some fetch clients) are rejected too.
  const origin = req.headers.origin as string | undefined
  const host = req.headers.host as string | undefined
  if (!origin || !host) {
    res.status(403).json({ error: 'CSRF check failed' })
    return
  }
  try {
    const originHost = new URL(origin).host
    if (originHost !== host) {
      res.status(403).json({ error: 'CSRF check failed' })
      return
    }
  } catch {
    res.status(403).json({ error: 'CSRF check failed' })
    return
  }

  const login = getAuthUser(req.headers.cookie)
  if (!login) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const id = req.query.id as string
  if (!id || !isValidId(id)) {
    res.status(400).json({ error: 'Invalid share id' })
    return
  }

  const record = await readBlob<ShareRecord>(shareKey(id))
  if (!record) {
    res.status(404).json({ error: 'Share not found' })
    return
  }

  if (record.createdBy !== login) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  try {
    await del(shareKey(id))
  } catch (e) {
    console.error('Failed to delete share blob:', id, e)
    res.status(500).json({ error: 'Failed to delete share' })
    return
  }

  try {
    const idxKey = indexKey(login)
    const idx = await readBlob<ShareIndex>(idxKey)
    if (idx) {
      const updated: ShareIndex = { shares: idx.shares.filter((s) => s !== id) }
      await writeBlob(idxKey, updated)
    }
  } catch (e) {
    console.error('Failed to update share index after delete:', id, e)
  }

  res.status(204).end()
}

// ---------- main ----------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string

  // CORS policy:
  //   - GET (no-password read) is safe to expose cross-origin: no secrets, no state change.
  //   - POST (password submission) and DELETE are same-origin only — no
  //     Access-Control-Allow-Origin header. Browsers will block cross-origin
  //     attempts; server-to-server callers must set Origin matching host.
  if (req.method === 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (!id) {
    res.status(400).json({ error: 'Missing id' })
    return
  }

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res)
    }

    if (req.method === 'POST') {
      return await handlePost(req, res)
    }

    if (req.method === 'DELETE') {
      return await handleDelete(req, res)
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[share/:id] unhandled error:', e)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Sharing service temporarily unavailable. Please try again.' })
    }
  }
}
