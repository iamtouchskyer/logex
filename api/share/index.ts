import type { VercelRequest, VercelResponse } from '@vercel/node'
import { put, list } from '@vercel/blob'
import {
  generateId,
  hashPassword,
  computeExpiresAt,
  getAuthUser,
  shareKey,
  indexKey,
  isValidId,
  MAX_SHARES_PER_USER,
  isExpired,
  isLocked,
  incrementAttempts,
  verifyPassword,
  type ShareRecord,
  type ShareIndex,
  type ShareMeta,
} from './_lib.js'

// ---------- blob helpers ----------

/**
 * Read blob by key. Uses list() to find the blob, then fetches via downloadUrl.
 * Avoids head() + CDN fetch which can return stale data after recent writes.
 */
async function readBlob<T>(key: string): Promise<T | null> {
  try {
    const { blobs } = await list({ prefix: key, limit: 1 })
    const blob = blobs.find((b) => b.pathname === key)
    if (!blob) return null
    const res = await fetch(blob.downloadUrl)
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

async function writeBlob(key: string, data: unknown): Promise<void> {
  await put(key, JSON.stringify(data), { access: 'public', contentType: 'application/json', addRandomSuffix: false })
}

// ---------- handlers ----------

async function handleCreate(req: VercelRequest, res: VercelResponse): Promise<void> {
  const login = getAuthUser(req.headers.cookie)
  if (!login) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const body = req.body as { slug?: string; password?: string; expiresInDays?: number }
  const { slug, password, expiresInDays = 30 } = body

  if (!slug || typeof slug !== 'string' || slug.trim() === '') {
    res.status(400).json({ error: 'Missing slug' })
    return
  }
  if (!password || typeof password !== 'string' || password.length < 4) {
    res.status(400).json({ error: 'Password must be at least 4 characters' })
    return
  }
  if (typeof expiresInDays !== 'number' || expiresInDays < 1 || expiresInDays > 365) {
    res.status(400).json({ error: 'expiresInDays must be 1–365' })
    return
  }

  // Cap check
  const idxKey = indexKey(login)
  const idx = await readBlob<ShareIndex>(idxKey)
  const currentShares = idx?.shares ?? []
  if (currentShares.length >= MAX_SHARES_PER_USER) {
    res.status(429).json({ error: `Max ${MAX_SHARES_PER_USER} shares per user` })
    return
  }

  const id = generateId()
  const passwordHash = await hashPassword(password)
  const now = new Date().toISOString()
  const expiresAt = computeExpiresAt(expiresInDays)

  const record: ShareRecord = {
    id,
    slug: slug.trim(),
    passwordHash,
    createdBy: login,
    createdAt: now,
    expiresAt,
    attempts: 0,
    locked: false,
  }

  // Write share record first (source of truth)
  await writeBlob(shareKey(id), record)

  // Update index second — if this fails, share exists but won't appear in list.
  // Acceptable eventual consistency: user can still access share via direct URL.
  try {
    const newIndex: ShareIndex = { shares: [...currentShares, id] }
    await writeBlob(idxKey, newIndex)
  } catch (e) {
    console.error('Failed to update share index after create:', id, e)
    // Don't fail the whole request — share was created successfully
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.APP_URL ?? 'http://localhost:5173'

  res.status(201).json({
    id,
    url: `${baseUrl}/share/${id}`,
    expiresAt,
  })
}

async function handleList(req: VercelRequest, res: VercelResponse): Promise<void> {
  const login = getAuthUser(req.headers.cookie)
  if (!login) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const idxKey = indexKey(login)
  const idx = await readBlob<ShareIndex>(idxKey)
  if (!idx || idx.shares.length === 0) {
    res.status(200).json({ shares: [] })
    return
  }

  const records = await Promise.all(
    idx.shares.map((id) => readBlob<ShareRecord>(shareKey(id)))
  )

  const metas: ShareMeta[] = records
    .filter((r): r is ShareRecord => r !== null)
    .map(({ id, slug, createdAt, expiresAt, locked }) => ({ id, slug, createdAt, expiresAt, locked }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  res.status(200).json({ shares: metas })
}

// ---------- main ----------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS — authenticated endpoints: same-origin only
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method === 'POST') {
    return handleCreate(req, res)
  }

  if (req.method === 'GET') {
    return handleList(req, res)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
