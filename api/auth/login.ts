import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) {
    // Not yet configured — redirect to one-time setup flow
    return res.redirect('/api/auth/setup')
  }

  // Use the actual request host so OAuth callback returns to the same domain
  // the user came from (logex-io.vercel.app vs session-brain.vercel.app aliases).
  // Falling back to env vars only when the header is missing (local CLI invocations).
  const reqHost = (req.headers['x-forwarded-host'] as string) || req.headers.host
  const host = reqHost
    ? `https://${reqHost}`
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:5173'
  const redirectUri = `${host}/api/auth/callback`
  const state = Math.random().toString(36).slice(2)

  // Set state cookie for CSRF protection
  res.setHeader('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user',
    state,
  })

  res.redirect(`https://github.com/login/oauth/authorize?${params}`)
}
