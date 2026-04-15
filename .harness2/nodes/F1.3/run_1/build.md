# F1.3 Fix Complete

## Bugs Fixed

1. **Bug 1: Multi-line paragraphs not merged** — 替换原来的单行 `<p>` 逻辑为 while 循环，连续积累非特殊行，最终 join 成一个 `<p>`。停止条件覆盖所有 block 元素起始符（fenced code、ATX heading、blockquote、list item、HR、image、setext underlines）。

2. **Bug 2: Indented code block runs before list detection** — 将 indented code block 检测从列表检测之前移到之后（unordered list → ordered list → indented code block）。同时修复 `parseList` 中 4-space-indented nested item 的 dedent 逻辑：改为 `replace(/^[ \t]+/, '')` strip 所有前导空格，而非固定 `slice(2)`。

3. **Bug 3: Setext h2 / HR ambiguity** — setext heading 触发条件增加额外 guard：当前行不能是 list item (`/^[-*]\s/`) 或 ordered list (`/^\d+\.\s/`)；HR 检测位置已在 list 之后，当前行是空行或 doc 开头时不会触发 setext 路径，直接命中 HR 检测器。

4. **Bug 4: Table false positive** — 将 `line.includes('|')` 替换为：`(line.match(/\|/g) ?? []).length >= 2 || line.trimStart().startsWith('|') || line.trimEnd().endsWith('|')`，单 pipe 的普通句子不再命中。

5. **Bug 5: Unclosed fenced code block** — inner while loop 退出后，仅当 `i < lines.length`（即找到了关闭 fence）时才执行 `i++`；否则 i 已在 EOF，不做额外递增。

6. **Bug 6: safeHref invariant comment** — 在 `renderInline()` 函数上方 JSDoc 注释里明确说明：inline images 故意不支持；若未来添加支持，必须对 URL 调用 `safeHref()`。

## Tests Added

- `Regression: Multi-line paragraph merge > consecutive text lines are merged into a single <p>`
- `Regression: Multi-line paragraph merge > blank line separates two paragraphs`
- `Regression: Indented list item not code block > 4-space-indented list item renders as list, not code block`
- `Regression: HR vs setext h2 disambiguation > bare --- after empty line renders as <hr>, not h2`
- `Regression: HR vs setext h2 disambiguation > standalone --- on first line renders as <hr>`
- `Regression: HR vs setext h2 disambiguation > text followed by --- still renders as setext h2`
- `Regression: Table false positive with single pipe > sentence with one pipe is NOT rendered as a table`
- `Regression: Unclosed fenced code block > code block without closing fence renders content without crashing`

## Test Results

```
 RUN  v4.1.4 /Users/touchskyer/Code/session-brain

 Test Files  5 passed (5)
      Tests  64 passed (64)
   Start at  23:28:54
   Duration  652ms (transform 226ms, setup 229ms, import 221ms, tests 29ms, environment 2.10s)
```

## Commit

`dea8a83` — fix: MarkdownRenderer critical bugs — paragraph merge, indented-code ordering, setext/HR, table false positive, unclosed fence
