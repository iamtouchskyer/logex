import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) {
    // Not yet configured — redirect to one-time setup flow
    return res.redirect('/api/auth/setup')
  }

  // Canonical public host — pin to the user-facing alias (logex-io.vercel.app)
  // because Vercel rewrites req.headers.host to the project's internal canonical
  // host (session-brain.vercel.app), which would write the session cookie on the
  // wrong domain. Override with PUBLIC_HOST env var if needed.
  const host = process.env.PUBLIC_HOST
    ? `https://${process.env.PUBLIC_HOST}`
    : process.env.VERCEL_URL
      ? 'https://logex-io.vercel.app'
      : 'http://localhost:5173'
  const redirectUri = `${host}/api/auth/callback`

  // CSPRNG — 128 bits hex. Replaces Math.random() which is non-cryptographic
  // and V8 state is recoverable from a few outputs (CSRF risk — attacker
  // could predict `state` and craft an OAuth-login CSRF).
  const state = crypto.randomBytes(16).toString('hex')

  // Set state cookie for CSRF protection
  res.setHeader('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`)

  // `repo` scope is required to read private logex-data repos via the
  // GitHub Contents API. `read:user` alone only works for public repos.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo read:user',
    state,
  })

  res.redirect(`https://github.com/login/oauth/authorize?${params}`)
}
