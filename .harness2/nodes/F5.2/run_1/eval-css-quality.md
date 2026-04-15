# Mobile CSS Code Quality Review: F5.2
**Reviewer:** CSS Code Quality
**Date:** 2026-04-16

## Verdict: PASS

Mobile CSS additions are syntactically clean, use design tokens throughout, and contain no hardcoded colors. Three lower-severity issues worth addressing.

---

## 🔴 CRITICAL

_None._

---

## 🟡 WARNINGS

### W1 — `.share-page__gate-card` overridden at two different breakpoints (cascade conflict risk)
**Lines:** 2710–2712 (`max-width: 640px`) and 2810–2814 (`max-width: 480px`)

The same selector is set inside both breakpoints. The 480px block sets `padding: 24px 16px` + `max-width: 100%` + `border-radius`, which silently overrides the 640px block's `padding: 28px 20px`. This is intentional progressive narrowing, but it's invisible at a glance and will cause confusion on future edits. No functional breakage today, but fragile.

**Recommendation:** Either consolidate into a single breakpoint rule, or add an inline comment explaining the intentional cascade.

---

### W2 — Breakpoint inconsistency: `768px` in existing code, `640px` + `480px` in F5.1 block
**Lines:** 1818 (`max-width: 768px`), 1803 (`min-width: 769px`) vs. 2709 (`max-width: 640px`), 2752 (`max-width: 480px`)

The file uses **three distinct mobile breakpoints** (768, 640, 480) without a documented breakpoint system. The sidebar toggles at 768px, but the article/reader/landing content reflows at 640px. A device between 641–768px gets sidebar changes but NOT the F5.1 layout fixes — potentially leaving `.reader` at full desktop padding on a small tablet.

**Recommendation:** Document the breakpoint rationale or consolidate to two tiers (e.g., tablet ≤768px, phone ≤480px) and check coverage for the 641–768 range.

---

### W3 — Global rules applied outside any media query (lines 2737–2750)
```css
html, body { overflow-x: hidden; max-width: 100vw; }
pre, pre code, .md-code-block { overflow-x: auto; white-space: pre; max-width: 100%; }
```
These are placed in the F5.1 section but are **unconditional** — they apply on desktop too. `overflow-x: hidden` on `html`/`body` is a known footgun that silently breaks `position: sticky` elements. The comment header says "Mobile fixes (max-width: 480px)" but these rules sit outside any `@media` block, creating a misleading section boundary.

**Recommendation:** Move these into the 480px query if truly mobile-only, or keep global but move them to the top of the file with a clear "global layout resets" comment, away from the mobile section.

---

## 🔵 LGTM

- **No `!important` in mobile section.** The three `!important` declarations in the file (lines 774, 784, 818) are in markdown heading/code-block base styles — pre-existing, not introduced by F5.1. The nav hamburger `!important` (lines 1805–1813) is an intentional display-override guard, acceptable pattern.
- **All CSS variables used correctly.** No raw hex/rgb/hsl values in the last ~200 lines. All colors reference `var(--color-*)`, all radii use `var(--radius-*)`. Consistent with the rest of the file.
- **No dead code.** All selectors in the mobile block (`.article-card`, `.articles-feed`, `.filter-btn`, `.nav__logout`, `.reader__back`, `.landing__*`, `.share-page__gate-*`, `.reader`, `.reader__title`, `.md-body`, `.md-code-block`, `.share-modal__*`, `.shares-manager__*`) are confirmed live in JSX.
- **No syntax errors.** Braces balanced, no missing semicolons, file closes cleanly at line 2839 (`}`).
- **Logical grouping.** Sections are commented (`/* 1. */` through `/* 8. */`), selectors are grouped by component. Easy to scan.
- **iOS font-size fix present.** `font-size: 16px` on `input/textarea/select` at 480px correctly prevents iOS Safari auto-zoom.
- **Touch target fix (`min-height: 44px`) correctly scoped** to 480px block rather than applied globally.
