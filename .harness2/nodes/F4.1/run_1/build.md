# F4.1 Build Report — Performance / Caching

## Run: run_1 | Status: PASS

---

## Summary

Implemented lazy list loading and two-tier caching for the Logex webapp.

### Problem addressed
`loadAllArticles()` previously fetched every article JSON individually on list page load. With 10 articles = 11 requests (1 index + 10 article JSONs). Now: **1 request**.

---

## Changes

### 1. Lazy list loading — `src/lib/data.ts`
- `loadAllArticles()` rewritten to return `ArticleMeta[]` from `index.json` only — zero per-article fetches
- Sorts by date descending (same as before)
- `loadArticle(slug)` unchanged — still fetches full JSON on demand

### 2. Type changes — `src/lib/storage/types.ts`
- `ArticleMeta` extended with optional fields: `sessionId?`, `duration?`, `stats?`
- These allow `ArticleCard` to display rich stats when index.json includes them

### 3. Two-tier cache — `src/lib/storage/GitHubAdapter.ts`

**Tier 1: In-memory Map** (process lifetime)
- TTL: 5min for index, 30min for articles
- `getCached<T>` / `setCached` / `clearMemCache` exported for testability
- Applies to both TOKEN (private) and public CDN paths

**Tier 2: Cache Storage API** (browser cache, survives page reload)
- Stale-while-revalidate: if cached entry is stale, serve immediately + kick off background refresh
- Only applied to public CDN path (TOKEN path skips it — auth headers unsafe to cache)
- Graceful fallback to plain `fetch` if Cache API unavailable

**Private repo (TOKEN) path**: unchanged semantics — GitHub API with Bearer auth, only mem-cached.

### 4. Component type updates
| File | Change |
|------|--------|
| `src/components/ArticleCard.tsx` | Props: `SessionArticle` → `ArticleMeta` |
| `src/pages/ArticlesList.tsx` | Props: `SessionArticle[]` → `ArticleMeta[]` |
| `src/pages/Timeline.tsx` | Props: `SessionArticle[]` → `ArticleMeta[]` |
| `src/App.tsx` | State: `SessionArticle[]` → `ArticleMeta[]`; sessionCount filters undefined sessionIds |
| `src/pages/ArticleReader.tsx` | Removed `allArticles` prop (stale shortcut); always fetches full article (GitHubAdapter cache covers perf) |

---

## Tests

| Suite | Tests | Status |
|-------|-------|--------|
| `data.test.ts` (updated) | 8 | ✅ PASS |
| `cache.test.ts` (new) | 8 | ✅ PASS |
| Other existing suites | 56 | ✅ PASS |
| **Total** | **72** | **✅ all pass** |

Cache test coverage:
- Miss → null
- Hit within TTL → value
- Hit after TTL → null (eviction)
- Key independence
- TTL overwrite/reset
- `clearMemCache`
- `loadAllArticles` returns array without crash

---

## TypeScript
```
tsc --noEmit → 0 errors
```

---

## Commit
`5651397` feat(F4.1): lazy list loading + two-tier cache (mem + Cache Storage)
