# Backend Review — run_2 (re-review after blocker fixes)

Scope: verify run_1 blockers B1/B2/B3/B4 are genuinely fixed (structural, not band-aid). Flag regressions. Accept documented openIssues as debt.

---

## Fix verification (run_1 blockers)

### B1 — SESSION_SECRET fallback

Why it mattered: run_1 had callback.ts signing with the public dev secret while share/_lib.ts refused to verify with it — an asymmetric JWT-forgery surface.

Evidence in code:
- `api/_session.ts:27` — `resolveSessionSecret()` throws in production when SESSION_SECRET missing.
- `api/_session.ts:55` — `verifySession` catches that throw and fails closed by returning null.
- `api/auth/callback.ts:57`, `api/auth/me.ts:16`, `api/share/_lib.ts:159` — all three call sites now route through the same `signSession`/`verifySession` helpers.
- `api/_session.ts:69` — constant-time signature comparison added as hardening.

Closed — centralized module eliminates drift.

### B2 — cross-user cache leak

Why it mattered: memCache was keyed by path only, so in a shared browser tab user B reads user A's cached index.json and articles.

Evidence in code:
- `src/lib/storage/GitHubAdapter.ts:156` — index key is `pub:${login}:idx:index.json`.
- `src/lib/storage/GitHubAdapter.ts:176` — article key is `art:${login}:${path}`.
- `src/lib/storage/GitHubAdapter.ts:62` — setUserScope clears both memCache AND inFlight on identity change.
- `src/lib/auth.ts:29` — useAuth.logout invokes clearMemCache before navigation.

Closed — defense in depth at key-scope and explicit-clear layers.

### B3 — OAuth over-scope

Why it mattered: run_1 requested `repo` scope, which grants full R/W on every private repo for a read-only use-case.

Evidence in code:
- `api/auth/login.ts:40` — `scope: 'read:user'` only. No `repo`, no `public_repo`.
- `api/articles/_lib.ts:100` — returns INSUFFICIENT_SCOPE with a friendly `gh repo edit --visibility public` hint when the upstream 403s.
- `src/components/EmptyOnboarding.tsx:23` — onboarding command uses `gh repo create --public`.

Closed — biggest blast-radius reduction of the round.

### B4 — share password in URL

Why it mattered: query strings leak to access logs, Referer headers on outbound fetches, and proxy taps.

Evidence in code:
- `api/share/[id].ts:76` — password-protected GET returns `401 PASSWORD_REQUIRED` and never reads `req.query.password`.
- `api/share/[id].ts:84` — POST handler parses password only from JSON body.
- `api/share/[id].ts:219` — `Access-Control-Allow-Origin: *` scoped to GET only; POST/DELETE stay same-origin.
- `src/pages/SharePage.tsx:60` — client POSTs with `credentials:'same-origin'` and JSON body.

Closed — password never transits URL/Referer/logs.

---

## Non-blocking observations

- SUGGESTION `api/share/_lib.ts:109` — `verifySessionToken(token, secret)` is now dead code after callers moved to centralized verifySession.
  reasoning: dead crypto-related code invites future drift if re-imported and bypasses the prod-secret guard.
  → delete the function and its secret parameter entirely.

- SUGGESTION `src/components/EmptyOnboarding.tsx:23` — copy-paste command mkdir creates `${who}/logex-data` but cd targets `logex-data`.
  reasoning: users will hit "no such directory" on the cd step, breaking the happy-path onboarding.
  → change to `mkdir logex-data && cd logex-data && …`.

- SUGGESTION `api/auth/me.ts:17` — when verifySession returns null due to missing prod SESSION_SECRET, request silently 401s with no server log.
  reasoning: observability gap masks misconfiguration — operator would not notice until users report being logged out.
  → add `console.error('session verify failed')` in the null branch.

- SUGGESTION `api/_session.ts:72` — `if (payload.exp && payload.exp < now) return null` treats missing exp as non-expiring.
  reasoning: defense-in-depth against forged tokens that pass HMAC but omit exp.
  → require `typeof payload.exp === 'number'` and reject otherwise.

openIssues S3, backend-#4/#5/#6 accepted as documented debt per build/run_2/handshake.json.

---

## Verdict

LGTM
