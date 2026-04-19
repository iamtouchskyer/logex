# Backlog

## From review unit F1.2 — 2026-04-15T15:26:12.252Z
- [ ] 🔴 [critical] Multi-line paragraphs are not merged — each line becomes its own `<p>` _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🔴 [critical] Indented code block fires before nested list items _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🔴 [critical] Setext h2 cannot be disabled — bare `---` HR after text becomes `<h2>` _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🔴 [critical] Table detection false-positive on any line containing a single `|` _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🟡 [moderate] Unclosed fenced code block consumes the rest of the document silently _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🟡 [moderate] `safeHref` blocks `mailto:` and `tel:` links _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🟡 [moderate] `parseList` key collision: `keyBase` is used for the outer list AND passed down unchanged _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🟡 [moderate] `renderInline` does not recurse — bold/italic nesting is not handled _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🟡 [moderate] `blockquote` shadow variable: inner `lines` param shadows outer `lines` _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 1. **Multi-line paragraph** — no test that two consecutive non-blank lines merge into one `<p>` (would catch the 🔴 bug above). _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🔴 **[critical] Inline images inside link text / bold / italic bypass safeHref entirely** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
- [ ] 🔴 **[critical] Unclosed fenced code block causes correct termination but silently swallows the rest of the document** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
- [ ] 🟡 **[moderate] Table body consumption loop has no `|` escape hatch for intentional non-table `|` lines** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
- [ ] 🟡 **[moderate] No test for `javascript:` in image src** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
- [ ] 🟡 **[moderate] No test for `data:` URI scheme** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
- [ ] 🟡 **[moderate] No test for unclosed fenced code block** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
- [ ] 🟡 **[moderate] No test for empty string input** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_

## From review unit F3.2 — 2026-04-15T16:03:49.834Z
- [ ] ### 🔴 CRITICAL (blocks merge) _(from .harness2/nodes/F3.2/run_1/eval-frontend.md)_
- [ ] **Severity:** 🔴 Critical _(from .harness2/nodes/F3.2/run_1/eval-frontend.md)_
- [ ] **Severity:** 🔴 Critical _(from .harness2/nodes/F3.2/run_1/eval-frontend.md)_
- [ ] ### 🟡 WARNING (should fix before release) _(from .harness2/nodes/F3.2/run_1/eval-frontend.md)_
- [ ] **Severity:** 🟡 Warning _(from .harness2/nodes/F3.2/run_1/eval-frontend.md)_
- [ ] **Severity:** 🟡 Warning _(from .harness2/nodes/F3.2/run_1/eval-frontend.md)_
- [ ] **Severity:** 🟡 Warning _(from .harness2/nodes/F3.2/run_1/eval-frontend.md)_
- [ ] | #1: Touch targets < 44px | 🔴 Critical | UX/a11y | BLOCK | Low (CSS only) | _(from .harness2/nodes/F3.2/run_1/eval-frontend.md)_
- [ ] | #2: Nav links missing aria-label when collapsed | 🔴 Critical | a11y | BLOCK | Low (add aria-label) | _(from .harness2/nodes/F3.2/run_1/eval-frontend.md)_
- [ ] | #3: DRY violation (150+ lines duplicated JSX) | 🟡 Warning | Code Quality | FIX | Medium (extract component) | _(from .harness2/nodes/F3.2/run_1/eval-frontend.md)_
- [ ] | #4: Body scroll not locked on mobile drawer open | 🟡 Warning | UX | FIX | Low (add useEffect) | _(from .harness2/nodes/F3.2/run_1/eval-frontend.md)_
- [ ] | #5: No focus management on drawer open | 🟡 Warning | a11y | FIX | Low (add focus logic) | _(from .harness2/nodes/F3.2/run_1/eval-frontend.md)_
- [ ] ### 🔴 CRITICAL: Mobile close button lacks focus-visible indicator _(from .harness2/nodes/F3.2/run_1/eval-a11y.md)_
- [ ] ### 🔴 CRITICAL: No focus trap in mobile dialog _(from .harness2/nodes/F3.2/run_1/eval-a11y.md)_
- [ ] ### 🔴 CRITICAL: Focus not returned to hamburger button on mobile drawer close _(from .harness2/nodes/F3.2/run_1/eval-a11y.md)_
- [ ] ### 🟡 WARNING: Icon-only collapsed state uses `title` instead of `aria-label` _(from .harness2/nodes/F3.2/run_1/eval-a11y.md)_
- [ ] ### 🟡 WARNING: Project/tag buttons in mobile sidebar lack `aria-label` when collapsed _(from .harness2/nodes/F3.2/run_1/eval-a11y.md)_
- [ ] ### 🟡 WARNING: Color contrast on `--color-text-muted` may be marginal in light mode _(from .harness2/nodes/F3.2/run_1/eval-a11y.md)_
- [ ] | Mobile close button: no `:focus-visible` | 🔴 Critical | 2.4.7 | **MUST FIX** | _(from .harness2/nodes/F3.2/run_1/eval-a11y.md)_
- [ ] | Mobile dialog: no focus trap | 🔴 Critical | 2.4.3 | **MUST FIX** | _(from .harness2/nodes/F3.2/run_1/eval-a11y.md)_
- [ ] | Focus not returned to hamburger on close | 🔴 Critical | 2.4.3 | **MUST FIX** | _(from .harness2/nodes/F3.2/run_1/eval-a11y.md)_
- [ ] | Icon-only state: `title` not `aria-label` | 🟡 Warning | 1.1.1 | Should fix | _(from .harness2/nodes/F3.2/run_1/eval-a11y.md)_
- [ ] | Mobile sidebar buttons: inconsistent `aria-label` | 🟡 Warning | 1.1.1 | Should fix | _(from .harness2/nodes/F3.2/run_1/eval-a11y.md)_
- [ ] | Muted text contrast (light mode) | 🟡 Warning | 1.4.3 | Marginal pass | _(from .harness2/nodes/F3.2/run_1/eval-a11y.md)_

## From review unit F2.2 — 2026-04-15T16:17:58.911Z
- [ ] ## 🔴 CRITICAL (fixed) _(from .harness2/nodes/F2.2/run_1/eval-security.md)_
- [ ] ## 🟡 WARNINGS (accepted as known limitations) _(from .harness2/nodes/F2.2/run_1/eval-security.md)_
- [ ] ## 🔴 CRITICAL FINDINGS _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Severity**: 🔴 Data integrity violation _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Severity**: 🔴 Data consistency leak _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Severity**: 🔴 Storage leak + cross-user data access risk _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Severity**: 🔴 Data leak (post-deletion access) _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] ## 🟡 WARNINGS _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Severity**: 🟡 Function timeout risk in production _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Severity**: 🟡 Reliability issue _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Severity**: 🟡 UX/API design issue _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Severity**: 🟡 Security weakness (weak password acceptance) _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Status**: 🔴 **BROKEN** _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Status**: 🔴 **BROKEN** _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Status**: 🔴 **RISKY (CDN stale read)** _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Status**: 🟡 **Partial** _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Status**: 🔴 **BROKEN (race condition)** _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Status**: 🟡 **RISKY** _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] | 1 | Atomic CAS for max shares check (use Vercel KV or retry loop) | `api/share/index.ts:64-93` | 🔴 | High | _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] | 2 | Atomic share + index write (write share, then index with retry; rollback on fail) | `api/share/index.ts:88-93` | 🔴 | High | _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] | 3 | Wrap blob delete in try-catch (if fail, don't remove from index) | `api/share/[id].ts:135` | 🔴 | Low | _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] | 4 | Replace `head() + fetch()` with Vercel Blob `get()` API | `api/share/index.ts:22-32`, `api/share/[id].ts:17-27` | 🔴 | Medium | _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] | 5 | Enforce 8-char minimum password | `api/share/index.ts:54` | 🟡 | Low | _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] | 6 | Add isExpired to ShareMeta interface | `api/share/_lib.ts:23-29`, `api/share/index.ts:126` | 🟡 | Low | _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] | 7 | Retry logic on transient blob read failures | `api/share/index.ts:22-32` | 🟡 | Medium | _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] | 8 | Timeout wrapper for bcrypt | `api/share/index.ts:73` | 🟡 | Low | _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_
- [ ] **Data Integrity Risk**: 🔴 **HIGH** _(from .harness2/nodes/F2.2/run_1/eval-backend.md)_

## From review unit F2.4 — 2026-04-15T23:52:36.643Z
- [ ] ## 🔴 CRITICAL _(from .harness2/nodes/F2.4/run_1/eval-frontend.md)_
- [ ] ## 🟡 WARNINGS _(from .harness2/nodes/F2.4/run_1/eval-frontend.md)_
- [ ] ## 🔴 CRITICAL _(from .harness2/nodes/F2.4/run_1/eval-ux.md)_
- [ ] ## 🟡 WARNINGS _(from .harness2/nodes/F2.4/run_1/eval-ux.md)_
- [ ] | 1 | 🔴 | SharesManager:121 | No delete confirmation for irreversible action | _(from .harness2/nodes/F2.4/run_1/eval-ux.md)_
- [ ] | 2 | 🟡 | ArticleReader:219 | Password hint hidden from screen readers | _(from .harness2/nodes/F2.4/run_1/eval-ux.md)_
- [ ] | 3 | 🟡 | ArticleReader:120 | Clipboard failure silently ignored in ShareModal | _(from .harness2/nodes/F2.4/run_1/eval-ux.md)_
- [ ] | 4 | 🟡 | ArticleReader:131 | Background content not `aria-hidden` during modal | _(from .harness2/nodes/F2.4/run_1/eval-ux.md)_
- [ ] | 5 | 🟡 | SharePage:25 | Alert/focus race on wrong_password re-render | _(from .harness2/nodes/F2.4/run_1/eval-ux.md)_
- [ ] | 6 | 🟡 | SharesManager:203 | Table scroll region not keyboard-focusable | _(from .harness2/nodes/F2.4/run_1/eval-ux.md)_
- [ ] | 7 | 🟡 | SharesManager:254 | Delete spinner has no accessible label update | _(from .harness2/nodes/F2.4/run_1/eval-ux.md)_

## From review unit F5.2 — 2026-04-16T00:00:09.380Z
- [ ] ## 🔴 CRITICAL _(from .harness2/nodes/F5.2/run_1/eval-mobile.md)_
- [ ] **Severity:** 🔴 — functional regression risk on desktop. _(from .harness2/nodes/F5.2/run_1/eval-mobile.md)_
- [ ] **Severity:** 🔴 — text-to-edge contact on mid-range mobile widths. _(from .harness2/nodes/F5.2/run_1/eval-mobile.md)_
- [ ] ## 🟡 WARNINGS _(from .harness2/nodes/F5.2/run_1/eval-mobile.md)_
- [ ] | C1 | Scope `overflow-x: hidden` to mobile media query | 🔴 | `index.css:2737` | _(from .harness2/nodes/F5.2/run_1/eval-mobile.md)_
- [ ] | C2 | Add base `padding: 0 16px` to `.reader` or extend to 481–640px | 🔴 | `index.css:615` | _(from .harness2/nodes/F5.2/run_1/eval-mobile.md)_
- [ ] | W1 | Add `min-height: 44px` to bare `<a>` navigation links | 🟡 | `index.css:2773` | _(from .harness2/nodes/F5.2/run_1/eval-mobile.md)_
- [ ] ## 🔴 CRITICAL _(from .harness2/nodes/F5.2/run_1/eval-css-quality.md)_
- [ ] ## 🟡 WARNINGS _(from .harness2/nodes/F5.2/run_1/eval-css-quality.md)_
