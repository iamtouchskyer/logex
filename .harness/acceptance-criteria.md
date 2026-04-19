# Acceptance Criteria — logex-io Multi-Tenant Rework

## Task

Convert `logex-io.vercel.app` from a single-tenant viewer hardcoded to `iamtouchskyer/logex-data` into a public SaaS where any GitHub user OAuths in and reads their own `<login>/logex-data` repo via their own OAuth token. Remove the allowlist, eliminate browser-side GitHub tokens, and add server-proxied article endpoints that use the user's session token.

## Quality Tier

`functional`

## Outcomes

- OUT-1: Auth layer is multi-tenant — `api/auth/login.ts` requests `scope=read:user repo`; `api/auth/callback.ts` writes the GitHub `access_token` into the HS256 httpOnly JWT and removes the `ALLOWED_GITHUB_USERS` gate; `getAuthUser` returns `{login,name,avatar,access_token,exp}`; token never reaches browser JS; any GitHub user can complete login.
- OUT-2: New endpoints `GET /api/articles/index` and `GET /api/articles/[...path]` exist. Each reads session, calls `api.github.com/repos/<login>/logex-data/contents/...` with the user's access_token, and handles all failure modes: 401 without session, 404 `{code:"REPO_NOT_FOUND"}` when repo missing, 403 when token lacks repo scope, 502 when upstream GitHub errors, 200 JSON otherwise.
- OUT-3: `src/lib/storage/GitHubAdapter.ts` rewritten to call `/api/articles/*` only. Zero direct `api.github.com` / `cdn.jsdelivr.net` calls, zero `VITE_GITHUB_*` references anywhere in `src/`. Built `dist/` bundle contains no tokens, no repo identifiers.
- OUT-4: Router guards in `App.tsx`: unauthenticated users on non-share routes redirect to `/api/auth/login`; `#/share/:id` stays public and bypasses the guard; token-expiry / 401 on any protected fetch triggers the same redirect (no silent blank screen failure mode).
- OUT-5: Empty-state onboarding — when `/api/articles/index` returns 404 REPO_NOT_FOUND, UI shows "Get started with logex" view with copy-paste commands (`npm i -g logex-cli`, `logex init`, `git push`); no 500, no crash, axe-core clean; same component also renders for any 4xx/5xx with a retry button (no unhandled error boundary).
- OUT-6: Full test suite green, new code 100% line-covered, `npm pack --dry-run` clean (no `.env`, no tokens, no `.harness/`). Existing 213 unit tests + 7 E2E all pass.

## Verification

- OUT-1: unit test on `api/share/_lib.ts` — sign `{login,access_token:"ghu_xxx"}`, call `getAuthUser(cookie)`, assert `access_token==="ghu_xxx"`. `grep -n "scope=" api/auth/login.ts` outputs `scope=read:user%20repo`. `rg "ALLOWED_GITHUB_USERS" api/ src/` returns zero hits. Playwright E2E logs in as a non-owner stub user → HTTP 200 on app shell.
- OUT-2: `curl -i $URL/api/articles/index` no cookie → HTTP 401. `curl -i -b "session=$VALID_JWT"` → HTTP 200 + JSON. Mocked missing repo → HTTP 404 body contains `"REPO_NOT_FOUND"`. Mocked 403 from GitHub → HTTP 403. Mocked 500 from GitHub → HTTP 502. Vitest covers all five branches with GitHub API mocked at fetch boundary.
- OUT-3: `rg "api\.github\.com|jsdelivr|VITE_GITHUB" src/` returns zero matches. `npm run build && grep -rE "ghp_|github_pat_|VITE_GITHUB" dist/` exits non-zero. Adapter unit tests assert fetch is called only with paths starting `/api/articles/`.
- OUT-4: Playwright: (a) clear cookies, visit `/`, asserts redirect to GitHub consent URL; (b) clear cookies, visit `#/share/abc`, asserts share DOM rendered; (c) valid session → app shell; (d) seeded expired JWT → redirect to login, not blank page.
- OUT-5: Playwright: session-mock user whose `/api/articles/index` returns 404 REPO_NOT_FOUND; screenshot contains "Get started with logex" plus three CLI commands; inject a forced 500 → retry button visible; `axe.run()` reports zero critical/serious violations.
- OUT-6: `npm test -- --coverage --run` exits 0 with new files at 100% line coverage. `npm run test:e2e` reports 7/7 passed plus new E2Es above. `npm pack --dry-run 2>&1 | grep -E "\.env|harness|ghp_|github_pat_"` exits non-zero.

## Quality Constraints

- 100% line coverage on all new code; zero `test.skip` / `test.todo` / `xit` / `xdescribe` in final commit.
- Mocks only at external boundary (GitHub API via fetch). No mocking of own adapter, router, or JWT helper.
- E2E runs on real Vite dev server + real `vercel dev` server; no jsdom simulation of routes.
- UI screenshot verification mandatory via Playwright after any frontend change; screenshots retained as CI artifacts.
- axe-core scan returns zero critical and zero serious violations; keyboard nav and WCAG AA contrast verified on login, empty-state, and article routes.
- Each test runs independently; no shared mutable state between tests.
- Atomic commits, one logical change per commit; full test suite passes before every push.
- No secrets in browser bundle, npm tarball, or git history.

## Out of Scope

- SaaS billing / Stripe / quota enforcement.
- Team or org-owned data repos (only single user-owned `<login>/logex-data`).
- Multiple data repos per user.
- Custom domains per tenant.
- Migration tooling for existing `iamtouchskyer/logex-data` layout.
- Write operations from the web UI (still CLI-only).
