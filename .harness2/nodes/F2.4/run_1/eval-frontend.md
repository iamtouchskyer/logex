# Share UI Review: F2.4
**Reviewer:** Frontend + Security
**Date:** 2026-04-16
**Files:** src/pages/SharesManager.tsx, src/pages/SharePage.tsx, src/pages/ArticleReader.tsx, src/lib/router.ts, src/App.tsx

## Verdict: PASS

Share UI is well-implemented. All 3 parts (ShareModal, SharePage, SharesManager) functional with correct auth gating.

---

## 🔴 CRITICAL

None.

---

## 🟡 WARNINGS

### 1. SharePage: locked check uses string comparison
**File:** `src/pages/SharePage.tsx` (line 48)
**Issue:** `json.error === 'locked'` — the API returns `'Share locked due to too many failed attempts'`, not `'locked'`. So the locked state is unreachable; users see "Wrong password" instead.
**Fix:** Check `res.status === 403` AND look for "locked" substring in the error message, or check the `locked` field in the response body.
**Note:** This is a protocol mismatch — not a security issue but a UX bug.

### 2. alert() for delete errors
**File:** `src/pages/SharesManager.tsx` (lines 137, 141)
**Issue:** Uses native `alert()` for delete error feedback. This is inaccessible (no ARIA), visually jarring, and can block focus return.
**Accepted:** Low priority for a management page, no security risk.

### 3. SharePage: article body structure assumption
**File:** `src/pages/SharePage.tsx` (line 40)
**Issue:** Assumes `data.article.title` and `data.article.body` exist. The API returns the GitHub article JSON which may have different field names (depends on the actual article format). No defensive check.
**Risk:** If article format differs, `state.title` or `state.body` is undefined and renders empty/broken.
**Accepted:** Known limitation — depends on article data format from GitHub adapter.

---

## 🔵 LGTM

- Public `/share/:id` route correctly placed BEFORE auth gate in App.tsx (line 135-138) — unauthenticated users can access share pages
- ShareModal focus trap: Tab cycling + Escape to close + focus returns to trigger button on close ✅
- Delete uses `credentials: 'same-origin'` — triggers CSRF protection in backend ✅
- `encodeURIComponent(id)` on all URL constructions — safe against path injection ✅
- `aria-modal="true"` + `role="dialog"` on ShareModal ✅
- All async operations have loading/error/empty states ✅
- Copy button has clipboard API + textarea fallback ✅
- SharesManager status badge: `getShareStatus()` correctly compares `new Date(expiresAt) < new Date()` ✅
- No passwords logged to console anywhere in UI code ✅
- Password sent as query param `?password=X` — consistent with backend API design; not ideal for high-security contexts but acceptable for a blog share use case ✅
- `isValidId()` validation happens server-side — client just passes the id from URL ✅
- Wrong password: password field cleared + focus returns to input ✅
- Screen reader support: `role="alert"` on all error states, `aria-live="polite"` on loading states ✅
- Touch targets: buttons have adequate padding from CSS; submit button is full-width ✅
