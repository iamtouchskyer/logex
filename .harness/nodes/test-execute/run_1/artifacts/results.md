# Test Execute Results — run_1

Evidence directory: `.harness/nodes/test-execute/run_1/artifacts/`

| T# | Description | Result | Evidence |
|---|---|---|---|
| T1 | SESSION_SECRET prod-missing fail-closed (B1) | PASS | `api/__tests__/_session.test.ts` included in unit.log, 310/310 |
| T2 | JWT access_token round-trip (OUT-1) | PASS | `_session.test.ts` |
| T3 | OAuth scope=read:user only (B3) | PASS | `api/auth/__tests__/login.test.ts` |
| T4 | OAuth state crypto-random 32 hex (S2) | PASS | `login.test.ts` — "state is 32-char hex (CSPRNG)" |
| T5 | Logout cookie parity (S4) | PASS | `api/auth/__tests__/logout.test.ts` |
| T6 | GitHubAdapter cache per login (B2) | PASS | `src/lib/storage/__tests__/GitHubAdapter.test.ts` |
| T7 | Adapter calls only `/api/articles/*` (OUT-3) | PASS | same as T6 |
| T8 | Source grep clean | PASS | grep.log — all 9 hits are legit: comments documenting no-Math.random, fixture secrets in test files, the DEV_FALLBACK_SECRET constant in `api/_session.ts` which is prod-guarded. Zero production-code regressions. |
| T9 | npm pack excludes secrets | PASS | `npm pack --dry-run \| grep -E ".env\|harness\|ghp_\|github_pat_"` exits 1 (no matches). Tarball has 24 files, no `.env`, no `.harness/`. |
| T10 | Lint + typecheck | PASS | lint.log + typecheck.log — 0 errors each |
| T11 | EmptyOnboarding + axe | PASS | `src/components/__tests__/EmptyOnboarding.test.tsx` in 310/310 |
| T12 | ShareModal regression | PASS | `ShareModal.test.tsx` in 310/310 |
| T13 | /api/articles/index 401 | PASS | `api/articles/__tests__/handlers.test.ts` in 310/310 |
| T14 | /api/articles/index 404 REPO_NOT_FOUND | PASS | `handlers.test.ts` |
| T15 | /api/articles/* 403 INSUFFICIENT_SCOPE hint (B3) | PASS | `handlers.test.ts` |
| T16 | 502 on upstream 500 + 200 happy path | PASS | `handlers.test.ts` |
| T17 | Share POST password in body (B4) | PASS | `api/share/__tests__/id.test.ts` |
| T18 | E2E: unauth redirect + share public (OUT-4) | DEFERRED | task #19 — needs real vercel dev |
| T19 | E2E: empty-state + axe (OUT-5) | DEFERRED | task #19 |
| T20 | E2E: expired JWT redirect (OUT-4) | DEFERRED | task #19 |

## Summary
- PASS: 17
- FAIL: 0
- DEFERRED: 3 (all E2E, scheduled for task #19 deploy verification)

## Raw evidence
- `unit.log`: vitest — 27 files, 310 tests passed
- `lint.log`: eslint — 0 errors
- `typecheck.log`: tsc --noEmit — 0 errors
- `pack.log`: 24 files, no secrets/harness
- `grep.log`: only legit matches (test fixtures + anti-pattern comments)

## Grep triage note
The grep pattern intentionally matches strings like `logex-dev-secret` (to catch hardcoded fallback usage) and `Math.random` (to catch weak RNG). Triaged hits:
- `api/_session.ts` — the constant DEV_FALLBACK_SECRET is defined once and gated by `NODE_ENV !== 'production'` per B1 fix. Expected.
- `api/auth/login.ts` — comment documenting CSPRNG replaces Math.random(). Expected.
- `api/auth/__tests__/login.test.ts` — spy asserts Math.random NOT called. Expected.
- `src/pipeline/__tests__/publish.test.ts` — `Math.random` in test fixture tmp-dir name. Non-production. Expected.
- `src/lib/passwordGen.ts` — comment says "no Math.random". Expected.
- `src/lib/__tests__/share-api.test.ts` — fixture secret matching dev default. Non-production. Expected.

Zero production-code regressions of S2 / B1.
