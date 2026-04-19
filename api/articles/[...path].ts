import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthUserFull } from '../share/_lib.js'
import { fetchFromUserRepo, isSafeArticlePath } from './_lib.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const session = getAuthUserFull(req.headers.cookie)
  if (!session || !session.access_token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  // Vercel catchall: req.query.path is string | string[]
  const raw = req.query.path
  const segments = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  const path = segments.join('/')

  if (!isSafeArticlePath(path)) {
    res.status(400).json({ error: 'INVALID_PATH' })
    return
  }

  try {
    const result = await fetchFromUserRepo(session.login, session.access_token, path)
    res.setHeader('Cache-Control', 'private, max-age=60')
    res.setHeader('Content-Type', 'application/json')
    res.status(result.status).json(result.body)
  } catch (e) {
    console.error('[articles/[...path]] error:', e)
    res.status(502).json({ error: 'UPSTREAM_ERROR' })
  }
}
