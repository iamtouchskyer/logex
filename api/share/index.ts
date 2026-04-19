import type { VercelRequest, VercelResponse } from '@vercel/node'
import { put, get } from '@vercel/blob'
import {
  generateId,
  hashPassword,
  computeExpiresAt,
  getAuthUser,
  getAuthUserFull,
  shareKey,
  indexKey,
  MAX_SHARES_PER_USER,
  type ShareRecord,
  type ShareIndex,
  type ShareMeta,
} from './_lib.js'
import { fetchFromUserRepo } from '../articles/_lib.js'

// ---------- blob helpers ----------

/**
 * Read blob by key. Uses get() for private store access (downloadUrl from list() requires auth on private blobs).
 * useCache:false avoids stale reads after recent writes.
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
  await put(key, JSON.stringify(data), { access: 'private', contentType: 'application/json', addRandomSuffix: false })
}

// ---------- handlers ----------

async function handleCreate(req: VercelRequest, res: VercelResponse): Promise<void> {
  const session = getAuthUserFull(req.headers.cookie)
  if (!session || !session.access_token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const login = session.login

  const body = req.body as { slug?: string; password?: string | null; expiresInDays?: number }
  const { slug, password, expiresInDays = 30 } = body

  if (!slug || typeof slug !== 'string' || slug.trim() === '') {
    res.status(400).json({ error: 'Missing slug' })
    return
  }
  // password is optional — null/undefined/'' means public link
  const hasPassword = typeof password === 'string' && password.length > 0
  if (hasPassword && password!.length < 4) {
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

  // Snapshot article from the user's logex-data repo using their OAuth token.
  // Shares become resilient to later article deletion / rename, and
  // handleGet never has to touch GitHub at read time.
  const indexResult = await fetchFromUserRepo(login, session.access_token, 'index.json')
  if (indexResult.status !== 200) {
    res.status(400).json({ error: 'Cannot load article index from your logex-data repo' })
    return
  }
  const indexBody = indexResult.body as {
    articles?: Array<{
      slug: string
      path?: string
      primaryLang?: string
      i18n?: Record<string, { path: string }>
    }>
  }
  const entry = indexBody.articles?.find((a) => a.slug === slug.trim())
  if (!entry) {
    res.status(404).json({ error: `Article not found: ${slug}` })
    return
  }
  const articlePath = entry.i18n?.[entry.primaryLang ?? '']?.path
    ?? (entry.i18n ? Object.values(entry.i18n)[0]?.path : undefined)
    ?? entry.path
  if (!articlePath) {
    res.status(400).json({ error: 'Article has no content path' })
    return
  }
  const articleResult = await fetchFromUserRepo(login, session.access_token, articlePath)
  if (articleResult.status !== 200) {
    res.status(400).json({ error: 'Cannot load article body' })
    return
  }

  const id = generateId()
  const passwordHash = hasPassword ? await hashPassword(password!) : null
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
    articleSnapshot: articleResult.body,
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

  try {
    if (req.method === 'POST') {
      return await handleCreate(req, res)
    }

    if (req.method === 'GET') {
      return await handleList(req, res)
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[share] unhandled error:', e)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Sharing service temporarily unavailable. Please try again.' })
    }
  }
}
