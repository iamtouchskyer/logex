import type { VercelRequest, VercelResponse } from '@vercel/node'
import { put, del, list } from '@vercel/blob'
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
 * Read blob by key. Uses list() to find the blob URL, then fetches the content.
 * Avoids the head() + CDN fetch pattern which can serve stale data after deletes.
 */
async function readBlob<T>(key: string): Promise<T | null> {
  try {
    const { blobs } = await list({ prefix: key, limit: 1 })
    const blob = blobs.find((b) => b.pathname === key)
    if (!blob) return null
    // Use downloadUrl (bypass CDN) to avoid stale reads after delete
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

// ---------- fetch article from GitHub data repo ----------

async function fetchArticle(slug: string): Promise<unknown | null> {
  const owner = process.env.GITHUB_DATA_OWNER
  const repo = process.env.GITHUB_DATA_REPO
  const token = process.env.GITHUB_TOKEN

  if (!owner || !repo) return null

  // Use jsDelivr CDN (GFW-friendly) for public repos, GitHub API for private
  if (!token) {
    // Public repo — jsDelivr
    const indexUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/index.json`
    const idxRes = await fetch(indexUrl)
    if (!idxRes.ok) return null
    const idx = await idxRes.json() as { articles?: Array<{ slug: string; path: string }> }
    const entry = idx.articles?.find((a) => a.slug === slug)
    if (!entry) return null
    const articleUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/${entry.path}`
    const artRes = await fetch(articleUrl)
    if (!artRes.ok) return null
    return artRes.json()
  }

  // Private repo — GitHub API
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
  }
  const indexUrl = `https://api.github.com/repos/${owner}/${repo}/contents/index.json`
  const idxRes = await fetch(indexUrl, { headers })
  if (!idxRes.ok) return null
  const idx = await idxRes.json() as { articles?: Array<{ slug: string; path: string }> }
  const entry = idx.articles?.find((a) => a.slug === slug)
  if (!entry) return null
  const articleUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${entry.path}`
  const artRes = await fetch(articleUrl, { headers })
  if (!artRes.ok) return null
  return artRes.json()
}

// ---------- handlers ----------

async function handleGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string
  const password = req.query.password as string | undefined

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
  // CSRF protection: require request to originate from same host
  const origin = req.headers.origin as string | undefined
  const host = req.headers.host as string | undefined
  if (origin && host) {
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

  // Delete blob — wrapped in try-catch to prevent orphaned index entries
  try {
    const { blobs } = await list({ prefix: shareKey(id), limit: 1 })
    const blob = blobs.find((b) => b.pathname === shareKey(id))
    if (blob) {
      await del(blob.url)
    }
  } catch (e) {
    console.error('Failed to delete share blob:', id, e)
    res.status(500).json({ error: 'Failed to delete share' })
    return
  }

  // Remove from user index
  try {
    const idxKey = indexKey(login)
    const idx = await readBlob<ShareIndex>(idxKey)
    if (idx) {
      const updated: ShareIndex = { shares: idx.shares.filter((s) => s !== id) }
      await writeBlob(idxKey, updated)
    }
  } catch (e) {
    // Non-fatal: share is deleted, index cleanup failed. Log and continue.
    console.error('Failed to update share index after delete:', id, e)
  }

  res.status(204).end()
}

// ---------- main ----------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string

  // CORS — GET is public (read-only share access), DELETE is same-origin only
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
