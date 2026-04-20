# logex — Agent Working Instructions

## What Is This

logex turns Claude Code session JSONL transcripts into blog-quality technical articles. It's a thin pipeline (parse → chunk → score → group) plus a React/Vite SPA that reads articles from a separate public data repo (`logex-data`). Distributed as an npm package (`@touchskyer/logex`) + Claude Code plugin + MCP server for other agents. The LLM already in the session does the topic segmentation and the writing — logex is scaffolding, not an LLM gateway.

## Repo Layout

```
src/
  pipeline/        # pure node pipeline — parse, chunk, score, segment, extract, prompt, publish, lang
    extract.ts     # JSONL → article JSONs (bilingual)
    prepare.ts     # parse+chunk+score → JSON summary the agent consumes
    publish.ts     # writes articles to logex-data repo (idempotent: upsert by session+chunkIndices)
    prompt.ts      # the segmentation + writing prompts injected into the agent
  mcp/             # MCP server — `logex mcp` entrypoint (used by Cursor / Codex / Windsurf)
  pages/, components/, lib/   # React SPA (Vite) that renders the blog from logex-data
  types/
api/               # Vercel serverless endpoints — auth, insights, share
.claude-plugin/    # Claude Code plugin manifest (plugin.json, marketplace.json)
hooks/             # Stop hook shell script + hooks.json registering it
skills/logex/      # skill.md shipped with the plugin (mirror of ~/.claude/skills/logex/skill.md)
scripts/
e2e/               # playwright E2E + a11y
```

Article data lives in the public `iamtouchskyer/logex-data` GitHub repo (not in this repo). logex publishes directly via the GitHub Contents API — ensure `GITHUB_TOKEN` is set in `~/.claude/.env` with `repo` scope. Webapp reads it at build/runtime via `VITE_STORAGE=github`.

## Dev Workflow

```bash
npm install
npm run dev          # Vite dev server for the SPA
npm run test:unit    # vitest, fast
npm run test         # vitest + playwright (E2E)
npm run test:e2e     # playwright only, excluding a11y
npm run test:a11y    # axe-core a11y checks
npm run build        # tsc -b && vite build
npm run extract      # shortcut: npx tsx src/pipeline/extract.ts
```

No local API key required for writing articles — the agent in-session writes them. `@anthropic-ai/sdk` is only used for specific sub-features (e.g. `api/insights.ts`).

## Test Requirements (HARD RULES — see user's ~/.claude/CLAUDE.md)

- **100% coverage on new code.** No "will add tests later."
- **No fake green.** No `test.skip`, `test.todo`, `xit`, `xdescribe` in committed code.
- **Mock at boundary only.** Mock external APIs / fs / network. Never mock the logic under test.
- **E2E runs on real dev server** (Vite dev). Not jsdom.
- **A11y is a build blocker.** axe-core must emit zero critical/serious violations.
- **UI changes need a Playwright screenshot artifact** before you report success.
- **Each test runs independently.** No shared mutable state.

Run `npm run test` before declaring anything done. If the test infrastructure breaks, fix it — don't work around it.

## Architecture Notes

- **Article JSONs are bilingual.** `extract.ts` and the writing prompt produce zh + en variants per article; renderer picks language at read time. Don't collapse into a single-language shape.
- **`logex-data` is a separate public repo** (`https://github.com/iamtouchskyer/logex-data`). This repo never commits article content. Publish flow:
  1. Agent writes `/tmp/logex-articles.json`
  2. `publish.ts prepare-match` checks for existing articles by `sessionId` + `chunkIndices` (idempotency)
  3. LLM decides update-vs-insert if ambiguous, writes `/tmp/logex-decisions.json`
  4. `publish.ts execute` writes files + updates `index.json` in `logex-data`
- **Segmentation is LLM-driven, not rule-driven.** `prepare.ts` only scores + summarizes chunks. The agent reads chunk summaries and decides which belong together.
- **Pipeline is pure.** No global state, no side effects until the final `publish.ts execute` step. This is what lets `/logex` be safely re-run on the same session.
- **MCP server (`logex mcp`)** exposes the same workflow to non-Claude-Code agents. Cursor / Codex / Windsurf all drive it the same way.

## Claude Code Integration Surface

| File | Purpose |
|------|---------|
| `.claude-plugin/plugin.json` | plugin manifest — registers skill + hook paths |
| `.claude-plugin/marketplace.json` | marketplace entry for `/plugin marketplace add iamtouchskyer/logex` |
| `skills/logex/skill.md` | the `/logex` slash command procedure (ships inside the plugin) |
| `hooks/hooks.json` | registers the Stop hook |
| `hooks/session-end.sh` | Stop hook body — non-blocking reminder to run `/logex` |

Editing the skill or the hook? Keep it in this repo. The old global install at `~/.claude/skills/logex/skill.md` is being superseded by the plugin's shipped copy.

## Do / Don't

### DO

- Keep `src/pipeline/` pure. No I/O outside declared boundaries.
- Use `.js` extensions in ESM imports where required by the TS config.
- Run `npm run test` before pushing.
- Add tests for every new pipeline transform.
- Keep article data bilingual (zh + en) end-to-end.

### DON'T

- Don't commit article content to this repo — it belongs in `logex-data`.
- Don't bypass `publish.ts` idempotency. Upsert by `sessionId` + `chunkIndices`.
- Don't mock the segmentation prompt in tests — exercise the real prompt string.
- Don't add an LLM call to the pipeline. The agent in-session is the LLM.
- Don't regress a11y — axe failures are build failures.
