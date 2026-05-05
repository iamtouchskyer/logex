import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { signSession } from '../_session.js'

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

  const expectedState = cookies.oauth_state ?? ''
  // Constant-time compare (state is single-use random, impact negligible, but cheap)
  if (expectedState.length === 0 || expectedState.length !== state.length ||
      !crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(state))) {
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

  const tokenData = await tokenRes.json() as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
  }
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

  // Create signed session token — includes access_token so server-side
  // endpoints can proxy to the user's data repo. Token stays in httpOnly cookie,
  // never reaches browser JS.
  let token: string
  try {
    token = signSession({
      login: user.login,
      name: user.name,
      avatar: user.avatar_url,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: tokenData.expires_in
        ? Math.floor(Date.now() / 1000) + tokenData.expires_in
        : undefined,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7 days
    })
  } catch (e) {
    console.error('FATAL: cannot sign session —', e)
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

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
