# Acceptance Criteria — Logex Iteration v2

## Outcomes

- OUT-1: MD rendering — all 6 element types (headings h1-h4, tables, strikethrough, nested lists, code blocks, inline bold/italic/code) render as correct HTML; zero raw markdown syntax (**, ~~, |, #) visible in rendered output; verified by Vitest test suite with 20+ test cases
- OUT-2: Share feature — authenticated owner can create a share link with optional password; unauthenticated visitor can read the shared article at /share/:id with correct password; wrong password returns HTTP 403; owner management page lists and revokes all active shares; verified by curl tests and Playwright screenshots
- OUT-3: Sidebar navigation — left sidebar shows Projects (with article counts), Tags (with counts), Stats summary (total tokens + cost), Timeline link; collapses to icon-only on desktop; transforms to slide-in drawer on mobile ≤768px; verified by Playwright screenshots at 1280px and 375px
- OUT-4: Performance — articles list page makes exactly 1 network request (index.json only, no individual article fetches); second visit to same article loads in <100ms from cache (no network request); verified by DevTools network trace screenshot and Vitest cache unit tests
- OUT-5: Mobile — zero horizontal scrollbar at 375px viewport width on all 3 pages (landing, list, reader); body text ≥16px; all interactive elements have touch target ≥44×44px; verified by Playwright screenshots with overflow assertion

## Verification

- OUT-1: `npx vitest run src/lib/__tests__/markdown.test.ts` — all cases pass; Playwright screenshot of article with table + strikethrough showing correct rendering (no raw syntax visible)
- OUT-2: `curl -X POST https://session-brain.vercel.app/api/share` returns 200 with {id,url}; `curl GET /api/share/:id?pw=wrong` returns 403; Playwright screenshot of /share/:id page and /settings/shares page
- OUT-3: Playwright screenshots at 1280×800 (sidebar expanded + collapsed) and 375×812 (drawer open + closed); no console errors; `npx vitest run` still passes
- OUT-4: `npx vitest run src/lib/__tests__/cache.test.ts` passes; Playwright network trace shows only 1 fetch on list page; cached article returns in <100ms on repeat open
- OUT-5: Playwright screenshots at 375×812 for all 3 pages; screenshot assertion confirms no element extends beyond viewport width

## Quality Constraints

- No plaintext passwords stored anywhere (share feature)
- Share token entropy ≥ 72 bits (nanoid 12+ chars)
- Cache TTL: index.json 5 minutes, article JSON 30 minutes
- Bundle size increase ≤ 20KB gzipped (no heavy markdown libraries)
- WCAG AA contrast maintained on all new UI elements

## Out of Scope

- Real-time collaboration or comments on shared articles
- Public article discovery (shares are private links, not indexed)
- Markdown editor (read-only rendering only)
- Push notifications for new articles
- Export to PDF or other formats
- Team/multi-user management

## Quality Baseline (polished)

- Dark/light mode works on all new UI components
- Loading states present on all new async operations (share creation, sidebar data)
- Error states handled gracefully (share expired, network failure)
- Focus-visible styles on all new interactive elements (sidebar links, share modal, drawer toggle)
- ARIA landmarks and labels on new navigation components
