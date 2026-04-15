# F3.1 — Left Sidebar Navigation — Build Report

## Summary

Implemented a full left-sidebar navigation layout for the Logex webapp. Replaced the top-nav-only layout with a two-column sidebar + content layout, while keeping the top header bar for user avatar, logout, and theme toggle.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/router.ts` | Added `#/settings/shares` route |
| `src/components/Sidebar.tsx` | **New** — full sidebar component |
| `src/pages/SharesPlaceholder.tsx` | **New** — placeholder page |
| `src/App.tsx` | Refactored layout: two-column, hamburger button, mobile drawer state |
| `src/index.css` | Added all sidebar CSS classes |

## Features Implemented

### Sidebar Contents
- **Logo/brand** — "Logex" text + layers icon, links to `#/`
- **Nav links** — Articles (grid icon), Timeline (clock icon), Shares (share icon) with active state
- **Projects section** — sorted by article count descending, clickable filter buttons
- **Tags section** — top 10 tags by count, `#`-prefixed, clickable
- **Stats section** — articles count, tokens (with `k` suffix ≥1000), cost estimate with `$`

### Collapse Behavior (desktop)
- Starts expanded at 240px
- Chevron toggle button collapses to 56px icon-only
- State persisted in `localStorage` key `logex-sidebar-collapsed`
- CSS `transition: width 0.2s ease`

### Mobile Behavior (≤768px)
- Sidebar hidden by default
- Hamburger button in top bar (36×36px, same style as theme-toggle)
- Slide-in drawer overlay (translateX transition)
- Close on: outside click (overlay), Escape key, X button, nav link click

### Route
- `#/settings/shares` → `<SharesPlaceholder />` ("Share links — coming soon")

## Verification

### TypeScript
```
npx tsc --noEmit → 0 errors
```

### Tests
```
npx vitest run → 72/72 passed (6 test files)
```

### Screenshots
- `sidebar-desktop-expanded.png` — 1280×800 desktop, sidebar expanded, 5 mock articles loaded
- `sidebar-mobile-closed.png` — 375×812 mobile, drawer closed, articles visible in content area

## Visual Notes

- Desktop: sidebar at 240px on left, articles list fills remaining width. Projects (session-brain ×3, logex ×2), Tags (architecture, graph, memory, react, ui, sidebar…), Stats (5 articles, 42.4k tokens, $0.42)
- Mobile: top bar with hamburger + Logex logo + user/logout/theme. Content area shows articles directly. Drawer slides in from left on hamburger tap.
- Theme: both dark/light mode supported via CSS variables (screenshots captured in light mode, dark mode uses same class structure)

## CSS Classes Added

`.sidebar`, `.sidebar--collapsed`, `.sidebar__header`, `.sidebar__brand`, `.sidebar__toggle`, `.sidebar__nav`, `.sidebar__link`, `.sidebar__link--active`, `.sidebar__body`, `.sidebar__section`, `.sidebar__section-heading`, `.sidebar__list`, `.sidebar__item-btn`, `.sidebar__item-dot`, `.sidebar__item-hash`, `.sidebar__item-label`, `.sidebar__item-count`, `.sidebar__stats`, `.sidebar__stat-chip`, `.sidebar__stat-chip--cost`, `.sidebar__stat-value`, `.sidebar__stat-label`, `.sidebar__drawer-overlay`, `.sidebar__mobile-close`, `.sidebar__close-btn`, `.sidebar-wrapper--desktop`, `.sidebar-wrapper--mobile`, `.sidebar-wrapper--mobile-open`, `.app__body`, `.app__content-area`, `.nav__hamburger`, `.nav__logo--mobile`
