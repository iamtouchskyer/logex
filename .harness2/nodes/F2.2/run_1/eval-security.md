# Security Review: Share API
**Reviewer:** Security Engineer
**Date:** 2026-04-16
**Files:** api/share/_lib.ts, api/share/index.ts, api/share/[id].ts

## Verdict: FAIL

4 critical vulnerabilities. All fixed inline before tick completion.

---

## 🔴 CRITICAL (fixed)

### 1. JWT secret hardcoded fallback
**File:** `api/share/_lib.ts` (getAuthUser)
**Issue:** `process.env.SESSION_SECRET ?? 'session-brain-dev-secret'` — if SESSION_SECRET missing in prod, attacker can forge tokens.
**Fix:** In production, refuse auth if SECRET missing. Dev-only fallback behind `NODE_ENV !== 'production'` check.

### 2. Token modulo bias
**File:** `api/share/_lib.ts` (generateId)
**Issue:** `bytes[i] % 62` — with 256 values, bytes 0–192 map evenly but 193–255 (63 values) bias toward chars 0–62. ~69-bit effective entropy. padEnd('A') predictable.
**Fix:** Rejection sampling with `maxValid = 248`. Uniform distribution, 71.45 bits entropy.

### 3. CSRF on DELETE
**File:** `api/share/[id].ts` (handleDelete)
**Issue:** DELETE uses cookie-only auth. Cross-site `fetch()` with `credentials:'include'` could invoke if SameSite not Strict.
**Fix:** Origin header validation — compare `new URL(origin).host` vs `req.headers.host`.

### 4. CDN stale read after delete
**File:** `api/share/index.ts` and `api/share/[id].ts` (readBlob)
**Issue:** `head(key)` returns Vercel Blob CDN URL. After deletion, CDN serves cached blob for ~60s — deleted shares still readable.
**Fix:** Use `list({ prefix: key })` + `blob.downloadUrl` (direct, bypasses CDN cache).

---

## 🟡 WARNINGS (accepted as known limitations)

### 5. Rate limit race condition
**Issue:** Concurrent GET requests with wrong password can both read attempts=N, both write N+1 (only +1 persisted not +2).
**Accepted:** Distributed locking on Vercel Blob is overkill for a blog share link. Rate limit is best-effort. Documented.

### 6. Slug-level brute force bypass
**Issue:** Attacker can create new share for same slug, resetting rate limit counter.
**Accepted:** Attacker must be authenticated to create shares. They can only attack their own shares.

### 7. Test coverage: security edge cases
**Issue:** No concurrent write tests, no CSRF test, no entropy distribution test.
**Partially accepted:** isValidId and rejection sampling are unit tested.

---

## 🔵 LGTM

- bcrypt rounds=10, no plaintext passwords stored or logged
- Creator check on DELETE correctly enforced
- Expiry enforced server-side before returning article
- isValidId() prevents path traversal in blob keys
- Input validation: slug, password (≥4 chars), expiresInDays (1-365)
- Password never returned in responses
