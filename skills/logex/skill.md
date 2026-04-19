---
name: logex
description: "Write blog-style session papers from a Claude Code session transcript. One session → N articles (one per topic). LLM decides topic segmentation. No API key. Triggers: 'logex', 'extract session', 'session paper', '提取 session', 'write session article'."
---

# Logex — Write Session Papers

Turn Claude Code session transcripts into blog-quality technical articles. A single session can produce **multiple articles** — one per topic/arc. The LLM (you) decides how many topics exist and which are worth writing about.

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
cd /Users/touchskyer/Code/logex
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

### 6. Write each article (Claude does this itself)

For each selected topic group, write the article. Key principles:
- Open with a concrete scene, not a summary
- Have opinions — say what worked and what didn't
- Show trade-offs, admit imperfections
- Be specific (file paths, error messages, numbers)
- Chinese narrative, English technical terms
- 1500-3000 words per article
- **Stay scoped to this topic** — don't bleed into other groups

Output as JSON:
```json
{
  "title": "hook 感的标题",
  "summary": "让人想点进来的 2-3 句",
  "body": "完整 markdown 文章",
  "tags": ["..."],
  "project": "project-name",
  "chunkIndices": [1, 2, 3]
}
```

### 7. Generate hero image (for each article)

Use the `image-x` skill to generate a hero image for each article:
```
/image-x Generate a minimalist, dark-themed abstract illustration for a technical blog post titled "{title}". Style: geometric shapes, gradient, developer aesthetic. No text in image. 1200x630.
```

Save to `/Users/touchskyer/Code/logex-data/images/{slug}.png`.

### 8. Publish articles to logex-data repo (via publish.ts)

**Data repo**: `/Users/touchskyer/Code/logex-data` (clone if missing: `git clone https://github.com/iamtouchskyer/logex-data ~/Code/logex-data`)

First, save all articles from step 6 as a JSON array to a temp file (e.g. `/tmp/logex-articles.json`). Each article must have: `title`, `summary`, `body`, `tags`, `chunkIndices`, `project`, and optionally `slug`.

#### Step 8a: Check for existing articles (idempotency)

```bash
cd /Users/touchskyer/Code/logex
npx tsx src/pipeline/publish.ts prepare-match \
  --data-dir /Users/touchskyer/Code/logex-data \
  --session-id "<SESSION_ID>" \
  --articles /tmp/logex-articles.json
```

If `needsLlm: false` → all inserts, skip to 8c with the returned `decisions`.
If `needsLlm: true` → **execute the `matchingPrompt` yourself** to decide which new articles update existing ones vs. are new. Output the decisions JSON.

#### Step 8b: (only if needsLlm) Execute matching prompt

The prompt shows existing articles and new articles with their chunkIndices. You decide: update or insert per article. Output:
```json
{ "decisions": [{ "newIndex": 0, "action": "update", "existingSlug": "..." }, ...] }
```
Save to `/tmp/logex-decisions.json`.

#### Step 8c: Execute publish

```bash
cd /Users/touchskyer/Code/logex
npx tsx src/pipeline/publish.ts execute \
  --data-dir /Users/touchskyer/Code/logex-data \
  --session-id "<SESSION_ID>" \
  --articles /tmp/logex-articles.json \
  --decisions /tmp/logex-decisions.json
```

This handles: writing article JSON files, updating index.json, preserving existing slugs/URLs on updates. Re-running `/logex` on the same session is safe — it upserts, not appends.

### 9. Report & deploy

Show summary table:
```
| # | Title                          | Words | Project  |
|---|--------------------------------|-------|----------|
| 1 | Mitsein Auth: JWT 的陷阱        | 2100  | mitsein  |
| 2 | Logex 的前端重设计               | 1800  | logex    |
```

Ask user:
- Commit & push data? `cd /Users/touchskyer/Code/logex-data && git add . && git commit -m "articles: {count} from session {sessionId}" && git push`
- Deploy webapp? `cd /Users/touchskyer/Code/logex && git push && npx vercel --prod`

## Notes

- **No API key needed** — Claude writes articles and does segmentation in-session
- **LLM-driven segmentation** — you (Claude) read chunk summaries and decide topic groups, not rules
- The prepare script does parse/chunk/score (pure computation, ~2s)
- Writing quality depends on the prompt in `src/pipeline/prompt.ts`
- Data repo: `https://github.com/iamtouchskyer/logex-data` (public)
- Live site: `https://logex.vercel.app`
- Storage: `VITE_STORAGE=github`, `VITE_GITHUB_REPO=iamtouchskyer/logex-data` in `.env.local`
