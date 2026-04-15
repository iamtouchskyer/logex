# F1.2 Review — Security + Testing

## Verdict: ITERATE

## Findings

---

### XSS Safety

🟢 **safeHref() correctly blocks all dangerous schemes**
File: `src/components/MarkdownRenderer.tsx:8-17`
`safeHref()` uses `new URL()` to parse then checks `u.protocol` against `/^https?:$/`. This correctly blocks:
- `javascript:alert(1)` → protocol is `javascript:`, fails regex → returns `#`
- `data:text/html,...` → protocol is `data:`, fails regex → returns `#`
- `vbscript:foo` → protocol is `vbscript:`, fails regex → returns `#`

The catch branch allows relative paths only when no `:` is present, which prevents `javascript:` from slipping through as a "relative path". No bypass found.

🟢 **No `dangerouslySetInnerHTML` usage anywhere in the file.**
All content is assembled as React elements. Table cells go through `renderInline()` → React elements, not raw HTML. `<script>` in a table cell would be rendered as escaped text. No raw HTML injection path exists.

🟢 **Image `src` goes through `safeHref()`** — line 194. Block-level images are safe.

🔴 **[critical] Inline images inside link text / bold / italic bypass safeHref entirely**
File: `src/components/MarkdownRenderer.tsx:289`
Issue: `renderInline()` handles `[text](url)` links (link URL → `safeHref`) but the regex does **not** handle inline image syntax `![alt](url)`. If a user writes `![x](javascript:alert(1))` inline (inside a paragraph, blockquote, table cell, list item, or heading), it falls through to the raw-text path — the line **won't match the block-level image regex at line 190** because that regex requires the image to occupy the entire line (`^...$`). So inline `![x](javascript:...)` is silently rendered as literal text — which is actually safe by accident (the URL never becomes an `src`). **However**, consider: if a future contributor adds inline image support to the regex at line 289, the `safeHref` call might be forgotten. Document this invariant explicitly, or add inline image support with `safeHref` now so the gap cannot be accidentally reopened.
Fix: Either add `!\[([^\]]*)\]\(([^)]+)\)` to the `renderInline` regex with explicit `safeHref` wrapping, or add a comment at line 289 explicitly noting "inline images intentionally not supported — block-level only, see line 190."

---

### Infinite Loop Risk

🔴 **[critical] Unclosed fenced code block causes correct termination but silently swallows the rest of the document**
File: `src/components/MarkdownRenderer.tsx:34-37`
Issue: The inner `while` at line 34 terminates on `i < lines.length` — so an unclosed ` ``` ` does NOT infinite-loop; it exhausts the array and stops. BUT `i` ends at `lines.length`, and then line 38 does `i++`, pushing `i` to `lines.length + 1`. The outer `while (i < lines.length)` at line 26 still terminates correctly (the condition is checked before the body). **No infinite loop**, but all content after the unclosed fence is silently consumed into the code block with zero warning. This is a correctness bug, not a loop bug.
Fix: After the inner while, if `i >= lines.length` (fence was never closed), either emit a warning or treat the opening ` ``` ` as a paragraph. At minimum, add a test covering this case.

🟢 **Setext heading look-ahead is safe.**
File: `src/components/MarkdownRenderer.tsx:72`
The guard `i + 1 < lines.length` prevents out-of-bounds. Single-line input: `lines.length === 1`, `i = 0`, `i + 1 = 1` which is NOT `< 1` → condition is false → falls through. No look-ahead attempt. No loop risk.

🟢 **Table with only a header row and no separator.**
File: `src/components/MarkdownRenderer.tsx:134`
The table detection at line 134 requires BOTH `line.includes('|')` AND `i + 1 < lines.length && /^\|?[\s|:-]+\|/.test(lines[i + 1])`. A lone header row with no separator does not match the second condition → falls through to paragraph rendering. No loop, no crash.

🟡 **[moderate] Table body consumption loop has no `|` escape hatch for intentional non-table `|` lines**
File: `src/components/MarkdownRenderer.tsx:139`
Issue: `while (i < lines.length && lines[i].includes('|'))` — any line containing a pipe character after the separator is unconditionally consumed as a table body row, even if it's structurally unrelated (e.g., a blockquote line `> a | b`, or an HR-like `|---|`). This can silently eat subsequent content into the wrong block.
Fix: Tighten the body row condition to require at least two cells (i.e., the line must contain two or more `|` characters), matching the structure of a real row.

---

### Test Coverage Gaps

🟡 **[moderate] No test for `javascript:` in image src**
File: `src/lib/__tests__/markdown.test.ts`
Issue: `safeHref()` is tested for links (line 186-192) but not for the block-level image path at `MarkdownRenderer.tsx:194`. A future refactor could accidentally remove the `safeHref()` call on `imgMatch[2]` and no test would catch it.
Fix: Add:
```ts
it('safeHref blocks javascript: in image src', () => {
  const html = md('![x](javascript:alert(1))')
  expect(html).not.toContain('javascript:')
  expect(html).toContain('src="#"')
})
```

🟡 **[moderate] No test for `data:` URI scheme**
File: `src/lib/__tests__/markdown.test.ts`
Issue: Only `javascript:` is tested. `data:text/html,<script>alert(1)</script>` is equally dangerous and uses a different code path through the URL parser.
Fix: Add tests for `data:` in both `[link](data:...)` and `![img](data:...)` contexts.

🟡 **[moderate] No test for unclosed fenced code block**
File: `src/lib/__tests__/markdown.test.ts`
Issue: Confirms the content-swallowing behavior noted above is not caught.
Fix:
```ts
it('unclosed fenced code block does not hang and renders remaining content', () => {
  const html = md('```\ncode line\nno closing fence\nnormal paragraph')
  // Should not throw, should not spin forever
  // Ideally the "normal paragraph" is visible — currently it won't be (bug)
  expect(html).toBeDefined()
})
```

🟡 **[moderate] No test for empty string input**
File: `src/lib/__tests__/markdown.test.ts`
Issue: `content.split('\n')` on `''` produces `['']`. The single empty line hits the "Empty line" branch at line 203, `i` increments to 1, loop exits. Renders `<div class="md-body"></div>`. This works but is not tested.
Fix: `expect(md('')).toBe('<div class="md-body"></div>')`

🔵 **[minor] No test for `vbscript:` URI scheme**
Fix: `expect(md('[x](vbscript:msgbox(1))')).toContain('href="#"')`

🔵 **[minor] No test for very long lines (10,000 chars)**
Issue: The `renderInline` regex uses non-possessive quantifiers (`(.+?)`, `([^`]+?)`). For a 10,000-char line with no markdown, the regex engine runs to completion with zero matches and the whole string is appended as a text node — safe, but unconfirmed by tests. Catastrophic backtracking is not a risk here because the alternatives are anchored by distinct delimiter characters.
Fix: Add a smoke test with a 10,000-char plain-text line asserting it renders without error/timeout.

🔵 **[minor] No test for deeply nested lists (5+ levels)**
Issue: `parseList` is recursive. Five levels deep calls itself five times. Dedenting via `l.slice(2)` on a line that starts with only one space would silently produce a malformed dedented string. No stack overflow risk at 5 levels, but structural output is untested beyond 2 levels.
Fix: Add a 3-level nested list test asserting three `<ul>` elements in the output.

---

### React Key Uniqueness

🔵 **[minor] `renderInline` local `key` counter is safe but fragile**
File: `src/components/MarkdownRenderer.tsx:292`
Issue: Each call to `renderInline()` resets `key` to `0`. The keys are local to the `parts` array returned from that call — React never sees sibling keys from different `renderInline` calls colliding, because each call's output is slotted into a distinct parent element (a `<p>`, `<li>`, `<th>`, etc.). No reconciliation issue currently exists.
However: if `renderInline` is ever called twice for the same parent's children (e.g., joining two spans), keys WOULD collide. The pattern is fragile.
Fix: Document this assumption, or use a module-level monotonic counter like the outer `key` variable.

---

## Summary

No exploitable XSS vulnerabilities exist in the current code: `safeHref()` correctly blocks all dangerous URI schemes for both links and block-level images, and there is no `dangerouslySetInnerHTML`. The two real issues are: (1) a correctness bug where an unclosed fenced code block silently eats all subsequent document content, and (2) the inline image case is safe by accident (rendered as text) but lacks an explicit `safeHref` guard that would protect against a future contributor adding inline image support. Test coverage is missing for the image `src` XSS path, `data:` URIs, empty input, and the unclosed fence behavior — these are the gaps most likely to regress silently.
