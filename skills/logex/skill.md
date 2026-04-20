---
name: logex
description: "Write bilingual (zh + en) blog-style session papers from a Claude Code session transcript. One session → N articles (one per topic). LLM decides topic segmentation. No API key. Triggers: 'logex', 'extract session', 'session paper', '提取 session', 'write session article'."
---

# Logex — Write Session Papers

Turn Claude Code session transcripts into blog-quality technical articles. A single session can produce **multiple articles** — one per topic/arc. The LLM (you) decides how many topics exist and which are worth writing about.

**All articles are bilingual (zh + en).** Every article ships with a `primary` language body and a `translations` map containing the other language. Never produce a monolingual article — the data repo, renderer, and publish pipeline all assume bilingual shape.

## Usage

```
/logex                    # write articles from current session
/logex <path.jsonl>       # write from specific JSONL file
/logex --list             # list recent sessions available
```

## Procedure

### 1. Find the session JSONL

If no path provided, find the current session's JSONL:
```bash
SESSION_DIR="$HOME/.claude/projects/$(echo "$PWD" | tr '/' '-' | sed 's/^-//')"
ls -t "$SESSION_DIR"/*.jsonl | head -5
```

Pick the most recent (or current) session. If `--list`, show 10 most recent across all projects.

### 2. Run the prepare script

```bash
cd /Users/touchskyer/Code/logex-projects/logex
npx tsx src/pipeline/prepare.ts "<JSONL_PATH>" --mode article 2>/dev/null
```

Outputs JSON to stdout:
```json
{
  "sessionId": "...",
  "mode": "article",
  "prompt": null,
  "chunkSummaries": [
    { "index": 1, "startTs": "...", "endTs": "...", "score": 0.72, "project": "mitsein", "preview": "debug the auth...", "messageCount": 5 },
    ...
  ],
  "segmentationPrompt": "...",
  "meta": { ... }
}
```

If `chunkSummaries` is empty → no signal chunks found, report and stop.

### 3. Segment by topic (YOU decide)

**Execute the `segmentationPrompt` yourself.** You ARE the LLM. Read the chunk summaries and decide which chunks belong to the same topic.

The segmentation prompt asks you to output:
```json
{
  "groups": [
    {
      "title": "Mitsein Auth: JWT refresh token 的坑",
      "chunkIndices": [1, 2, 3, 5],
      "project": "mitsein",
      "worthWriting": true,
      "reason": "完整的 debug 故事线，从发现问题到 root cause 到修复"
    },
    {
      "title": "杂项配置",
      "chunkIndices": [4],
      "project": null,
      "worthWriting": false,
      "reason": "只是改了几行 config，没有 insight"
    }
  ]
}
```

Guidelines:
- Related chunks = same group, even if separated by time
- One topic can span multiple projects if the work is connected
- `worthWriting: false` for trivial/mechanical work
- 宁可少分不要多分 — 两个相关话题合一组比拆成两篇半成品好

### 4. Present candidates — let user choose

Show the user the groups you identified:

```
Found 3 topics in this session:

  [1] ✓ Mitsein Auth: JWT refresh token 的坑 (chunks 1,2,3,5 — score 0.72)
  [2] ✓ Logex 前端重设计 (chunks 6,7,8 — score 0.65)
  [3] ✗ 杂项配置 (chunk 4 — not worth writing)

Which ones to write? [1,2] / all / none
```

### 5. Build article prompts for selected groups

For each selected group, use the full prepare output you already have. Take the chunk indices from the group, gather those chunks' content from the original JSONL, and write the article yourself using the principles below.

### 6. Write each article — **bilingual, both languages complete**

For each selected topic group, write the article in **both Chinese and English**. Key principles:

**Content quality (both versions):**
- Open with a concrete scene, not a summary
- Have opinions — say what worked and what didn't
- Show trade-offs, admit imperfections
- Be specific (file paths, error messages, numbers)
- 1500–3000 words per article **per language** (so the article is 3000–6000 words total across both versions)
- **Stay scoped to this topic** — don't bleed into other groups

**Language rules:**
- **Primary language** is the language the user spoke in the session (detect from chunks — if CJK ratio > 30%, primary is `zh`; else `en`).
- **zh version**: Chinese narrative, technical terms stay in English (session, pipeline, keybinding, symlink, context, etc.). Don't translate code or file paths.
- **en version**: Native-feeling English — not a mechanical translation of the Chinese. Same ideas, same opinions, same specificity; rewritten for a native-English reader. Technical terms stay as-is (they're already English).
- **Titles**: each language gets its own title, written natively. Not a translation — an equivalent hook. Example: `"Mitsein Auth: JWT refresh token 的坑"` / `"Mitsein Auth: The JWT Refresh Token Trap"`.
- **Summaries**: each language gets its own 2–3 sentence summary, written natively.

**Output as JSON** (primary-first shape, matching `NewArticle` in `src/pipeline/types.ts`):
```json
{
  "lang": "zh",
  "title": "Chinese title",
  "summary": "中文 2-3 句 hook",
  "body": "完整中文 markdown 正文",
  "translations": {
    "en": {
      "title": "English title",
      "summary": "English 2-3 sentence hook",
      "body": "Full English markdown body"
    }
  },
  "tags": ["tag1", "tag2"],
  "project": "project-name",
  "chunkIndices": [1, 2, 3]
}
```

If primary is `en`, flip: `lang: "en"`, top-level fields in English, `translations.zh` holds Chinese.

**Bilingual is not optional.** Never emit an article without `translations` populated. The data repo's file layout (`YYYY/MM/DD/<slug>.<lang>.json`) depends on it; the renderer's language switcher depends on it.

### 7. Publish articles to logex-data repo (via publish.ts)

**Data repo**: `/Users/touchskyer/Code/logex-data` (clone if missing: `git clone https://github.com/iamtouchskyer/logex-data ~/Code/logex-data`)

**IMPORTANT — temp file path**: Use a **session-suffixed** path to avoid collisions with a parallel `/logex` running in another terminal/session on the same machine. Two sessions sharing `/tmp/logex-articles.json` will silently overwrite each other's articles.

```bash
ARTICLES_JSON="/tmp/logex-articles-${SESSION_ID}.json"
DECISIONS_JSON="/tmp/logex-decisions-${SESSION_ID}.json"
```

Save all articles from step 6 as a JSON array to `$ARTICLES_JSON`. Each article must have: `lang`, `title`, `summary`, `body`, `translations` (with the other language populated), `tags`, `chunkIndices`, `project`, and optionally `slug`.

#### Step 7a: Check for existing articles (idempotency)

```bash
cd /Users/touchskyer/Code/logex-projects/logex
npx tsx src/pipeline/publish.ts prepare-match \
  --data-dir /Users/touchskyer/Code/logex-data \
  --session-id "<SESSION_ID>" \
  --articles "$ARTICLES_JSON"
```

If `needsLlm: false` → all inserts, skip to 7c with the returned `decisions`.
If `needsLlm: true` → **execute the `matchingPrompt` yourself** to decide which new articles update existing ones vs. are new. Output the decisions JSON.

#### Step 7b: (only if needsLlm) Execute matching prompt

The prompt shows existing articles and new articles with their chunkIndices. You decide: update or insert per article. Output:
```json
{ "decisions": [{ "newIndex": 0, "action": "update", "existingSlug": "..." }, ...] }
```
Save to `$DECISIONS_JSON`.

#### Step 7c: Execute publish

```bash
cd /Users/touchskyer/Code/logex-projects/logex
npx tsx src/pipeline/publish.ts execute \
  --data-dir /Users/touchskyer/Code/logex-data \
  --session-id "<SESSION_ID>" \
  --articles "$ARTICLES_JSON" \
  --decisions "$DECISIONS_JSON"
```

This writes one file per `(slug, lang)` pair — for a bilingual article that's two files: `YYYY/MM/DD/<slug>.zh.json` and `YYYY/MM/DD/<slug>.en.json`. Updates `index.json`. Preserves existing slugs/URLs on updates. Re-running `/logex` on the same session is safe — it upserts, not appends.

### 8. Commit articles IMMEDIATELY (before anything slow)

**Don't skip this.** The files written by publish.ts are untracked until committed. Any parallel process on the same repo (another `/logex` session, a `git reset --hard` during test runs, a janitor script) will silently wipe them. Hero image generation in the next step can take 30-60 seconds — that's a large window for disaster.

```bash
cd /Users/touchskyer/Code/logex-data
git add .
git commit -m "articles: {count} from session {SESSION_ID}"
git push
```

Only AFTER the push succeeds, proceed to hero images. If the push fails (non-fast-forward), pull-rebase and retry — do not move on with untracked content.

### 9. Generate hero image (for each article)

Use the `image-x` skill to generate a hero image for each article:
```
/image-x Generate a minimalist, dark-themed abstract illustration for a technical blog post titled "{primary-title}". Style: geometric shapes, gradient, developer aesthetic. No text in image. 1200x630.
```

Save to `/Users/touchskyer/Code/logex-data/images/{slug}.png`. Same image serves both language versions. The slug is available from step 7c's output.

When all images are generated, commit+push them:

```bash
cd /Users/touchskyer/Code/logex-data
git add images/
git commit -m "images: hero for session {SESSION_ID}"
git push
```

### 10. Report & deploy

Show summary table (columns: primary title · words per language · project):
```
| # | Title (primary)                | zh words | en words | Project  |
|---|--------------------------------|----------|----------|----------|
| 1 | Mitsein Auth: JWT 的陷阱        | 2100     | 1950     | mitsein  |
| 2 | Logex 的前端重设计               | 1800     | 1750     | logex    |
```

Ask user:
- Deploy webapp? `cd /Users/touchskyer/Code/logex-projects/logex && git push && npx vercel --prod`

## Notes

- **No API key needed** — Claude writes articles and does segmentation in-session, in both languages.
- **LLM-driven segmentation** — you (Claude) read chunk summaries and decide topic groups, not rules.
- **Bilingual end-to-end** — pipeline, storage layout (`*.zh.json` + `*.en.json`), and renderer all depend on it. See `src/pipeline/lang.ts` for language detection logic.
- **Do not skip the English version** to "save time." Renderer will 404 on the missing language.
- The prepare script does parse/chunk/score (pure computation, ~2s).
- Writing quality (including translation quality) depends on the prompt in `src/pipeline/prompt.ts`.
- Data repo: `https://github.com/iamtouchskyer/logex-data` (public)
- Live site: `https://logex-io.vercel.app`
- Storage: `VITE_STORAGE=github`, `VITE_GITHUB_REPO=iamtouchskyer/logex-data` in `.env.local`
