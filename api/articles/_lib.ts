/**
 * Shared helper: fetch a file from the user's `<login>/logex-data` repo
 * using their OAuth access_token. Returns a normalized { status, body }
 * shape so route handlers can map directly to HTTP responses.
 *
 * Status mapping:
 *   200 → success, body is the parsed JSON file content
 *   401 → missing / invalid session (caller's responsibility, not here)
 *   403 → GitHub reports insufficient scope — user must re-auth with repo scope
 *   404 → repo or file missing; body.error === 'REPO_NOT_FOUND' when repo itself is 404
 *   502 → any other upstream GitHub error
 */

export interface FetchResult {
  status: number
  body: unknown
}

const GITHUB_API = 'https://api.github.com'

/**
 * Defend against path traversal. Allowed: relative paths with segments of
 * [A-Za-z0-9._-], separated by `/`. Reject `..`, absolute paths, newlines,
 * backslashes, null bytes.
 */
export function isSafeArticlePath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) return false
  if (path.length > 512) return false
  if (path.startsWith('/')) return false
  if (path.includes('\0')) return false
  if (/[\r\n\\]/.test(path)) return false
  const segments = path.split('/')
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..') return false
    if (!/^[A-Za-z0-9._-]+$/.test(seg)) return false
  }
  return true
}

/**
 * Fetch JSON file from `<login>/logex-data` on GitHub. Uses the
 * `application/vnd.github.raw+json` Accept header so the response body IS the
 * file (no base64/metadata wrapping).
 */
export async function fetchFromUserRepo(
  login: string,
  accessToken: string,
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchResult> {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(login)}/logex-data/contents/${path}`
  const res = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github.raw+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'logex-io',
    },
  })

  if (res.status === 200) {
    try {
      const body = await res.json()
      return { status: 200, body }
    } catch {
      return { status: 502, body: { error: 'UPSTREAM_PARSE_ERROR' } }
    }
  }

  if (res.status === 404) {
    // Distinguish "repo doesn't exist" vs "file inside repo doesn't exist".
    // GitHub returns 404 for both; probe the repo itself to tell them apart.
    const repoCheck = await fetchImpl(`${GITHUB_API}/repos/${encodeURIComponent(login)}/logex-data`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'logex-io',
      },
    })
    if (repoCheck.status === 404) {
      return {
        status: 404,
        body: {
          error: 'REPO_NOT_FOUND',
          login,
          message: `Create ${login}/logex-data to start`,
        },
      }
    }
    return { status: 404, body: { error: 'FILE_NOT_FOUND', path } }
  }

  if (res.status === 401 || res.status === 403) {
    // 401 = token invalid/revoked; 403 = scope insufficient (private repo on
    // read:user scope) or secondary rate-limit. Surface as 403 INSUFFICIENT_SCOPE
    // with a friendly hint pointing users at `gh repo create --public`.
    // (Note: 401-vs-403 collapse is tracked as openIssue; see handshake.)
    return {
      status: 403,
      body: {
        error: 'INSUFFICIENT_SCOPE',
        message: 'Your logex-data repo appears to be private. Make it public (gh repo edit --visibility public) or install the logex GitHub App (coming soon).',
      },
    }
  }

  return { status: 502, body: { error: 'UPSTREAM_ERROR', upstreamStatus: res.status } }
}
