# Logex Iteration Plan — 5 Feature Units

## Global Acceptance Criteria

- MD 渲染：所有 heading/list/code/bold/italic/table/strikethrough 渲染正确，无 raw markdown 泄漏
- 分享功能：带密码的 share link，管理界面可创建/撤销，访客可免 OAuth 阅读
- Sidebar：左侧导航含 Search、Projects、Tags、Stats、Timeline，可折叠，mobile 变 drawer
- 性能：index.json + 每篇文章 JSON 有浏览器缓存；首屏快
- Mobile：375px 下完整可用，touch targets ≥ 44px，无水平滚动

## Quality Tier: polished

---

## Units

- F1.1: implement — Fix MarkdownRenderer.tsx: add table support, strikethrough, nested lists, multi-paragraph blockquotes
  - verify: `npx vitest run` passes; screenshot of rendered article with table/strikethrough
  - eval: No raw markdown visible in output; XSS safe; code blocks preserve whitespace

- F1.2: review — Independent code review of F1.1 MarkdownRenderer changes
  - verify: eval-frontend.md and eval-tester.md produced in .harness2/nodes/F1.2/run_1/
  - eval: XSS safety, edge cases, performance

- F1.3: fix — Address F1.2 FAIL findings: (1) merge multi-line paragraphs, (2) fix indented-code-before-list ordering, (3) setext/HR disambiguation, (4) table false positive (require 2+ pipe chars), (5) unclosed fenced code block guard, (6) add safeHref invariant comment for inline images
  - verify: `npx vitest run src/lib/__tests__/markdown.test.ts` passes; add regression tests for each fixed bug
  - eval: All 7 criticals from F1.2 addressed; no new regressions

- F1.4: review — Re-review MarkdownRenderer after F1.3 fixes, verify all F1.2 criticals resolved
  - verify: eval-frontend.md produced; no 🔴 findings remaining
  - eval: Confirm fixes correct without introducing new issues

- F4.1: implement — Add two-layer caching to GitHubAdapter: in-memory Map (TTL 5min index, 30min articles) + Cache Storage API stale-while-revalidate; make loadAllArticles lazy (list page only fetches index.json)
  - verify: `npx vitest run` passes; article list page network shows only index.json fetch; second article open uses cache
  - eval: No stale data, memory bounded, no race conditions

- F4.2: review — Independent code review of F4.1 caching implementation
  - verify: eval-frontend.md and eval-backend.md produced
  - eval: Race conditions, cache invalidation, bundle size

- F3.1: implement — Add left sidebar to App.tsx layout: Projects list with counts, Tags cloud with counts, Stats summary, Timeline link, Shares link; collapsible desktop, drawer mobile; replace/enhance current top nav
  - verify: `npx vitest run` passes; screenshots at 1280px (expanded), 1280px (collapsed), 375px (drawer open), 375px (drawer closed)
  - eval: Keyboard navigable, ARIA landmarks, touch targets, no layout breaks

- F3.2: review — Independent code review of F3.1 sidebar implementation
  - verify: eval-frontend.md and eval-a11y.md produced
  - eval: Accessibility, z-index, mobile touch behavior

- F2.1: implement — Vercel serverless API for share links: POST /api/share (create), GET /api/share/:id (validate+read), DELETE /api/share/:id (revoke); store in vercel blob JSON; password as bcrypt hash; token nanoid(12)
  - verify: curl POST /api/share returns {id,url}; GET with correct password returns article; GET with wrong password returns 403
  - eval: No plaintext passwords, token entropy, expiry enforced

- F2.2: review — Independent security review of F2.1 share API
  - verify: eval-security.md and eval-backend.md produced
  - eval: Auth bypass risk, CSRF on DELETE, token entropy, password storage

- F2.3: implement — Share UI: (a) share button + modal on ArticleReader; (b) public /share/:id route (no OAuth); (c) /settings/shares management page listing active shares with revoke button
  - verify: screenshots of share modal, public share page, management page
  - eval: Modal accessible (focus trap, Escape), expired share handled gracefully

- F2.4: review — Independent frontend review of F2.3 share UI
  - verify: eval-frontend.md and eval-a11y.md produced
  - eval: Focus trap, Escape behavior, password UX, error states

- F5.1: implement — Mobile CSS fixes: article cards full-width at 375px, reader body text 16px min, code blocks horizontal scroll, touch targets 44px min, no horizontal overflow anywhere, landing hero scales
  - verify: Playwright screenshots at 375x812, 768x1024 for landing/list/reader; no horizontal scrollbar visible
  - eval: Font sizes, touch targets, safe-area-inset, dark theme on mobile

- F5.2: review — Independent review of F5.1 mobile CSS changes
  - verify: eval-frontend.md and eval-a11y.md produced
  - eval: viewport meta, fixed-width elements, iOS auto-zoom prevention
