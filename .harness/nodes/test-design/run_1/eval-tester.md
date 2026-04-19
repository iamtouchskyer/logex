# Test Design — tester

## Summary
- Total cases: 10
- By priority: P0: 8, P1: 2
- By category: api: 4, unit: 5, hygiene: 1

## Test Cases

### TC-TESTER-01: SESSION_SECRET prod-missing fail-closed
- Category: unit
- Priority: P0
- Description: In production with SESSION_SECRET unset, sign/verify must throw, and verifySession must return null (no dev-secret fallback). Covers B1 regression.
- Preconditions: `api/__tests__/_session.test.ts` exists (added in build run_2).
- Steps:
  1. Set `NODE_ENV=production` in test env.
  2. Delete `SESSION_SECRET`.
  3. Call `signSession({})` — expect throw.
  4. Call `verifySession(cookie)` — expect null.
- Expected: both spec assertions pass.
- Failure impact: symmetric JWT-forgery surface reopens.
- Command: `npm run test:unit -- api/__tests__/_session.test.ts`

### TC-TESTER-02: JWT round-trips access_token
- Category: unit
- Priority: P0
- Description: Sign `{login:'alice', access_token:'ghu_xxx'}`, verify, assert access_token survives round-trip. Covers OUT-1.
- Steps:
  1. signSession with payload containing access_token.
  2. Parse cookie, call getAuthUser / verifySession.
  3. Assert token equals input.
- Expected: strict equality.
- Failure impact: articles handlers cannot reach user's GitHub API.
- Command: `npm run test:unit -- api/__tests__/_session.test.ts`

### TC-TESTER-03: OAuth login scope = read:user only
- Category: unit
- Priority: P0
- Description: Login handler response Location contains `scope=read%3Auser` and NOT `repo`. Covers B3 regression + OUT-1.
- Steps:
  1. Call login handler.
  2. Inspect 302 Location header.
  3. Assert `scope=read%3Auser`; assert no `repo` substring.
- Expected: both assertions pass.
- Failure impact: app silently demands write scope on every private repo.
- Command: `npm run test:unit -- api/auth/__tests__/login.test.ts`

### TC-TESTER-04: Logout cookie parity with login
- Category: unit
- Priority: P0
- Description: Logout Set-Cookie matches login attributes: `HttpOnly; SameSite=Lax; Path=/; Max-Age=0`, and `Secure` only when prod. Covers S4.
- Steps: run logout handler in prod and non-prod; compare Set-Cookie strings.
- Expected: attribute set matches per env.
- Failure impact: stale session persists post-logout per RFC 6265.
- Command: `npm run test:unit -- api/auth/__tests__/logout.test.ts`

### TC-TESTER-05: /api/articles/index 401 without session
- Category: api
- Priority: P0
- Description: No session cookie → 401. Covers OUT-2 branch A.
- Steps: call handler with empty cookie header.
- Expected: status === 401.
- Failure impact: leaks data to anonymous callers.
- Command: `npm run test:unit -- api/articles/__tests__`

### TC-TESTER-06: /api/articles/index 404 REPO_NOT_FOUND
- Category: api
- Priority: P0
- Description: Mock upstream GitHub fetch → 404; handler returns 404 with body.code === "REPO_NOT_FOUND". Covers OUT-2 + empty-state trigger.
- Steps: mock fetch to return 404, call handler with valid session.
- Expected: 404 + body.code match.
- Failure impact: empty-state onboarding never fires; user sees generic 500.
- Command: `npm run test:unit -- api/articles/__tests__/handlers.test.ts`

### TC-TESTER-07: /api/articles/index 502 on upstream 500; 200 happy path
- Category: api
- Priority: P0
- Description: Covers OUT-2 branches D + E.
- Steps: two specs — (a) mock 500 → expect 502; (b) mock 200 + JSON body → expect 200 + body passthrough.
- Expected: both pass.
- Failure impact: unclassified 500 leaks opaque errors to UI.
- Command: `npm run test:unit -- api/articles/__tests__/handlers.test.ts`

### TC-TESTER-08: ShareModal regression
- Category: unit
- Priority: P1
- Description: Existing ShareModal tests still pass after refactor (OUT-6 hygiene).
- Steps: run existing test file.
- Expected: all specs green.
- Failure impact: pre-existing regression.
- Command: `npm run test:unit -- src/components/__tests__/ShareModal.test.tsx`

### TC-TESTER-09: Full unit suite green
- Category: unit
- Priority: P0
- Description: 310 unit tests from build run_2 remain green.
- Steps: `npm run test:unit`
- Expected: all pass, 0 skipped.
- Failure impact: silent regression elsewhere.
- Command: `npm run test:unit`

### TC-TESTER-10: Lint + typecheck
- Category: hygiene
- Priority: P1
- Description: `npm run lint && npm run typecheck`. Covers OUT-6.
- Expected: both exit 0.
- Failure impact: CI break.
- Command: `npm run lint && npm run typecheck`

## Coverage Assessment
Covers OUT-1, OUT-2 branches A/B/D/E, OUT-6 hygiene, regressions B1/B3, S4. Does NOT cover cross-user cache, Share POST flow, a11y, E2E — those are the security/UX roles' job.

## VERDICT
VERDICT: TEST-CASES 10 — 10 tester-angle cases
