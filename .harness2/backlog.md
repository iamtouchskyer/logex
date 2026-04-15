# Backlog

## From review unit F1.2 — 2026-04-15T15:26:12.252Z
- [ ] 🔴 [critical] Multi-line paragraphs are not merged — each line becomes its own `<p>` _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🔴 [critical] Indented code block fires before nested list items _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🔴 [critical] Setext h2 cannot be disabled — bare `---` HR after text becomes `<h2>` _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🔴 [critical] Table detection false-positive on any line containing a single `|` _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🟡 [moderate] Unclosed fenced code block consumes the rest of the document silently _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🟡 [moderate] `safeHref` blocks `mailto:` and `tel:` links _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🟡 [moderate] `parseList` key collision: `keyBase` is used for the outer list AND passed down unchanged _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🟡 [moderate] `renderInline` does not recurse — bold/italic nesting is not handled _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🟡 [moderate] `blockquote` shadow variable: inner `lines` param shadows outer `lines` _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 1. **Multi-line paragraph** — no test that two consecutive non-blank lines merge into one `<p>` (would catch the 🔴 bug above). _(from .harness2/nodes/F1.2/run_1/eval-frontend.md)_
- [ ] 🔴 **[critical] Inline images inside link text / bold / italic bypass safeHref entirely** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
- [ ] 🔴 **[critical] Unclosed fenced code block causes correct termination but silently swallows the rest of the document** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
- [ ] 🟡 **[moderate] Table body consumption loop has no `|` escape hatch for intentional non-table `|` lines** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
- [ ] 🟡 **[moderate] No test for `javascript:` in image src** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
- [ ] 🟡 **[moderate] No test for `data:` URI scheme** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
- [ ] 🟡 **[moderate] No test for unclosed fenced code block** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
- [ ] 🟡 **[moderate] No test for empty string input** _(from .harness2/nodes/F1.2/run_1/eval-tester.md)_
