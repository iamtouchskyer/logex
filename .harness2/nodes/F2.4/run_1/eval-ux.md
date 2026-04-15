# Share UI UX Review: F2.4
**Reviewer:** UX + Accessibility
**Date:** 2026-04-16

## Verdict: ITERATE

Overall quality is high — the code shows deliberate a11y intent (focus traps, role="alert", aria-labels, focus restoration). Most issues are minor but two warrant immediate attention: the no-confirmation delete and the absent `aria-required` hint on password minimum length.

---

## 🔴 CRITICAL

### 1. Delete is instant and irreversible with no confirmation — `SharesManager.tsx:121-144`
`handleDelete` fires immediately on click. There is no `window.confirm`, no undo, no soft-delete, no optimistic-rollback. If the user fat-fingers the trash button, the share link is gone. Share creation requires another trip through the modal + new password.

**Why it's CRITICAL:** Shares are not cheap to recreate (new URL, re-share with recipient). Irreversible destructive action without any confirmation is a cardinal UX sin.

**Fix:** Either add a `window.confirm('Delete this share link?')` guard before `setDeletingId` (acceptable for internal tools), or render an inline "Are you sure? [Confirm] [Cancel]" micro-state per row. `alert()` is already used on error at line 137 — consistency favors a confirm dialog here.

---

## 🟡 WARNINGS

### 2. Password minimum requirement not wired to `aria-describedby` — `ArticleReader.tsx:217-233`
The label reads `Password (min 4 chars)` and the span carrying "(min 4 chars)" has `aria-hidden="true"` (line 219). Screen readers won't read that hint. The input has no `aria-describedby` pointing to a visible/hidden hint node.

**Fix:** Remove `aria-hidden` from the hint span (or move it outside the `<label>`) and add `aria-describedby="share-pw-hint"` on the input.

### 3. Clipboard copy failure is silently swallowed — `ArticleReader.tsx:120-126`
```ts
} catch { /* ignore */ }
```
If `navigator.clipboard.writeText` fails (non-HTTPS, permission denied), the user gets no feedback — the button just stays "Copy". `SharesManager.tsx` has a proper textarea fallback (lines 64-80), but `ShareModal` does not.

**Fix:** Align `ShareModal.handleCopy` with `CopyButton`'s fallback approach, or at minimum show a transient error ("Copy failed — select text manually").

### 4. `ShareModal` backdrop lacks `aria-hidden` coordination with background content — `ArticleReader.tsx:131-136`
The backdrop div has `aria-hidden="false"` (explicit but redundant). The larger problem: the `<article>` behind the modal is not marked `aria-hidden="true"` when the modal is open. Screen readers can still navigate into the background content while a modal is active.

**Fix:** When `shareOpen === true`, add `aria-hidden="true"` to the main `<article>` element (or the app shell container), and remove it on close.

### 5. `wrong_password` → no focus announcement race condition — `SharePage.tsx:25-28`
Focus goes to the input on `wrong_password` state, and `role="alert"` on the error paragraph fires separately. This is usually fine, but the alert is rendered *conditionally inside* the same re-render that moves focus. Some screen readers (JAWS) may announce the newly focused input label and miss the alert text. The standard pattern is to keep the alert element in the DOM but toggle its content from empty string to the message.

**Fix:** Render `<p id="share-pw-error" role="alert" className="...">` always, set its text content conditionally. The alert fires the announcement; focus going to the input is secondary.

### 6. `SharesManager` table is horizontally scrollable on mobile — implicit, not explicit — `SharesManager.tsx:203`
The table wrapper has `role="region" aria-label="Share links list"` but no `tabindex="0"`. A keyboard/mouse user on a narrow viewport cannot scroll the overflow region without a scrollable focusable container.

**Fix:** Add `tabindex="0"` to `.shares-manager__table-wrapper` so keyboard users can scroll it.

### 7. Delete button loading state — spinner shown but no live region — `SharesManager.tsx:254-258`
When deleting, the row shows a spinner but there's no `aria-live` update to tell screen readers something is happening. The button becomes `disabled` (which AT will announce) but "Delete share link for X" label goes silent — there's no "Deleting…" state label.

**Fix:** Change `aria-label` dynamically: `deletingId === share.id ? \`Deleting share link for ${share.slug}…\` : \`Delete share link for ${share.slug}\``.

---

## 🔵 LGTM

- **Focus trap in ShareModal** — correct implementation: Escape closes, Tab wraps, `firstFocusRef` auto-focuses password input on open (`ArticleReader.tsx:51-80`). ✅

- **Focus restoration on modal close** — `handleCloseShare` returns focus to the trigger button via `setTimeout(...focus(), 0)` (`ArticleReader.tsx:297-301`). Correct and deliberate. ✅

- **Body scroll lock** — applied on modal open, restored on cleanup (`ArticleReader.tsx:83-87`). ✅

- **`aria-haspopup="dialog"` + `aria-expanded`** on the Share button — correctly signals dialog intent to AT (`ArticleReader.tsx:365-366`). ✅

- **`role="alert"` on all error/status terminal states** — SharePage covers `wrong_password`, `locked`, `expired`, `not_found`, `error` — all have `role="alert"` (`SharePage.tsx:125,165,172,179,185`). ✅

- **Password gate focus management** — `useEffect` re-focuses the input on both `prompt` and `wrong_password` states (`SharePage.tsx:24-28`). ✅

- **Submit button disabled until `password.length >= 4`** — prevents pointless API calls and gives instant visual feedback (`ArticleReader.tsx:265`). ✅

- **Loading spinners on all async actions** — ShareModal "Creating…", SharePage "Verifying…", delete row spinner — all present. ✅

- **Empty state copy** — clear, actionable: "Open any article and click the **Share** button to create a link." (`SharesManager.tsx:199`). ✅

- **Error recovery paths** — all terminal error states have either a Retry button or clear instructions. ✅

- **`autoComplete` attributes correct** — `new-password` on create, `current-password` on gate input. ✅

- **`<time>` elements with `dateTime`** — both Created and Expires columns use proper `<time dateTime={...}>` (`SharesManager.tsx:233,236`). ✅

- **SVG icons all `aria-hidden="true"`** — none will pollute AT announcements. ✅

- **Table column headers with `scope="col"`** — accessible table structure, SR-only "Actions" header for the icon-only column (`SharesManager.tsx:206-213`). ✅

---

## Summary

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| 1 | 🔴 | SharesManager:121 | No delete confirmation for irreversible action |
| 2 | 🟡 | ArticleReader:219 | Password hint hidden from screen readers |
| 3 | 🟡 | ArticleReader:120 | Clipboard failure silently ignored in ShareModal |
| 4 | 🟡 | ArticleReader:131 | Background content not `aria-hidden` during modal |
| 5 | 🟡 | SharePage:25 | Alert/focus race on wrong_password re-render |
| 6 | 🟡 | SharesManager:203 | Table scroll region not keyboard-focusable |
| 7 | 🟡 | SharesManager:254 | Delete spinner has no accessible label update |
