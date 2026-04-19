# Backend Review — logex-io multi-tenant rework

Scope: session/JWT, OAuth, path-traversal, error taxonomy, cache, share snapshot, GitHubAdapter, race, log leakage.

---

## 🔴 Blockers

### 1. `SESSION_SECRET` falls back to hardcoded dev secret in prod
- 🔴 `api/auth/callback.ts:58` — `const secret = process.env.SESSION_SECRET ?? 'logex-dev-secret'` (no prod guard).
- `api/auth/me.ts:31` — same pattern.
- Effect: if `SESSION_SECRET` isn't configured on a Vercel deployment, the callback signs JWTs with the publicly-known dev secret → anyone can forge a session and smuggle in any `access_token`. `share/_lib.ts:getAuthUserFull` does guard prod, but the issuer doesn't, so asymmetry still breaks verification or issues forgeable tokens.
- **Fix**: in `callback.ts` and `me.ts`, abort with 500 if `!secret && NODE_ENV==='production'`. Match the guard in `share/_lib.ts:161`.

### 2. `GitHubAdapter` in-memory cache is not keyed by user
- 🔴 `src/lib/storage/GitHubAdapter.ts:50,110,129` — `memCache` keys are `idx:index.json` and `art:<path>`, with no `login` component.
- Effect: in the same tab/process, user A logs out → user B logs in → B reads A's cached `index.json` and article bodies (path collisions like `articles/foo.json` are common). Cross-tenant data leakage via client cache.
- **Fix**: include `user.login` in every cache key AND call `clearMemCache()` inside `useAuth` logout handler. Verify `inFlight` is also scoped.

### 3. OAuth scope `repo` over-grants
- 🔴 `api/auth/login.ts:28` — requests `read:user repo`. `repo` = full R/W on ALL private repos, delete, admin hooks, secrets. We only need to READ one specific repo.
- Violates minimum privilege. If the server is compromised or JWT is leaked, attacker controls every private repo of every user.
- **Fix**: use `read:user public_repo` for the common case (users with public `logex-data`). For private data, prefer a GitHub App install scoped to one repo, or document the tradeoff. At minimum drop to `public_repo` and surface `INSUFFICIENT_SCOPE` only when the repo is private.

---

## 🟡 Non-blocking

### 4. Error taxonomy: 401 and rate-limit 403 both collapse to `INSUFFICIENT_SCOPE`
- 🟡 `api/articles/_lib.ts:92-96` — GitHub 401 (revoked/expired token) and GitHub 403 (scope OR secondary rate-limit) both become HTTP 403 `INSUFFICIENT_SCOPE`.
- UI will push user through re-auth on a transient rate-limit, and won't log them out when their token is actually revoked.
- **Fix**: branch on `res.headers.get('x-ratelimit-remaining') === '0'` → 429; propagate 401 as 401 (triggers the existing `UnauthenticatedError` → `/api/auth/login` redirect path).

### 5. `access_token` is only base64-encoded inside the JWT
- 🟡 `api/auth/callback.ts` — Any cookie leak (logs, proxy middleware, backup, misconfigured cache) exposes the live GitHub token — the JWT signature is integrity-only, not confidentiality.
- **Fix**: AES-GCM-encrypt the `access_token` field before signing, or move to server-side session store keyed by a random sid cookie.

### 6. Share creation trusts unvalidated `articlePath` from user's index.json
- 🟡 `api/share/index.ts:97-104` — `articlePath` flows from user-controlled index.json straight into `fetchFromUserRepo` without `isSafeArticlePath` check. Contained to user's own repo, but defense-in-depth is cheap.
- **Fix**: gate with `isSafeArticlePath(articlePath)` before the fetch.

---

## 🔵 Suggestions

- `api/articles/[...path].ts:33` catch logs `e` — ensure Vercel log drain redacts headers; the error object shouldn't include Authorization, but double-check.
- Share token freshness: GitHub OAuth tokens don't auto-expire, so snapshot creation is OK today, but if you ever migrate to GitHub App (expiring tokens), add a 401 → re-auth path inside `handleCreate`.
- Path-traversal filter in `_lib.ts:26` is airtight for the tested cases (`..`, `%2e%2e` post-decode, `\0`, `\r\n\\`, absolute). Good.

---

## Verdict

**FAIL**

Finding #1 (SESSION_SECRET fallback), #2 (cross-user cache leak), and #3 (excessive `repo` scope) are real security/correctness defects. Each alone would gate. Fix these three and re-review; the rest are non-blocking.
