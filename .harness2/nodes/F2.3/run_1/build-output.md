# F2.3 — Share UI Build Output

## Summary
Implemented the complete Share UI across 3 parts: share button + modal on ArticleReader, public `/share/:id` route, and SharesManager settings page.

## Part A: Share Button + Modal (ArticleReader)

**File:** `src/pages/ArticleReader.tsx`

- Added `useAuth()` hook inside ArticleReader to detect logged-in user
- Share button appears in `reader__nav` only when `user != null`
- Button has `aria-haspopup="dialog"` and `aria-expanded` state
- Focus returns to share button on modal close

**ShareModal component** (inline in ArticleReader.tsx):
- Password field (min 4 chars, `minLength` + `required`)
- Expiry in days (default 30, range 1–365 with clamping)
- `POST /api/share { slug, password, expiresInDays }` on submit
- Success state: shows generated URL with copy button (clipboard API)
- Error state: inline error message with `role="alert"`
- Focus trap: Tab cycles within modal, Escape closes it
- Body scroll locked while open
- Backdrop click closes modal
- Returns focus to trigger button on close

## Part B: Public Share Page

**File:** `src/pages/SharePage.tsx` (new)

- No auth required — works for unauthenticated users
- Password gate: input → `GET /api/share/:id?password=X`
- Handles all error states:
  - Wrong password (401/403 without `locked`) → "Wrong password" + retry
  - Locked (403 with `error: "locked"`) → "Too many attempts, share locked"
  - Expired (410) → "Share expired"
  - Not found (404) → "Share not found"
  - Network error → generic error with retry button
- Success state: renders article title + markdown body via `MarkdownRenderer`
- Sticky header with Logex branding + "Shared article" badge
- Focus moves to password input on mount and after wrong-password retry

**Router:** `src/lib/router.ts`
- Added `/share/:id` pattern match: `hash.match(/^\/share\/([^/]+)$/)`

**App.tsx:**
- `/share/:id` intercepted BEFORE auth gate (renders even when `user === null`)
- Renders `<SharePage id={route.params.id} />` without sidebar/nav chrome

## Part C: SharesManager

**File:** `src/pages/SharesManager.tsx` (new, replaces SharesPlaceholder)

- On mount: `GET /api/share` → lists user's shares
- Table columns: Article slug (link), Share URL (copy button), Created, Expires, Status
- Status badge: active (green) / expired (gray) / locked (red)
- Delete button per row: `DELETE /api/share/:id`, optimistic removal from list
- Loading spinner state
- Error state with retry button
- Empty state with instructions to use the Share button
- Mobile: hides Created/Expires columns on narrow screens

## CSS

**File:** `src/index.css`

New classes added:
- `.reader__nav` — updated to flex layout for back + share button alignment
- `.reader__share-btn` — pill-style button with accent hover
- `.share-modal__*` — full modal system (backdrop, content, form, success, copy)
- `.share-page__*` — public gate card + article view
- `.shares-manager__*` — table, status badges, copy/delete buttons

All interactive elements meet 44px touch target minimum. WCAG AA color contrast maintained via existing CSS variables.

## Verification

- `npx tsc --noEmit`: 0 errors
- `vitest run`: 107/107 tests pass
- `playwright test`: 13/13 E2E tests pass
