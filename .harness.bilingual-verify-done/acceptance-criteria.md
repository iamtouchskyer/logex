# Acceptance Criteria — logex bilingual E2E verification

## Task
Verify the logex bilingual (zh/en) refactor end-to-end via webapp-testing (Playwright).

## Outcomes

- OUT-1: Visiting `http://localhost:5174/#/en/` (unauth) renders Landing with English strings: title contains "Every AI session", feature heading "Auto-generated narratives" present, CTA text "Sign in with GitHub".
- OUT-2: Visiting `http://localhost:5174/#/zh/` (unauth) renders Landing with Chinese strings: title contains "每一次 AI session", feature heading "自动生成叙事" present, CTA text "用 GitHub 登录".
- OUT-3: Landing header includes a visible LangToggle with both `ZH` and `EN` buttons; 1 of the 2 has `aria-pressed="true"` matching URL lang.
- OUT-4: With `/api/auth/me` mocked to return a user, `#/en/` renders sidebar containing "Articles", "Timeline", "Shares"; `#/zh/` renders "文章", "时间线", "分享".
- OUT-5: Logged-in footer shows `articles from … sessions` under `#/en/` and `篇文章 来自 … 个 session` under `#/zh/`, proving `useT()` plural keys work.
- OUT-6: Console produces 0 messages at level `error` across all 4 verified URLs (`/en/`, `/zh/`, `/en/` logged-in, `/zh/` logged-in). Network 404 for logex-data is expected and SHOULD appear as a fetch failure banner but MUST NOT generate an uncaught console `error` entry.

## Verification

- OUT-1, OUT-2, OUT-3: Python Playwright script `/tmp/logex-verify.py` navigates unauth landing for each lang; assert text content via `page.locator(...).inner_text()`; screenshot to `/tmp/logex-landing-{lang}.png`.
- OUT-4, OUT-5: Same script intercepts `**/api/auth/me` → `{user: {...}}` fulfill; navigates `#/{lang}/`; asserts sidebar + footer text via locator `.inner_text()`; screenshot to `/tmp/logex-loggedin-{lang}.png`.
- OUT-6: Script attaches `page.on("console", ...)` collector across all navigations; at end asserts zero entries with `msg.type() == "error"`; dumps full console log to `/tmp/logex-console.log`.

Script exit code 0 = all assertions pass. Non-zero = at least one OUT-N failed; stderr prints which.

## Quality Constraints

- Viewport: 1280x900, headless chromium.
- Each page waits for `networkidle` OR a deterministic selector (timeout 10s) before screenshot.
- Dev server must be reachable at `http://localhost:5174/` before the script starts (curl 200 check up-front).
- Page load for each URL MUST complete under 10 seconds (selector wait timeout).
- No hard `sleep` beyond 2000ms per page.

## Out of Scope

- Not verifying logex-data repo contents (index.json 404 is expected — repo not yet pushed with new schema).
- Not verifying real GitHub OAuth flow (mocked via route intercept).
- Not verifying Share page (`#/share/:id`) or SharesManager.
- Not verifying article detail (`#/{lang}/articles/:slug`) since data fetch fails — will be E2E-tested after logex-data push.
- No marketing copy A/B, no performance budgets beyond the 10s page-load ceiling above.

## Quality Baseline (polished)

- [ ] Dark / light theme toggle present in header (theme toggle button visible).
- [ ] Responsive: 1280x900 viewport renders without horizontal scrollbar on any verified URL.
- [ ] Loading / error / empty states render cleanly — the logex-data 404 shows an error banner with explicit message, not a blank white page.
- [ ] Focus styles exist on LangToggle (visible focus ring when keyboard-tabbed).
- [ ] No layout shift when URL lang segment changes — only text content varies, structure identical.
