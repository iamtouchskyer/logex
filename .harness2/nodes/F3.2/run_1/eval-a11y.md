# Accessibility Review: Sidebar Implementation
**Date:** 2026-04-15  
**Files Reviewed:** Sidebar.tsx, App.tsx, index.css  
**Standard:** WCAG 2.1 Level AA

## Verdict: ITERATE

The sidebar demonstrates good accessibility intent with proper ARIA landmarks, focus indicators, and semantic HTML. However, **three critical failures** block WCAG AA compliance: missing focus-visible on the mobile close button, no focus trap inside the mobile dialog, and missing focus return on drawer close. These must be fixed before merge.

---

## Findings

### 🔴 CRITICAL: Mobile close button lacks focus-visible indicator
**File:** `src/index.css:1745-1762`  
**Issue:** `.sidebar__close-btn:hover` has styling, but `.sidebar__close-btn:focus-visible` is missing.

```css
.sidebar__close-btn:hover {
  color: var(--color-text);
  border-color: var(--color-text-muted);
}
/* ❌ NO :focus-visible rule */
```

**Impact:** Keyboard users tabbing to close button receive no visible focus indicator. WCAG 2.1 Success Criterion 2.4.7 (Focus Visible) failure.

**Fix:** Add `.sidebar__close-btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`

---

### 🔴 CRITICAL: No focus trap in mobile dialog
**File:** `src/components/Sidebar.tsx:274-278` & `src/App.tsx`  
**Issue:** Mobile drawer is rendered as `role="dialog"` with `aria-modal="true"`, but there is **no focus trap implementation**. Keyboard users can tab out of the dialog into the background content (header, behind-drawer page content).

```tsx
<div className={`sidebar-wrapper sidebar-wrapper--mobile${mobileOpen ? ' sidebar-wrapper--mobile-open' : ''}`}
  role="dialog"
  aria-modal="true"
  aria-label="Navigation"
>
  {/* Dialog content — NO focus trap */}
```

**Impact:** When modal dialog is open, focus can escape to background content, breaking modal semantics. WCAG 2.1 Success Criterion 2.4.3 (Focus Order) partial failure; modal UX is broken.

**Fix:** Implement focus trap (e.g., use a library like `focus-trap-react` or manual implementation with `useEffect` + `ref` to cycle focus within dialog boundaries).

---

### 🔴 CRITICAL: Focus not returned to hamburger button on mobile drawer close
**File:** `src/App.tsx:65, 126-132`  
**Issue:** When mobile drawer closes, focus is not programmatically returned to the hamburger button that opened it.

```tsx
const handleMobileClose = useCallback(() => setMobileDrawerOpen(false), [])

// Hamburger button — no ref, focus not managed
<button
  className="nav__hamburger"
  onClick={() => setMobileDrawerOpen(true)}
  type="button"
  aria-label="Open navigation"
  aria-expanded={mobileDrawerOpen}
>
```

**Impact:** After user closes the dialog (Escape key or close button), focus jumps to `<body>` or unpredictable location. Keyboard user loses place in navigation flow. WCAG 2.1 Success Criterion 2.4.3 (Focus Order) failure.

**Fix:** 
1. Add `ref` to hamburger button
2. In `handleMobileClose`, restore focus: `hamburgerRef.current?.focus()`

---

### 🟡 WARNING: Icon-only collapsed state uses `title` instead of `aria-label`
**File:** `src/components/Sidebar.tsx:161, 184, 214`  
**Issue:** When sidebar is collapsed, navigation links and buttons show only icons with `title` attribute fallback:

```tsx
<a
  href={link.href}
  title={collapsed ? link.label : undefined}
  // ❌ title attribute alone is NOT accessible; screen reader may ignore it
>
  <span className="sidebar__link-icon">{link.icon}</span>
  {!collapsed && <span className="sidebar__link-text">{link.label}</span>}
</a>
```

**Impact:** Screen reader users in collapsed state hear nothing useful (title is not reliably read; icon has no accessible name). Partial WCAG 2.1 Success Criterion 1.1.1 (Non-text Content) compliance.

**Fix:** Use `aria-label={link.label}` instead of `title`, OR add visually-hidden span:  
```tsx
{collapsed && <span className="sr-only">{link.label}</span>}
```

---

### 🟡 WARNING: Project/tag buttons in mobile sidebar lack `aria-label` when collapsed
**File:** `src/components/Sidebar.tsx:324-332, 345-353` (mobile sidebar)  
**Issue:** Mobile project/tag buttons don't have `aria-label` (they appear only in the mobile drawer which is never collapsed, but the code pattern is inconsistent):

```tsx
<button
  className="sidebar__item-btn"
  onClick={() => { onProjectClick?.(name); onMobileClose() }}
  type="button"
  // ❌ NO aria-label in mobile, unlike desktop
>
```

**Impact:** Minor — mobile drawer always shows full text, but inconsistency with desktop pattern reduces maintainability. Potential future bug if mobile collapse is added.

**Fix:** Add consistent `aria-label`: `aria-label={`Filter by project ${name}, ${count} articles`}`

---

### 🔵 LGTM: ARIA landmarks are well-structured
**File:** `src/components/Sidebar.tsx:133-136, 154, 294, 302`  
**Evidence:**
- Desktop sidebar: `<aside aria-label="Main sidebar">` ✓
- Mobile sidebar: `<aside aria-label="Mobile navigation">` ✓
- Mobile nav: `<nav aria-label="Mobile navigation links">` ✓
- Mobile dialog: `role="dialog"` + `aria-modal="true"` + `aria-label="Navigation"` ✓
- Desktop nav: `<nav aria-label="Sidebar navigation">` ✓

**Verdict:** Landmarks are semantic, descriptive, and properly nested. No issues here.

---

### 🔵 LGTM: `aria-current="page"` correctly identifies active link
**File:** `src/components/Sidebar.tsx:160, 308`  
**Evidence:**
```tsx
aria-current={isActive(link.path) ? 'page' : undefined}
```
Desktop and mobile both use this. Current link is properly announced to screen readers. WCAG 2.1 Success Criterion 2.4.8 (Location Information) ✓

---

### 🔵 LGTM: Hamburger button `aria-expanded` is correct
**File:** `src/App.tsx:129`  
**Evidence:**
```tsx
aria-expanded={mobileDrawerOpen}
```
Button correctly reflects open/closed state. Screen reader will announce "Open navigation, expanded" when drawer is open. ✓

---

### 🔵 LGTM: Collapse toggle `aria-label` changes with state
**File:** `src/components/Sidebar.tsx:146`  
**Evidence:**
```tsx
aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
```
Label correctly reflects action. ✓

---

### 🔵 LGTM: SVG icons have `aria-hidden="true"`
**File:** `src/components/Sidebar.tsx:20, 31, 40, 52, 60, 68, 287`  
**Evidence:** All inline SVG icons include `aria-hidden="true"`, preventing screen readers from announcing decorative graphics.

```tsx
<svg ... aria-hidden="true">...</svg>
```
✓

---

### 🔵 LGTM: Skip link is functional and focused
**File:** `src/App.tsx:118` & `src/index.css:1070-1084`  
**Evidence:**
```tsx
<a href="#main-content" className="skip-link">Skip to content</a>
<main className="main" id="main-content">...</main>
```
Skip link CSS:
```css
.skip-link {
  position: absolute;
  top: -40px;
  /* hidden off-screen by default */
}
.skip-link:focus {
  top: 0;  /* appears on Tab */
}
```
Skip link appears on first Tab and links to `#main-content`. ✓

---

### 🔵 LGTM: Focus indicators on interactive elements
**File:** `src/index.css` (multiple rules)  
**Evidence:**
- `.sidebar__link:focus-visible` (line 1573) ✓
- `.sidebar__toggle:focus-visible` (line 1541) ✓
- `.sidebar__item-btn:focus-visible` (line 1644) ✓
- `.nav__hamburger:focus-visible` (line 1781) ✓

All use `outline: 2px solid var(--color-accent)` with `outline-offset: 2px` — good 2px minimum for WCAG 2.1. Missing only: `.sidebar__close-btn:focus-visible` (flagged above as critical).

---

### 🟡 WARNING: Color contrast on `--color-text-muted` may be marginal in light mode
**File:** `src/index.css:125`  
**Issue:** Light theme muted text is `#636380` (gray) on `#f0f0f6` (light gray surface). Ratio ≈ 4.0:1 (bare WCAG AA for normal text, but enhanced AA requires 7:1).

```css
[data-theme="light"] {
  --color-text-muted: #636380;  /* on light background */
}
```

**Impact:** Stats section and counts use this color. While 4.0:1 passes AA, it's at the threshold; readability could be questioned by auditors in critical paths. Not blocking, but noted.

**Verdict:** Pass AA minimum; consider bumping to `#535266` or darker for margin of safety in future refactors.

---

### 🔵 LGTM: Overlay is properly hidden from a11y tree
**File:** `src/components/Sidebar.tsx:269-272`  
**Evidence:**
```tsx
{mobileOpen && (
  <div
    className="sidebar__drawer-overlay"
    onClick={onMobileClose}
    aria-hidden="true"  /* ✓ Correctly hidden */
  />
)}
```

---

### 🔵 LGTM: All buttons use semantic `<button>` elements
**File:** `src/components/Sidebar.tsx` & `src/App.tsx`  
**Evidence:** All clickable elements are proper `<button>` or `<a>` elements, not divs with `onClick`. No `role="button"` workarounds needed. Keyboard support is native.

---

### 🔵 LGTM: Links to navigation use `<a>` with `href`
**File:** `src/components/Sidebar.tsx:156-165, 304-313`  
**Evidence:** Navigation links use proper `<a href>` elements, allowing middle-click, Ctrl+click, keyboard enter. ✓

---

## Summary Table

| Finding | Severity | WCAG SC | Status |
|---------|----------|---------|--------|
| Mobile close button: no `:focus-visible` | 🔴 Critical | 2.4.7 | **MUST FIX** |
| Mobile dialog: no focus trap | 🔴 Critical | 2.4.3 | **MUST FIX** |
| Focus not returned to hamburger on close | 🔴 Critical | 2.4.3 | **MUST FIX** |
| Icon-only state: `title` not `aria-label` | 🟡 Warning | 1.1.1 | Should fix |
| Mobile sidebar buttons: inconsistent `aria-label` | 🟡 Warning | 1.1.1 | Should fix |
| Muted text contrast (light mode) | 🟡 Warning | 1.4.3 | Marginal pass |
| ARIA landmarks | 🔵 LGTM | 1.3.1 | ✓ |
| `aria-current="page"` | 🔵 LGTM | 2.4.8 | ✓ |
| `aria-expanded` on hamburger | 🔵 LGTM | 4.1.2 | ✓ |
| Skip link functional | 🔵 LGTM | 2.4.1 | ✓ |
| Focus indicators present | 🔵 LGTM | 2.4.7 | ✓ (except close btn) |
| SVG icons `aria-hidden` | 🔵 LGTM | 1.1.1 | ✓ |
| All interactive elements semantic | 🔵 LGTM | 4.1.2 | ✓ |

---

## Recommendations (Prioritized)

### P0 — Blocker for merge
1. **Implement focus trap in mobile dialog** — use `focus-trap-react` library (13 lines) or manual ref-based implementation (25 lines)
2. **Add `aria-label` to mobile close button** (already has it ✓) + **add `:focus-visible` CSS**
3. **Restore focus to hamburger button on drawer close** — add ref + `hamburgerRef.current?.focus()`

### P1 — Should fix before merge
4. Replace `title` with `aria-label` on collapsed navigation links
5. Add `aria-label` to mobile sidebar project/tag buttons for consistency

### P2 — Consider for next sprint
6. Bump `--color-text-muted` in light mode for better contrast margin
7. Add E2E keyboard navigation test to CI (Tab through drawer, verify no escape, Escape closes)

---

## Tools for Verification

Run these locally before/after fixes:

```bash
# Axe accessibility scan (if integrated)
npm run test:a11y

# Tab through mobile drawer in DevTools (Chrome)
# 1. Open DevTools → Console
# 2. Trigger drawer: click hamburger
# 3. Tab repeatedly — should cycle only within drawer
# 4. Press Escape — should close and focus hamburger

# Check styles
grep "focus-visible" src/index.css | wc -l  # Should be 8+ after fix
```

---

**Reviewer:** Claude (Accessibility Specialist)  
**Review Date:** 2026-04-15  
**Next Step:** Assign fixes to P0 checklist, re-run review after implementation.
