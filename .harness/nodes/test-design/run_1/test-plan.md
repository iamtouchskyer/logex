# Test Plan — Multi-Tenant Rework (run_1)

Scope: verify OUT-1..OUT-6 + regressions B1/B2/B3/B4 + security S2 + a11y on EmptyOnboarding.

Mix: 12 unit, 5 API integration, 3 E2E. Max 20 cases.

---

## T1 — SESSION_SECRET prod-missing fail-closed (B1 regression)
- Verifies: B1, OUT-1
- How: vitest `api/__tests__/_session.test.ts` — spec "throws in production when SESSION_SECRET missing" and "verifySession returns null when secret missing in prod".
- Command: `npm run test:unit -- api/__tests__/_session.test.ts`
- Pass: both specs green; no fallback to dev secret in prod.

## T2 — getAuthUser round-trips access_token (OUT-1)
- Verifies: OUT-1 ("token reaches callback, lives in JWT, flows to getAuthUser")
- How: vitest covers `signSession({login, access_token:'ghu_xxx'})` → cookie → `getAuthUser(cookie).access_token === 'ghu_xxx'`.
- Command: `npm run test:unit -- api/__tests__/_session.test.ts`
- Pass: assertion passes.

## T3 — OAuth login scope = read:user only (B3, OUT-1)
- Verifies: B3 regression + OUT-1
- How: `api/auth/__tests__/login.test.ts` asserts 302 Location has `scope=read%3Auser` and does NOT contain `repo`.
- Command: `npm run test:unit -- api/auth/__tests__/login.test.ts`
- Pass: location string matches; `repo` substring absent.

## T4 — OAuth state is crypto-random 32 hex chars (S2)
- Verifies: S2
- How: login.test.ts captures `state` query param across 3 calls; asserts length=32, unique, matches `/^[a-f0-9]{32}$/`.
- Command: `npm run test:unit -- api/auth/__tests__/login.test.ts`
- Pass: all three states unique and match pattern.

## T5 — Logout cookie attrs match login (S4)
- Verifies: S4
- How: `api/auth/__tests__/logout.test.ts` asserts Set-Cookie header: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=0`, and `Secure` only when NODE_ENV=production.
- Command: `npm run test:unit -- api/auth/__tests__/logout.test.ts`
- Pass: both prod/non-prod branches assert correctly.

## T6 — GitHubAdapter cache keyed by user login (B2)
- Verifies: B2 regression
- How: `src/lib/storage/__tests__/GitHubAdapter.test.ts` — set user A, fetch index, set user B (setUserScope('B')), fetch again, assert underlying fetch was called twice (no cache hit across identities) and memCache has keys prefixed with both `pub:A:` and `pub:B:`.
- Command: `npm run test:unit -- src/lib/storage/__tests__/GitHubAdapter.test.ts`
- Pass: assertions hold; no cross-user leakage.

## T7 — GitHubAdapter calls only /api/articles/* (OUT-3)
- Verifies: OUT-3
- How: mock fetch, drive all adapter read methods, assert every URL begins with `/api/articles/`; assert zero calls to `api.github.com` or `cdn.jsdelivr.net`.
- Command: `npm run test:unit -- src/lib/storage/__tests__/GitHubAdapter.test.ts`
- Pass: all fetch urls prefix-matched.

## T8 — Source tree has no VITE_GITHUB / hardcoded repo / Math.random in api (OUT-3, S2)
- Verifies: OUT-3 + S2 regression guard
- How: `grep -rE "logex-dev-secret|VITE_GITHUB|iamtouchskyer/logex-data|Math\\.random" src/ api/ --include="*.ts" --include="*.tsx"`
- Command: above grep
- Pass: zero matches in production code; fixtures/tests OK.

## T9 — npm pack excludes .env, .harness, tokens (OUT-6)
- Verifies: OUT-6
- How: `npm pack --dry-run 2>&1 | tail -30` + `npm pack --dry-run 2>&1 | grep -E "\\.env|harness|ghp_|github_pat_"`
- Command: both above
- Pass: second grep exits non-zero (no matches).

## T10 — Lint + typecheck clean
- Verifies: OUT-6 build hygiene
- How: `npm run lint && npm run typecheck`
- Pass: both exit 0.

## T11 — EmptyOnboarding renders 3 CLI commands + axe clean (OUT-5, a11y)
- Verifies: OUT-5 + a11y requirement
- How: `src/components/__tests__/EmptyOnboarding.test.tsx` — renders component, asserts DOM contains `npm i -g logex-cli`, `logex init`, `git push`; runs `axe.run()` (jest-axe) and asserts zero critical/serious violations.
- Command: `npm run test:unit -- src/components/__tests__/EmptyOnboarding.test.tsx`
- Pass: DOM assertions + axe clean.

## T12 — ShareModal unit regression still green
- Verifies: OUT-6 ("existing unit tests all pass")
- How: `npm run test:unit -- src/components/__tests__/ShareModal.test.tsx`
- Pass: all specs green.

---

## T13 — /api/articles/index 401 without session (OUT-2)
- Verifies: OUT-2 branch A
- How: vitest integration `api/articles/__tests__/handlers.test.ts` calls handler with no cookie → expects 401 and JSON `{code:"UNAUTHENTICATED"}` (or equivalent).
- Command: `npm run test:unit -- api/articles/__tests__`
- Pass: status 401.

## T14 — /api/articles/index 404 REPO_NOT_FOUND (OUT-2)
- Verifies: OUT-2 branch B + OUT-5 empty-state trigger
- How: mock upstream GitHub fetch to return 404; handler should return 404 with body containing `"REPO_NOT_FOUND"`.
- Command: `npm run test:unit -- api/articles/__tests__/handlers.test.ts`
- Pass: status 404 + body.code === "REPO_NOT_FOUND".

## T15 — /api/articles/index 403 INSUFFICIENT_SCOPE with onboarding hint (B3, OUT-2)
- Verifies: B3 flow + OUT-2 branch C
- How: mock upstream 403 with `X-OAuth-Scopes` lacking repo visibility; handler returns 403 + body `{code:"INSUFFICIENT_SCOPE", message: /gh repo edit --visibility public/ }`.
- Command: `npm run test:unit -- api/articles/__tests__/handlers.test.ts`
- Pass: body carries friendly hint.

## T16 — /api/articles/* 502 on GitHub 500 + 200 happy path (OUT-2 D/E)
- Verifies: OUT-2 branches D + E
- How: two specs: (a) mock upstream 500 → handler 502; (b) mock upstream 200 with file content → handler 200 + JSON passthrough.
- Command: `npm run test:unit -- api/articles/__tests__/handlers.test.ts`
- Pass: status codes match.

## T17 — Share POST password in body (B4)
- Verifies: B4 flow
- How: `api/share/__tests__/id.test.ts` — (a) GET a password-protected share with no body → 401 PASSWORD_REQUIRED; (b) POST JSON body `{password:"correct"}` → 200 + content; (c) POST wrong password → 401; (d) query-string `?password=correct` on GET → still 401 (never read query).
- Command: `npm run test:unit -- api/share/__tests__/id.test.ts`
- Pass: all four specs pass.

---

## T18 — E2E: unauthenticated redirect + share public (OUT-4)
- Status: **DEFERRED to task #19** (deploy-and-verify). Reason: requires dev server + real Vite + vercel dev running.
- Plan for #19: Playwright — (a) cleared cookies + visit `/` → redirect to GitHub consent URL matching `/login/oauth/authorize.*scope=read%3Auser/`; (b) cleared cookies + visit `#/share/abc` → share DOM present (no redirect).
- Pass: both assertions green.

## T19 — E2E: empty-state onboarding + axe (OUT-5)
- Status: **DEFERRED to task #19**.
- Plan for #19: Playwright with session-mock user whose `/api/articles/index` returns 404 REPO_NOT_FOUND → screenshot contains "Get started with logex" + 3 CLI commands; forced 500 fixture → retry button visible; `new AxeBuilder().analyze()` → zero critical/serious.
- Pass: screenshot + axe clean.

## T20 — E2E: expired JWT → redirect, not blank (OUT-4)
- Status: **DEFERRED to task #19**.
- Plan for #19: seed expired JWT cookie, visit `/` → Playwright asserts navigation to `/api/auth/login` (or GitHub consent) within 2s; asserts page never shows blank `<div id="root"></div>`.
- Pass: redirect observed.

---

## Coverage map
| OUT/Issue | Cases |
|---|---|
| OUT-1 | T2, T3 |
| OUT-2 | T13, T14, T15, T16 |
| OUT-3 | T7, T8 |
| OUT-4 | T18, T20 (deferred) |
| OUT-5 | T11, T14, T19 (deferred) |
| OUT-6 | T9, T10, T12 |
| B1 | T1 |
| B2 | T6 |
| B3 | T3, T15 |
| B4 | T17 |
| S2 | T4, T8 |
| S4 | T5 |
| a11y | T11, T19 (deferred) |

## VERDICT
VERDICT: TEST-CASES 20 — 20 cases (12 unit, 5 API integration, 3 E2E-deferred)
