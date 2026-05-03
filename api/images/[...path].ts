import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthUserFull } from '../share/_lib.js'
import { isSafeArticlePath } from '../articles/_lib.js'

const GITHUB_API = 'https://api.github.com'

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

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

  const raw = req.query.path
  const segments = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  const path = segments.join('/')

  if (!path || !isSafeArticlePath(path)) {
    res.status(400).json({ error: 'INVALID_PATH' })
    return
  }

  const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
  const contentType = MIME_MAP[ext]
  if (!contentType) {
    res.status(400).json({ error: 'UNSUPPORTED_TYPE' })
    return
  }

  const url = `${GITHUB_API}/repos/${encodeURIComponent(session.login)}/logex-data/contents/images/${path}`

  try {
    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.raw',
        Authorization: `Bearer ${session.access_token}`,
        'User-Agent': 'logex-io',
      },
    })

    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 502).json({
        error: upstream.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      })
      return
    }

    const buf = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(buf)
  } catch (e) {
    console.error('[images/[...path]] error:', e)
    res.status(502).json({ error: 'UPSTREAM_ERROR' })
  }
}
