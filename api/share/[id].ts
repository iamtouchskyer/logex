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
  await put(key, JSON.stringify(data), { access: 'private', contentType: 'application/json', addRandomSuffix: false })
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

  // No-password share — skip verification, return article directly
  if (record.passwordHash === null) {
    const article = await fetchArticle(record.slug)
    res.status(200).json({ article, slug: record.slug })
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

  // Delete blob — use pathname directly (works for both public and private stores)
  try {
    await del(shareKey(id))
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

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res)
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
