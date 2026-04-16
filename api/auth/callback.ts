import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'

function signToken(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state } = req.query as { code?: string; state?: string }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' })
  }

  // Verify CSRF state
  const cookies = (req.headers.cookie ?? '').split(';').reduce((acc, c) => {
    const [k, v] = c.trim().split('=')
    if (k && v) acc[k] = v
    return acc
  }, {} as Record<string, string>)

  if (cookies.oauth_state !== state) {
    return res.status(403).json({ error: 'State mismatch' })
  }

  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  })

  const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
  if (!tokenData.access_token) {
    return res.status(401).json({ error: tokenData.error || 'Failed to get access token' })
  }

  // Get user info
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
  })
  const user = await userRes.json() as { login?: string; avatar_url?: string; name?: string }

  if (!user.login) {
    return res.status(401).json({ error: 'Failed to get user info' })
  }

  // Check allowed users
  const allowed = (process.env.ALLOWED_GITHUB_USERS ?? '').split(',').map(s => s.trim().toLowerCase())
  if (allowed.length > 0 && allowed[0] !== '' && !allowed.includes(user.login.toLowerCase())) {
    return res.status(403).json({ error: `User ${user.login} is not authorized` })
  }

  // Create signed session token
  const secret = process.env.SESSION_SECRET ?? 'logex-dev-secret'
  const token = signToken({
    login: user.login,
    name: user.name,
    avatar: user.avatar_url,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7 days
  }, secret)

  // Set session cookie and clear state cookie
  const isLocal = !process.env.VERCEL_URL
  const secure = isLocal ? '' : ' Secure;'
  res.setHeader('Set-Cookie', [
    `session=${token}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=${7 * 24 * 3600}`,
    `oauth_state=; Path=/; HttpOnly; Max-Age=0`,
  ])

  // Redirect to home
  res.redirect('/')
}
