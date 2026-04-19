# Frontend Code Review: Sidebar Implementation
**Project:** session-brain  
**Component:** `src/components/Sidebar.tsx`, `src/App.tsx`, `src/index.css`  
**Reviewer:** Senior Frontend Engineer  
**Date:** 2026-04-15

## Verdict: **ITERATE**

**Status:** 2 critical findings + 3 warnings. Fix touch targets and a11y labels before merge. All acceptance criteria met functionally; UX/a11y gaps must be addressed.

---

## Acceptance Criteria: ✅ ALL MET

| Criteria | Status | Notes |
|----------|--------|-------|
| Desktop sidebar 240px→56px collapse with 0.2s transition | ✅ | CSS vars correct, both wrapper and sidebar transition |
| Mobile slide-in drawer from left with overlay | ✅ | 280px drawer, translateX animation, 0.5 opacity overlay |
| Nav links with `aria-current="page"` active state | ✅ | Properly set on both desktop and mobile |
| Projects list with article counts & click filter | ✅ | useMemo aggregation, onProjectClick wired |
| Tags cloud (top-10) with counts & click filter | ✅ | slice(0,10) implemented, callbacks functional |
| Stats section (articles/tokens/cost) | ✅ | Desktop only (collapsed), mobile always visible |
| localStorage persistence via `logex-sidebar-collapsed` | ✅ | Read on init, write on toggle, try-catch wrapped |
| Escape key closes mobile drawer | ✅ | Listener in App.tsx:68-75 |
| Route change closes mobile drawer | ✅ | useEffect dependency on route.path |

---

## Findings by Severity

### 🔴 CRITICAL (blocks merge)

#### Finding #1: Touch Targets Undersized on Mobile
**Severity:** 🔴 Critical  
**File:** `src/index.css` lines 1630, 1749, 1769 (and computed heights)  
**Impact:** Accessibility failure (WCAG 2.1 Level AAA), poor mobile UX, fail touch target compliance

**Issue:**
- `.sidebar__item-btn` (projects/tags): ~16px height (computed from 5px padding + 0.8rem font)
- `.sidebar__link`: ~34px height (computed from 8px padding + 0.875rem font)  
- `.sidebar__close-btn`: 32px height (explicitly set line 1750)
- All fall below the 44×44px minimum for touch targets (WCAG 2.1 Level AAA, Apple HIG)

**Current CSS:**
```css
.sidebar__item-btn {
  padding: 5px 8px;        /* too small */
  font-size: 0.8rem;
}
.sidebar__link {
  padding: 8px 8px;        /* too small */
  font-size: 0.875rem;
}
.sidebar__close-btn {
  width: 32px; height: 32px; /* explicit, too small */
}
```

**Suggested Fix:**
Add mobile breakpoint overrides in `@media (max-width: 768px)`:
```css
@media (max-width: 768px) {
  .sidebar__link {
    padding: 12px 10px;      /* Increase to ~44px height */
    min-height: 44px;
  }
  .sidebar__item-btn {
    padding: 12px 10px;      /* Increase to ~40px height */
    min-height: 40px;
  }
  .sidebar__close-btn {
    width: 44px;
    height: 44px;            /* Meet minimum */
  }
}
```

---

#### Finding #2: Nav Links Missing `aria-label` When Collapsed (Icon-Only)
**Severity:** 🔴 Critical  
**File:** `src/components/Sidebar.tsx` lines 156–165  
**Impact:** Screen reader users in collapsed desktop view see no label, a11y WCAG 2.1 Level A failure

**Issue:**
When `collapsed === true`, nav links show only the icon. The icon has `aria-hidden="true"` (line 20–26), and there is NO `aria-label` on the link itself:

```tsx
// Current (line 156–165):
<a
  href={link.href}
  className={`sidebar__link${isActive(link.path) ? ' sidebar__link--active' : ''}`}
  aria-current={isActive(link.path) ? 'page' : undefined}
  title={collapsed ? link.label : undefined}  // ← title helps sighted users, not screen readers
>
  <span className="sidebar__link-icon">{link.icon}</span>
  {!collapsed && <span className="sidebar__link-text">{link.label}</span>}
</a>
```

**Why this fails:**
- `aria-hidden="true"` on icon suppresses it from a11y tree
- Text span is conditionally rendered (only when expanded)
- **Result:** Collapsed state = empty a11y label, screen reader announces nothing

**Suggested Fix:**
Add `aria-label` to the link, duplicate when collapsed:
```tsx
<a
  href={link.href}
  className={`sidebar__link${isActive(link.path) ? ' sidebar__link--active' : ''}`}
  aria-current={isActive(link.path) ? 'page' : undefined}
  aria-label={collapsed ? link.label : undefined}  // ← Add this
  title={collapsed ? link.label : undefined}
>
  <span className="sidebar__link-icon">{link.icon}</span>
  {!collapsed && <span className="sidebar__link-text">{link.label}</span>}
</a>
```

---

### 🟡 WARNING (should fix before release)

#### Finding #3: DRY Violation — 150+ Lines of Duplicated JSX
**Severity:** 🟡 Warning  
**File:** `src/components/Sidebar.tsx` lines 132–256 (desktop) vs. 293–382 (mobile)  
**Impact:** High maintenance burden, bug fixes must be made twice, harder to extend

**Issue:**
The component duplicates nearly identical sections:

| Section | Desktop | Mobile | Duplicated |
|---------|---------|--------|-----------|
| Projects list | Lines 172–199 | Lines 318–337 | ~28 lines |
| Tags list | Lines 201–229 | Lines 339–357 | ~18 lines |
| Stats section | Lines 232–254 | Lines 360–380 | ~23 lines |
| Nav links | Lines 154–167 | Lines 303–315 | ~12 lines |

Minor differences that prevent easy reuse:
- Desktop projects: `title={collapsed ? ... : undefined}` attr
- Mobile projects: Always shows full text, clicks call `onMobileClose()`
- Desktop nav: Has `title` when collapsed
- Mobile nav: No `title`, clicks call `onMobileClose()`

**Suggested Fix:**
Extract a `SidebarContent` component accepting `collapsed` and `onItemClick` callbacks:
```tsx
interface SidebarContentProps {
  projects: [string, number][]
  tags: [string, number][]
  stats: { articles: number; tokens: number; cost: number }
  collapsed?: boolean
  onProjectClick?: (project: string) => void
  onTagClick?: (tag: string) => void
}

function SidebarContent({
  projects, tags, stats, collapsed = false,
  onProjectClick, onTagClick
}: SidebarContentProps) {
  return (
    <>
      {projects.length > 0 && (
        <div className="sidebar__section">
          {!collapsed && <p className="sidebar__section-heading">Projects</p>}
          <ul className="sidebar__list">
            {projects.map(([name, count]) => (
              <li key={name}>
                <button
                  className="sidebar__item-btn"
                  onClick={() => onProjectClick?.(name)}
                  type="button"
                  title={collapsed ? `${name} (${count})` : undefined}
                  aria-label={`Filter by project ${name}, ${count} articles`}
                >
                  <span className="sidebar__item-dot" aria-hidden="true" />
                  {!collapsed && (
                    <>
                      <span className="sidebar__item-label">{name}</span>
                      <span className="sidebar__item-count">{count}</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Similar for tags and stats... */}
    </>
  )
}
```

Then use in both desktop and mobile sidebars, parametrizing the `onMobileClose` callback.

---

#### Finding #4: Body Scroll Not Locked When Mobile Drawer Open
**Severity:** 🟡 Warning  
**File:** `src/App.tsx` (missing), or `src/components/Sidebar.tsx`  
**Impact:** UX degradation: content behind overlay is scrollable, creating visual confusion

**Issue:**
When mobile drawer opens, users can scroll the main content behind the overlay. This is a common mobile UI antipattern.

**Current behavior:**
```tsx
// Sidebar.tsx line 267–273: Overlay rendered
{mobileOpen && (
  <div
    className="sidebar__drawer-overlay"
    onClick={onMobileClose}
    aria-hidden="true"
  />
)}
```

The overlay **prevents clicks** from reaching content (good), but **does not prevent scrolling** (bad).

**Suggested Fix:**
Add body scroll lock in App.tsx:
```tsx
// App.tsx
useEffect(() => {
  if (mobileDrawerOpen) {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }
}, [mobileDrawerOpen])
```

Or use a library like `body-scroll-lock` for better browser compatibility.

---

#### Finding #5: No Focus Management When Mobile Drawer Opens
**Severity:** 🟡 Warning  
**File:** `src/App.tsx:65`, `src/components/Sidebar.tsx:267–283`  
**Impact:** Minor a11y gap; keyboard-only users must tab backwards to close button after drawer opens

**Issue:**
When `mobileOpen` changes to `true`, focus is not moved to the drawer. WCAG 2.1 recommends moving focus to a dialog/modal when it opens.

**Current:** Focus stays where it was (likely on hamburger button). User must tab multiple times to reach close button.

**Suggested Fix:**
Move focus into drawer on open:
```tsx
// Add to App.tsx or Sidebar.tsx
useEffect(() => {
  if (mobileOpen) {
    // Focus the first focusable element in drawer (close button)
    const closeBtn = document.querySelector('.sidebar__close-btn') as HTMLButtonElement
    closeBtn?.focus()
  }
}, [mobileOpen])
```

Or use a focus trap library like `focus-trap-react`.

---

### 🔵 LGTM (Looks Good To Merge – noted explicitly)

#### Finding #6: Z-Index Layering is Correct
**Status:** ✅ LGTM  
**File:** `src/index.css` lines 1477, 1733, 1836  

**Verified:**
- Header (`.nav`): `z-index: 100`
- Desktop sidebar (`.sidebar`): `z-index: 50` (below header ✓)
- Mobile overlay (`.sidebar__drawer-overlay`): `z-index: 149`
- Mobile drawer (`.sidebar-wrapper--mobile`): `z-index: 150` (above overlay ✓)

Stacking order is correct. Overlay sits between content (z-index 0–49) and drawer (150).

---

#### Finding #7: Collapse/Expand Transition Behavior Works Correctly
**Status:** ✅ LGTM  
**File:** `src/index.css` lines 1453, 1476; `src/components/Sidebar.tsx` lines 132–151

**Verified:**
- Wrapper and sidebar both transition width 240px ↔ 56px over 0.2s
- Fixed positioning on sidebar (line 1467) is relative to viewport, not wrapper—no overflow issues
- Text conditionally renders only when not collapsed (consistent UX)
- Icon remains visible when collapsed
- Both transitions synchronized (feels smooth)

LGTM on transitions.

---

#### Finding #8: localStorage Persistence is Correct
**Status:** ✅ LGTM  
**File:** `src/App.tsx` lines 15, 37–43, 55–63

**Verified:**
```tsx
const SIDEBAR_COLLAPSED_KEY = 'logex-sidebar-collapsed'

// Init
const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'  // ✓
  } catch {
    return false  // Fallback if localStorage unavailable
  }
})

// Toggle
const handleToggleCollapse = useCallback(() => {
  setSidebarCollapsed((prev) => {
    const next = !prev
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))  // ✓
    } catch { /* ignore */ }
    return next
  })
}, [])
```

- Key name matches acceptance criteria ✓
- Reads on mount with fallback ✓
- Writes atomically on toggle ✓
- Try-catch prevents crashes if localStorage unavailable ✓

LGTM.

---

#### Finding #9: Escape Key and Route-Change Drawer Close Work Correctly
**Status:** ✅ LGTM  
**File:** `src/App.tsx` lines 68–75, 77–80

**Verified:**
```tsx
// Escape handler
useEffect(() => {
  if (!mobileDrawerOpen) return
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setMobileDrawerOpen(false)  // ✓
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [mobileDrawerOpen])

// Route change handler
useEffect(() => {
  setMobileDrawerOpen(false)  // ✓
}, [route.path])
```

Both implemented correctly. Listener is cleaned up properly.

---

## Summary Table

| Finding | Severity | Type | Status | Fix Complexity |
|---------|----------|------|--------|----------------|
| #1: Touch targets < 44px | 🔴 Critical | UX/a11y | BLOCK | Low (CSS only) |
| #2: Nav links missing aria-label when collapsed | 🔴 Critical | a11y | BLOCK | Low (add aria-label) |
| #3: DRY violation (150+ lines duplicated JSX) | 🟡 Warning | Code Quality | FIX | Medium (extract component) |
| #4: Body scroll not locked on mobile drawer open | 🟡 Warning | UX | FIX | Low (add useEffect) |
| #5: No focus management on drawer open | 🟡 Warning | a11y | FIX | Low (add focus logic) |
| #6: Z-index layering | 🔵 LGTM | — | PASS | — |
| #7: Collapse/expand transitions | 🔵 LGTM | — | PASS | — |
| #8: localStorage persistence | 🔵 LGTM | — | PASS | — |
| #9: Escape & route-change drawer close | 🔵 LGTM | — | PASS | — |

---

## Recommendation

**ITERATE before merge.**

**Blockers (must fix):**
1. ✋ Increase touch target sizes to ≥44px on mobile
2. ✋ Add `aria-label` to nav links when collapsed

**High-priority improvements:**
3. Extract `SidebarContent` component to eliminate DRY violation
4. Lock body scroll when mobile drawer is open
5. Move focus to drawer on open

**Timeline:** All fixes are 1–2 hour scope. Touch targets + a11y labels = non-negotiable before any ship.

---

## Code Snippets for Quick Fix

### Fix #1: Touch Targets (index.css)
```css
@media (max-width: 768px) {
  .sidebar__link {
    padding: 12px 10px;
    min-height: 44px;
  }
  .sidebar__item-btn {
    padding: 12px 10px;
    min-height: 40px;
  }
  .sidebar__close-btn {
    width: 44px;
    height: 44px;
  }
}
```

### Fix #2: aria-label (Sidebar.tsx line 156)
```tsx
<a
  href={link.href}
  className={`sidebar__link${isActive(link.path) ? ' sidebar__link--active' : ''}`}
  aria-current={isActive(link.path) ? 'page' : undefined}
  aria-label={collapsed ? link.label : undefined}
  title={collapsed ? link.label : undefined}
>
```

### Fix #4: Body Scroll Lock (App.tsx, in component)
```tsx
useEffect(() => {
  if (mobileDrawerOpen) {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }
}, [mobileDrawerOpen])
```

---

**End of Review**
