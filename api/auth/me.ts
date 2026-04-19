import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifySession } from '../_session.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = (req.headers.cookie ?? '').split(';').reduce((acc, c) => {
    const [k, v] = c.trim().split('=')
    if (k && v) acc[k] = v
    return acc
  }, {} as Record<string, string>)

  const token = cookies.session
  if (!token) {
    return res.status(401).json({ user: null })
  }

  const payload = verifySession(token)
  if (!payload) {
    return res.status(401).json({ user: null })
  }

  res.json({ user: { login: payload.login, name: payload.name, avatar: payload.avatar } })
}
