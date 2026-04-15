# F1.4 Re-Review — MarkdownRenderer Post-Fix Verification

## Verdict: ITERATE

---

## Fix Verification

### 1. Multi-line paragraph merge: ✅
**Code (lines 221–247):**
```tsx
// Bug 1 fix: Multi-line paragraph — accumulate consecutive non-empty, non-special lines
// and emit ONE <p> with them joined
const paraLines: string[] = []
while (
  i < lines.length &&
  lines[i].trim() !== '' &&
  !lines[i].startsWith('```') &&
  !lines[i].startsWith('#') &&
  !lines[i].startsWith('> ') &&
  lines[i] !== '>' &&
  !lines[i].match(/^[-*]\s/) &&
  !lines[i].match(/^\d+\.\s/) &&
  !lines[i].match(/^---+$/) &&
  !lines[i].match(/^\*\*\*+$/) &&
  !lines[i].match(/^!\[([^\]]*)\]\(([^)]+)\)$/) &&
  // Don't absorb setext heading underlines
  !lines[i].match(/^={3,}\s*$/) &&
  !lines[i].match(/^-{3,}\s*$/)
) {
  paraLines.push(lines[i])
  i++
}
if (paraLines.length > 0) {
  elements.push(<p key={key++} className="md-p">{renderInline(paraLines.join('\n'))}</p>)
}
```
Consecutive non-empty, non-special lines are collected into `paraLines[]` and emitted as a single `<p>`. Guard conditions are comprehensive. Test at line 198–215 covers both single-`<p>` merge and blank-line paragraph separation.

---

### 2. Indented code block ordering: ✅
**Code (lines 156–192):**
```
// Unordered list  (line 158) — BEFORE indented code check
if (line.match(/^[-*]\s/)) { ... }   // line 158

// Ordered list  (line 166) — BEFORE indented code check
if (line.match(/^\d+\.\s/)) { ... }  // line 166

// Indented code block (line 175) — AFTER both list detectors
if (line.startsWith('    ') || line.startsWith('\t')) { ... }
```
Comment on line 174 explicitly confirms: `// Bug 2 fix: moved AFTER list detectors`. Order is: `ul check → ol check → indented code`. ✅

---

### 3. Setext h2 / HR disambiguation: ✅
**Setext guard (lines 54–76):**
```tsx
if (
  line.trim() !== '' &&        // ← current line must be non-empty text
  !line.startsWith('#') &&
  !line.match(/^[-*]\s/) &&
  !line.match(/^\d+\.\s/) &&
  i + 1 < lines.length
) {
  if (/^-{3,}\s*$/.test(nextLine)) { /* emit h2, i += 2 */ }
}
```
**HR detector (lines 196–200):**
```tsx
if (line.match(/^---+$/) || line.match(/^\*\*\*+$/)) {
  elements.push(<hr ... />)
}
```
- Bare `---` (line is the dashes itself, not a look-ahead target): `line.trim() !== ''` is true BUT the setext block checks `nextLine` — if the *current* line is `---`, it falls through to the HR detector correctly, because the setext guard only promotes `nextLine` to h2, not `line` itself.
- `text\n---`: `line = "text"` → non-empty, non-special → looks ahead → `nextLine = "---"` matches `/^-{3,}\s*$/` → emits h2. ✅
- `\n---\n`: empty line is consumed by "Empty line" handler (line 216); `---` becomes the new `line`, which is non-empty but after empty predecessors — setext block requires `line.trim() !== ''` for the *text* line, so `---` would be `line` here and `line.match(/^-{3,}\s*$/)` in the para-loop guard stops it being absorbed. The HR detector at line 196 fires. ✅

Both cases handled correctly.

---

### 4. Table false positive: ✅
**Code (lines 118–124):**
```tsx
// Bug 4 fix: Table — require at least 2 pipes OR line starts/ends with pipe
// to avoid false positives on sentences like "choose A | B"
const hasSufficientPipes =
  (line.match(/\|/g) ?? []).length >= 2 ||
  line.trimStart().startsWith('|') ||
  line.trimEnd().endsWith('|')
if (hasSufficientPipes && i + 1 < lines.length && /^\|?[\s|:-]+\|/.test(lines[i + 1])) {
```
`"choose A | B for this"` → one pipe, doesn't start/end with `|` → `hasSufficientPipes = false` → no table. Test at line 259–267 confirms. ✅

---

### 5. Unclosed fence guard: ✅
**Code (lines 38–41):**
```tsx
// Bug 5 fix: only skip closing ``` if we actually found it
if (i < lines.length) {
  i++ // skip closing ```
}
```
The inner `while` exits either when `lines[i].startsWith('```')` (closing fence found) or when `i >= lines.length` (EOF). The guard `if (i < lines.length)` only advances past the closing fence if it was actually found, preventing an off-by-one into phantom index. ✅

---

### 6. safeHref invariant comment: ✅
**Code (lines 327–333):**
```tsx
/**
 * Render inline markdown: bold, italic, strikethrough, inline code, links.
 *
 * NOTE: inline images (![alt](url)) are intentionally NOT supported here —
 * block-level images (in MarkdownRenderer body loop) use safeHref().
 * If you add inline image support, you MUST call safeHref() on the URL.
 */
function renderInline(text: string): React.ReactNode {
```
Comment is present and explains the invariant precisely. ✅

---

## New Issues Found

### 🔴 NEW — Paragraph accumulator has a setext h2 blind spot (paragraph merger absorbs the text line before it can trigger setext)

**Location:** lines 224–242 vs lines 54–76

The paragraph `while` loop (Bug 1 fix) guards against `lines[i].match(/^-{3,}\s*$/)` to avoid absorbing underline rows, but it does **not** guard against absorbing a *text* line whose **next** line is a setext underline.

Scenario:
```
some content
My Heading
----------
```
When `i` points to `"My Heading"`, the para loop starts collecting because `"My Heading"` passes all guards. It then collects `"My Heading"` and advances `i`. Now `i` points to `"----------"` which **does** match `/^-{3,}\s*$/` and exits the loop. Result: `"My Heading"` is emitted inside the existing `<p>` as part of `paraLines`, and `"----------"` is then processed separately — it hits the HR detector (line 196) and renders `<hr>` instead of the intended `<h2>`.

**Root cause:** The setext look-ahead at lines 54–76 only fires if nothing *before* it in the loop consumed the current line. But the paragraph accumulator starts immediately after the empty-line check, and it eagerly grabs lines without checking if the *next* line is a setext underline.

**Fix needed:** Add a look-ahead guard in the para `while` condition:
```tsx
// Don't absorb a line whose next line is a setext underline
!(i + 1 < lines.length && /^[=-]{3,}\s*$/.test(lines[i + 1]))
```

### 🟡 MINOR — Indented code block absorbs blank lines between non-indented code lines

**Location:** lines 177–181
```tsx
while (i < lines.length && (lines[i].startsWith('    ') || lines[i].startsWith('\t') || lines[i].trim() === '')) {
```
A blank line followed by non-indented content still gets pulled into the code block as a trailing blank line (then trimmed). However, a blank line followed by *another* indented block is fine. The real issue: a blank line between two unrelated indented blocks merges them into one `<pre>`. Low-impact for the declared feature scope, but worth noting.

### 🟡 MINOR — Table body row detection uses `includes('|')` (line 129)

```tsx
while (i < lines.length && lines[i].includes('|')) {
```
Any line containing a pipe character continues being consumed as a table body row, including lines like `- list | item`. This is the same class of single-pipe false positive that Bug 4 fixed for the header, but left unaddressed for body rows. Low severity as tables in practice always have structured rows, but inconsistent with the Bug 4 fix intent.

---

## Summary

All 6 critical fixes from F1.2 are correctly implemented and confirmed. The unclosed fence guard (Bug 5), table false positive (Bug 4), indented code ordering (Bug 2), setext/HR disambiguation (Bug 3), multi-line paragraph merge (Bug 1), and safeHref invariant comment (Bug 6) are all present and logically sound.

However, **one new 🔴 regression** was introduced: the paragraph accumulator (Bug 1 fix) does not include a setext look-ahead guard, meaning a text line immediately preceding a setext `---` underline inside a multi-paragraph block will be swallowed into the current `<p>` and the underline will render as `<hr>` instead of `<h2>`. This is a correctness regression on setext headings that appear mid-document after other paragraph content.

**Recommendation: ITERATE** — fix the setext look-ahead guard in the paragraph accumulator before marking this component done. The two 🟡 issues can be addressed in a follow-up pass.
