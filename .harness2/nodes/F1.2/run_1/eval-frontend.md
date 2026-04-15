# F1.2 Review — Frontend Engineering

## Verdict: ITERATE

## Findings

---

🔴 [critical] Multi-line paragraphs are not merged — each line becomes its own `<p>`
File: src/components/MarkdownRenderer.tsx:208-210
Issue: The paragraph handler at line 208 emits a `<p>` for every single non-empty line that falls through to the default branch. In real Markdown, consecutive non-blank lines form a single paragraph. A two-sentence paragraph like:
```
This is sentence one.
This is sentence two.
```
renders as two separate `<p>` elements instead of one. Any real article content that wraps lines will be visually broken.
Fix: When entering the paragraph fallback, keep consuming lines until a blank line or a block-level token is encountered, then join them with a space and emit a single `<p>`.

---

🔴 [critical] Indented code block fires before nested list items
File: src/components/MarkdownRenderer.tsx:48
Issue: The indented code block check (`line.startsWith('    ')`) runs at line 48, **before** the list check at line 167. A 4-space-indented list item like `    - child` (which can appear after deep nesting is dedented and re-entered in `parseList`) will be swallowed as an indented code block instead of being treated as a list item. The list parser itself also creates such lines: when `parseList` collects `nestedLines` and passes them to a recursive call (line 264), it passes a fresh slice — but any *further* nesting beyond 3 levels gets pushed back through the top-level switch where the 4-space guard fires first.
Fix: Either reorder: check list markers before indented code, or tighten the indented code check to require that the line does **not** match a list marker after stripping leading whitespace.

---

🔴 [critical] Setext h2 cannot be disabled — bare `---` HR after text becomes `<h2>`
File: src/components/MarkdownRenderer.tsx:82-89
Issue: Any non-empty text line immediately followed by a `---` (three or more dashes, nothing else) is always rendered as `<h2>`. There is no escape hatch. Legitimate HR usage `text\n---` is impossible — it will always be hijacked as a setext heading. Worse, if the user writes:
```
My sentence ends here.
---
```
intending an HR, they get an h2 instead. The comment at line 83 says "disambiguate" but the code does **not** actually disambiguate — it unconditionally promotes to h2.
Fix: Per CommonMark spec, a setext underline requires that the preceding text line is itself not a blank line, not a list marker, not a block quote marker, etc. The simplest safe disambiguation: also require the text line not to match `/^[-*_]{3,}\s*$/` (i.e., the text line itself is not an HR). Currently the code only checks `!line.startsWith('#')` (line 71).

---

🔴 [critical] Table detection false-positive on any line containing a single `|`
File: src/components/MarkdownRenderer.tsx:134
Issue: `line.includes('|')` is the entire detection gate. A line like `Use a | b syntax for pipes` followed by any separator-looking line (e.g., the next `---` HR, or a line matching `/^\|?[\s|:-]+\|/`) will be mis-parsed as a table header. The lookahead regex `/^\|?[\s|:-]+\|/` is quite broad and matches lines like `| - |` (a single-cell table separator) even after normal prose.
Fix: Require at least two `|` characters in the header line: `(line.match(/\|/g) ?? []).length >= 2` or check that `parseTableRow(line).length >= 2` before committing to the table branch.

---

🟡 [moderate] Unclosed fenced code block consumes the rest of the document silently
File: src/components/MarkdownRenderer.tsx:34-37
Issue: The inner `while` loop at line 34 terminates when `i >= lines.length` (EOF) — the guard is correct — but then line 38 does `i++` unconditionally, making `i = lines.length + 1`. The outer `while (i < lines.length)` at line 26 will then immediately exit, silently dropping everything from the opening fence to EOF into the code block with no user-visible error. This means an accidentally unclosed ` ``` ` in a long article makes the **entire remaining document** disappear.
Fix: After the inner loop ends, check `if (i < lines.length)` before the closing `i++`. Emit a console warning (or a visible error element) when the block is unclosed.

---

🟡 [moderate] `safeHref` blocks `mailto:` and `tel:` links
File: src/components/MarkdownRenderer.tsx:11
Issue: Only `http:` and `https:` pass the allowlist. `mailto:author@example.com` and `tel:+1234567890` are valid, common, and non-dangerous link schemes. They currently silently resolve to `href="#"`, breaking all email and phone links without any indication to the user.
Fix: Extend the allowlist regex: `/^(https?|mailto|tel):$/`.

---

🟡 [moderate] `parseList` key collision: `keyBase` is used for the outer list AND passed down unchanged
File: src/components/MarkdownRenderer.tsx:264 + 279
Issue: At line 264, nested `parseList` is called with `itemKey * 100` as `keyBase`. The outer list element then uses the **same** `keyBase` (the value from the caller, line 279). If two sibling top-level lists are rendered, the caller's `key++` is consumed once (line 168), but nested list roots use derived keys (`itemKey * 100`) that are local to this call. This is actually fine at runtime because keys only need to be unique among siblings — but the key passed into `React.createElement(Tag, { key: keyBase }, ...)` at line 279 is the *caller's* key from the outer `elements` array, not a per-component key. The real issue: when there are multiple nested lists under different parents, `itemKey * 100` will collide (e.g., first item of list A and first item of list B both produce key `0`). Since they are siblings inside different `<li>` elements this doesn't cause a React warning, but it is fragile.
Fix: Thread a monotonically-increasing counter through instead of deriving ad-hoc keys from `itemKey * 100`.

---

🟡 [moderate] `renderInline` does not recurse — bold/italic nesting is not handled
File: src/components/MarkdownRenderer.tsx:285-329
Issue: `**bold with *italic* inside**` will not render correctly. The regex at line 289 matches `**...**` and `*...*` separately, but captured group `match[2]` (the bold inner text) is returned as a raw string to `<strong>`, not passed through `renderInline` again. So `**bold _and italic_**` renders as the literal text `bold _and italic_` in bold, without the nested italic.
Fix: After capturing the inner text for bold/italic/strikethrough, recurse: `renderInline(match[2])` instead of `match[2]`. This requires making the children accept `React.ReactNode` instead of `string`.

---

🟡 [moderate] `blockquote` shadow variable: inner `lines` param shadows outer `lines`
File: src/components/MarkdownRenderer.tsx:125
Issue: `paragraphs.map((lines, j) => ...)` — the map callback parameter is named `lines`, which shadows the outer `const lines = content.split('\n')` at line 21. TypeScript won't catch this (different scopes), but it is a maintenance hazard: any future code inside that callback that accidentally references `lines` will silently use paragraph lines instead of the document lines.
Fix: Rename the map parameter: `paragraphs.map((paraLines, j) => ...)`.

---

🔵 [minor] ATX heading regex does not support h5/h6
File: src/components/MarkdownRenderer.tsx:94
Issue: `/^(#{1,4})\s+(.+)$/` caps at 4 `#`. Standard Markdown has h5 and h6. Existing `#####` headings in real articles will fall through to the paragraph renderer and render as `##### some text`.
Fix: Change `{1,4}` to `{1,6}` and extend the type cast accordingly.

---

🔵 [minor] Table rows with mismatched column count render ragged `<tr>`s
File: src/components/MarkdownRenderer.tsx:153-158
Issue: If a body row has fewer columns than the header (e.g., author forgot a cell), it renders a `<tr>` with fewer `<td>`s than the header `<th>` count. The table will display incorrectly, and screen readers may misinterpret column associations.
Fix: Normalize each `row` to `headerCells.length` entries by padding with empty strings: `const padded = [...row, ...Array(Math.max(0, headerCells.length - row.length)).fill('')]`.

---

🔵 [minor] `renderInline` returns `parts[0]` for single-element arrays — may return a string
File: src/components/MarkdownRenderer.tsx:328
Issue: `return parts.length === 1 ? parts[0] : parts` — when the entire text has no inline markup, `parts[0]` is a plain `string`, not a `React.ReactNode[]`. This is valid for React (strings are renderable), but the return type annotation could confuse callers expecting always-an-array and leads to inconsistent downstream behavior if anyone calls `.map()` on the result.
Fix: This is fine as-is but document the return type explicitly as `string | React.ReactNode[]` to set expectations.

---

## Missing Test Coverage

The test suite covers the happy paths adequately but is missing these high-value regression cases:

1. **Multi-line paragraph** — no test that two consecutive non-blank lines merge into one `<p>` (would catch the 🔴 bug above).
2. **Unclosed fenced code block** — no test; would catch the silent document truncation.
3. **`mailto:` link** — no test for non-http safe schemes.
4. **Setext h2 vs. HR ambiguity** — no test for `text\n---` intended as HR.
5. **Table with pipe in cell content** — e.g., `| a \| b | c |` — no test.
6. **Table with no body rows** (header + separator only) — no test.
7. **3-level nested list** — tests only cover 2-level nesting.
8. **Bold containing italic** (`**text *nested* text**`) — no test for inline nesting.
9. **`data:` URI blocked by safeHref** — only `javascript:` is tested.

---

## Summary

The component has **four critical functional bugs**: multi-line paragraphs are never merged (every wrapped line is its own `<p>`), the 4-space indented code block check fires before list detection breaking deeply-nested lists, any line containing a `|` can false-positive into a table, and `mailto:`/`tel:` links are silently broken. The setext h2 disambiguation claim in the comments is aspirational — the code does not actually disambiguate. The test suite covers the positive cases for each feature but has near-zero negative/edge-case coverage, meaning all the above bugs pass the current test run.
