import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'

function verifyToken(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  if (signature !== expected) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

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

  const secret = process.env.SESSION_SECRET ?? 'logex-dev-secret'
  const payload = verifyToken(token, secret)
  if (!payload) {
    return res.status(401).json({ user: null })
  }

  res.json({ user: { login: payload.login, name: payload.name, avatar: payload.avatar } })
}
