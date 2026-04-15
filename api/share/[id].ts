import type { VercelRequest, VercelResponse } from '@vercel/node'
import { put, del, head } from '@vercel/blob'
import {
  getAuthUser,
  shareKey,
  indexKey,
  isExpired,
  isLocked,
  incrementAttempts,
  verifyPassword,
  type ShareRecord,
  type ShareIndex,
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

// ---------- fetch article from GitHub data repo ----------

async function fetchArticle(slug: string): Promise<unknown | null> {
  const owner = process.env.GITHUB_DATA_OWNER
  const repo = process.env.GITHUB_DATA_REPO
  const token = process.env.GITHUB_TOKEN

  if (!owner || !repo) return null

  // Search by slug — try common year paths then fallback to search API
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  // Attempt direct path via index
  const indexUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/index.json`
  const idxRes = await fetch(indexUrl, { headers })
  if (!idxRes.ok) return null
  const idx = await idxRes.json() as { articles?: Array<{ slug: string; path: string }> }

  const entry = idx.articles?.find((a) => a.slug === slug)
  if (!entry) return null

  const articleUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${entry.path}`
  const artRes = await fetch(articleUrl, { headers })
  if (!artRes.ok) return null
  return artRes.json()
}

// ---------- handlers ----------

async function handleGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string
  const password = req.query.password as string | undefined

  if (!id) {
    res.status(400).json({ error: 'Missing id' })
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

  if (!password) {
    res.status(400).json({ error: 'Missing password query param' })
    return
  }

  const valid = await verifyPassword(password, record.passwordHash)
  if (!valid) {
    // Increment attempts and persist
    const updated = incrementAttempts(record)
    await writeBlob(shareKey(id), updated)
    res.status(403).json({ error: 'Wrong password' })
    return
  }

  // Fetch the article
  const article = await fetchArticle(record.slug)

  res.status(200).json({ article, slug: record.slug })
}

async function handleDelete(req: VercelRequest, res: VercelResponse): Promise<void> {
  const login = getAuthUser(req.headers.cookie)
  if (!login) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const id = req.query.id as string
  if (!id) {
    res.status(400).json({ error: 'Missing id' })
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

  // Delete blob and remove from user index
  const blobInfo = await head(shareKey(id))
  if (blobInfo) {
    await del(blobInfo.url)
  }

  const idxKey = indexKey(login)
  const idx = await readBlob<ShareIndex>(idxKey)
  if (idx) {
    const updated: ShareIndex = { shares: idx.shares.filter((s) => s !== id) }
    await writeBlob(idxKey, updated)
  }

  res.status(204).end()
}

// ---------- main ----------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string

  // CORS — GET is public
  if (req.method === 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS')
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

  if (req.method === 'GET') {
    return handleGet(req, res)
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
