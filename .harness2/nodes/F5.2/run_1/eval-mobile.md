# Mobile CSS Review: F5.2
**Reviewer:** Frontend/Mobile
**Date:** 2026-04-16
**Screenshot:** 375×812px (Playwright, headless Chromium)

## Verdict: ITERATE

Core mobile safety rails are present. Two issues need fixing before this is fully shippable: the `overflow-x: hidden` is applied globally (not inside a media query) which can mask layout bugs on desktop, and `.reader` has no lateral padding in its base rule — it relies entirely on the `@media (max-width: 480px)` override, meaning any screen between 481–640px gets zero padding.

---

## 🔴 CRITICAL

### C1 — `overflow-x: hidden` on `html, body` is **global**, not scoped to mobile
**Location:** `index.css:2737–2741`

```css
/* Applied unconditionally — NOT inside a @media query */
html,
body {
  overflow-x: hidden;
  max-width: 100vw;
}
```

`overflow-x: hidden` at the `html` level is a known footgun: it silently disables `position: sticky` on any descendant and can hide desktop layout regressions. This belongs inside `@media (max-width: 480px)` alongside the rest of the F5.1 fixes. Alternatively, fix the root cause of horizontal overflow (likely a specific component) rather than masking it globally.

**Severity:** 🔴 — functional regression risk on desktop.

---

### C2 — `.reader` has **no lateral padding** outside the 480px breakpoint
**Location:** `index.css:615–618` (base), `index.css:2821–2825` (480px override)

Base rule:
```css
.reader {
  max-width: var(--reader-max);
  margin: 0 auto;
  /* ← no padding-left / padding-right */
}
```

480px override adds `padding-left: 16px; padding-right: 16px` — but this only kicks in at ≤480px. At 481–640px (small Android phones, some iPhones in landscape) the reader body sits **flush against the screen edge**. The 16px minimum padding requirement is not satisfied at that range.

**Severity:** 🔴 — text-to-edge contact on mid-range mobile widths.

---

## 🟡 WARNINGS

### W1 — Touch target `min-height: 44px` does not cover `a` (anchor) links
**Location:** `index.css:2773–2781`

```css
.filter-btn,
.nav__logout,
.reader__back,
.landing__cta,
button,
[role="button"] {
  min-height: 44px;
}
```

Bare `<a>` tags used as navigation links (e.g., "Read a sample article →" on the landing page, visible in screenshot) are not covered. They will typically render at ~20–24px height. WCAG 2.5.5 requires 44×44px for touch targets.

### W2 — Code block `white-space: pre` is global (no media query needed, but `pre-wrap` would be safer)
**Location:** `index.css:2744–2750`

```css
pre,
pre code,
.md-code-block {
  overflow-x: auto;
  white-space: pre;
  max-width: 100%;
}
```

`white-space: pre` + `overflow-x: auto` is the correct combination and is applied globally (outside any media query), which is fine. However, `pre` without explicit `word-break: keep-all` can still cause issues in some edge-case browsers. Low risk, but worth noting.

### W3 — `font-size: 16px` on inputs uses **px not rem**
**Location:** `index.css:2754–2759`

This is intentional for iOS zoom prevention (iOS triggers zoom when `font-size < 16px`, and it reads the computed px value). Using `16px` literal is correct here. Noting it only to confirm it was a deliberate choice, not an oversight.

---

## 🔵 LGTM

| Check | Detail |
|---|---|
| ✅ iOS zoom prevention | `input, textarea, select, .share-page__gate-input { font-size: 16px }` at `@media (max-width: 480px)` — correct |
| ✅ Code blocks horizontal scroll | `overflow-x: auto; white-space: pre` on `pre, pre code, .md-code-block` — correct and global |
| ✅ Touch targets (buttons) | `min-height: 44px` on `button, [role="button"], .filter-btn, .nav__logout, .reader__back, .landing__cta` |
| ✅ Landing hero `clamp()` | `.landing__title { font-size: clamp(1.6rem, 8vw, 2.2rem) }` at ≤480px — scales gracefully |
| ✅ Share gate card padding | `padding: 24px 16px` at ≤480px, `padding: 28px 20px` at ≤640px — responsive cascade correct |
| ✅ Reader padding at ≤480px | `padding-left: 16px; padding-right: 16px` — meets 16px minimum |
| ✅ Visual screenshot | Landing page at 375px renders cleanly — no horizontal overflow, title fits, CTA button full-width |

---

## Summary of Required Fixes

| # | Issue | Severity | Location |
|---|---|---|---|
| C1 | Scope `overflow-x: hidden` to mobile media query | 🔴 | `index.css:2737` |
| C2 | Add base `padding: 0 16px` to `.reader` or extend to 481–640px | 🔴 | `index.css:615` |
| W1 | Add `min-height: 44px` to bare `<a>` navigation links | 🟡 | `index.css:2773` |
