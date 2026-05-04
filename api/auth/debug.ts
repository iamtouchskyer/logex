import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthUserFull } from '../share/_lib.js'

/**
 * Temporary debug endpoint — test the OAuth token against GitHub API.
 * DELETE THIS after diagnosing the INSUFFICIENT_SCOPE issue.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = getAuthUserFull(req.headers.cookie)
  if (!session) {
    return res.json({ error: 'no_session', hasToken: false })
  }

  const tokenPrefix = session.access_token
    ? `${session.access_token.slice(0, 6)}...${session.access_token.slice(-4)}`
    : 'MISSING'

  // Test 1: Can the token read public repo contents?
  const contentsUrl = `https://api.github.com/repos/${session.login}/logex-data/contents/index.json`
  const contentsRes = await fetch(contentsUrl, {
    headers: {
      Accept: 'application/vnd.github.raw+json',
      Authorization: `Bearer ${session.access_token}`,
      'User-Agent': 'logex-io',
    },
  })

  // Test 2: What scopes does the token have?
  const scopeHeader = contentsRes.headers.get('x-oauth-scopes') ?? 'NONE'
  const rateLimitRemaining = contentsRes.headers.get('x-ratelimit-remaining') ?? '?'

  // Test 3: Can we read user info?
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Accept: 'application/json',
    },
  })
  const userStatus = userRes.status
  const userScopes = userRes.headers.get('x-oauth-scopes') ?? 'NONE'

  let contentsBody = ''
  if (!contentsRes.ok) {
    try { contentsBody = await contentsRes.text() } catch { contentsBody = '(unreadable)' }
  }

  res.json({
    login: session.login,
    tokenPrefix,
    contents: {
      status: contentsRes.status,
      scopes: scopeHeader,
      rateLimitRemaining,
      body: contentsBody || '(ok)',
    },
    user: {
      status: userStatus,
      scopes: userScopes,
    },
  })
}
