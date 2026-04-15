import type { VercelRequest, VercelResponse } from '@vercel/node'
import { put, head, get } from '@vercel/blob'
import {
  generateId,
  hashPassword,
  computeExpiresAt,
  getAuthUser,
  shareKey,
  indexKey,
  MAX_SHARES_PER_USER,
  isExpired,
  isLocked,
  incrementAttempts,
  verifyPassword,
  type ShareRecord,
  type ShareIndex,
  type ShareMeta,
} from './_lib'

// ---------- blob helpers ----------

async function readBlob<T>(key: string): Promise<T | null> {
  try {
    const info = await head(key)
    if (!info) return null
    const res = await fetch(info.url)
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
  if (!password || typeof password !== 'string' || password.length < 1) {
    res.status(400).json({ error: 'Missing password' })
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

  // Write share record and update index in parallel
  const newIndex: ShareIndex = { shares: [...currentShares, id] }
  await Promise.all([
    writeBlob(shareKey(id), record),
    writeBlob(idxKey, newIndex),
  ])

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
