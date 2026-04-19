# Test Design — security + UX

## Summary
- Total cases: 10
- By priority: P0: 7, P1: 3
- By category: unit: 5, api: 2, e2e-ui: 3 (deferred to task #19)

## Test Cases

### TC-SECUX-01: GitHubAdapter cache keyed by user login
- Category: unit
- Priority: P0
- Description: Fetch index as user A, switch to user B via setUserScope('B'), fetch index. Underlying fetch called twice, memCache has both `pub:A:` and `pub:B:` keys. Covers B2.
- Steps: set mocked fetch; two setUserScope calls; assert call count + key prefixes.
- Expected: 2 fetches, 2 distinct keys.
- Failure impact: user B sees user A's private index in shared browser profile.
- Command: `npm run test:unit -- src/lib/storage/__tests__/GitHubAdapter.test.ts`

### TC-SECUX-02: GitHubAdapter calls only /api/articles/*
- Category: unit
- Priority: P0
- Description: Every fetch URL starts with `/api/articles/`; zero calls to api.github.com / jsdelivr. Covers OUT-3.
- Steps: spy fetch, drive all read methods, inspect URL prefixes.
- Expected: 100% prefix match; zero direct GitHub calls.
- Failure impact: token-in-browser regression.
- Command: `npm run test:unit -- src/lib/storage/__tests__/GitHubAdapter.test.ts`

### TC-SECUX-03: OAuth state crypto-random, 32 hex, unique
- Category: unit
- Priority: P0
- Description: Call login handler 3× , extract state param, assert `/^[a-f0-9]{32}$/` and all distinct. Covers S2.
- Steps: three invocations, collect Locations, regex-match, Set size === 3.
- Expected: pattern + uniqueness pass.
- Failure impact: predictable CSRF against OAuth.
- Command: `npm run test:unit -- api/auth/__tests__/login.test.ts`

### TC-SECUX-04: Source tree clean of tokens/repo/Math.random
- Category: unit (grep guard)
- Priority: P0
- Description: `grep -rE "logex-dev-secret|VITE_GITHUB|iamtouchskyer/logex-data|Math\.random" src/ api/ --include="*.ts" --include="*.tsx"` — zero matches outside fixtures/tests. Covers OUT-3 + S2 regression guard.
- Steps: run grep; manually triage hits.
- Expected: either empty or only fixture/test paths.
- Failure impact: leaked tokens or reintroduced weak RNG.
- Command: see description.

### TC-SECUX-05: Share password required via POST only
- Category: api
- Priority: P0
- Description: (a) GET password-protected share → 401 PASSWORD_REQUIRED; (b) POST JSON body `{password:"correct"}` → 200 + content; (c) POST wrong password → 401; (d) `GET ?password=correct` → still 401 (query never read). Covers B4.
- Steps: four specs mocking blob store.
- Expected: all four assertions hold.
- Failure impact: password leaks via URL → access logs, Referer, proxies.
- Command: `npm run test:unit -- api/share/__tests__/id.test.ts`

### TC-SECUX-06: /api/articles/* 403 INSUFFICIENT_SCOPE carries onboarding hint
- Category: api
- Priority: P0
- Description: Mock upstream 403 → handler 403 with body.code === "INSUFFICIENT_SCOPE" and message contains `gh repo edit --visibility public`. Covers B3 + OUT-2 branch C.
- Steps: mock 403, call handler, assert body.
- Expected: friendly hint present.
- Failure impact: users see opaque 403, no recovery path.
- Command: `npm run test:unit -- api/articles/__tests__/handlers.test.ts`

### TC-SECUX-07: EmptyOnboarding renders 3 CLI commands + axe clean
- Category: unit
- Priority: P0
- Description: Render `<EmptyOnboarding/>` via React Testing Library; assert DOM contains `npm i -g logex-cli`, `logex init`, `git push`; run jest-axe / axe-core and assert zero critical/serious violations. Covers OUT-5 + a11y.
- Steps: RTL render; axe scan.
- Expected: DOM + axe both clean.
- Failure impact: onboarding copy regresses; a11y regression.
- Command: `npm run test:unit -- src/components/__tests__/EmptyOnboarding.test.tsx`

### TC-SECUX-08: npm pack excludes .env, .harness, tokens
- Category: unit (packaging guard)
- Priority: P0
- Description: `npm pack --dry-run 2>&1 | grep -E "\.env|harness|ghp_|github_pat_"` exits non-zero. Covers OUT-6.
- Expected: grep empty → exit 1.
- Failure impact: secrets published to npm registry.
- Command: see description.

### TC-SECUX-E2E-01: unauthenticated redirect + share public (OUT-4) — DEFERRED
- Category: e2e-ui
- Priority: P1
- Status: **DEFERRED to task #19**.
- Plan: Playwright — (a) cleared cookies + `/` → redirect to GitHub consent URL with `scope=read%3Auser`; (b) cleared cookies + `#/share/abc` → share DOM rendered.
- Expected: both navigation assertions pass.

### TC-SECUX-E2E-02: empty-state + forced 500 retry + axe (OUT-5) — DEFERRED
- Category: e2e-ui
- Priority: P1
- Status: **DEFERRED to task #19**.
- Plan: Playwright with mocked 404 REPO_NOT_FOUND → onboarding visible; forced 500 → retry button; AxeBuilder().analyze() zero critical/serious.

### TC-SECUX-E2E-03: expired JWT → redirect (OUT-4) — DEFERRED
- Category: e2e-ui
- Priority: P1
- Status: **DEFERRED to task #19**.
- Plan: Playwright seed expired JWT → navigates to `/api/auth/login` within 2s; no blank root.

## Coverage Assessment
Covers B2, B4, S2, OUT-3, OUT-5 (unit), B3 flow, a11y. E2E cases flagged DEFERRED for deploy-time verification under real vercel dev. Does NOT cover SESSION_SECRET/B1 or OAuth scope — those are in tester eval.

## VERDICT
VERDICT: TEST-CASES 10 — 10 security+UX cases (7 executable now, 3 deferred)
