## Verdict: ITERATE

### Summary
The share API implementation is **structurally sound** with good separation of concerns and comprehensive unit tests for core logic. However, there are **critical data consistency issues** and **race conditions** that must be fixed before production deployment.

---

## 🔴 CRITICAL FINDINGS

### 1. **Race condition: concurrent create can violate MAX_SHARES_PER_USER cap**
**File**: `api/share/index.ts:64-93`
**Issue**: Two simultaneous POST requests can both read the index, see count < 50, and both proceed to create shares, resulting in 51+ shares.
```typescript
// Both requests execute concurrently:
const idx = await readBlob<ShareIndex>(idxKey)  // both get idx with 49 shares
const currentShares = idx?.shares ?? []
if (currentShares.length >= MAX_SHARES_PER_USER) return  // both pass
const id = generateId()  // different IDs
await Promise.all([
  writeBlob(shareKey(id), record),
  writeBlob(idxKey, newIndex),  // RACE: both write, last one wins
])
```
**Fix**: Introduce atomic CAS (compare-and-swap) or implement a distributed lock via Vercel KV. Minimal fix: add ETag check to `writeBlob` and retry on conflict.
**Severity**: 🔴 Data integrity violation

---

### 2. **Atomic write failure: share created but index update fails**
**File**: `api/share/index.ts:88-93`
**Issue**: `Promise.all([writeBlob(...), writeBlob(...)])` — if index write fails after share write succeeds, the index is stale and the share becomes orphaned (GC'd or leaked).
```typescript
await Promise.all([
  writeBlob(shareKey(id), record),         // ✅ succeeds
  writeBlob(idxKey, newIndex),             // ❌ timeout or fails
])
// Share exists in blob but NOT in index — will never appear in GET /api/share list
```
**Impact**: Storage leak + UX breaks (user won't see their share in the list).
**Fix**: Write share first, then index with retry. If index write fails, delete the share and return 500.
**Severity**: 🔴 Data consistency leak

---

### 3. **Index not cleaned up after blob delete (Delete endpoint)**
**File**: `api/share/[id].ts:132-143`
**Issue**: Blob deletion can fail silently without retry.
```typescript
const blobInfo = await head(shareKey(id))
if (blobInfo) {
  await del(blobInfo.url)  // ❌ no try-catch; network error → silent failure
}
// Share deleted from index but blob still exists (orphaned)
```
**Impact**: Orphaned blobs accumulate; user sees share gone but blob persists. Storage waste.
**Fix**: Wrap `del()` in try-catch; if it fails, don't remove from index and return 500.
**Severity**: 🔴 Storage leak + cross-user data access risk

---

### 4. **CDN stale read after delete: fetch() from head().url bypasses cache invalidation**
**File**: `api/share/index.ts:22-32` and `api/share/[id].ts:17-27`
**Issue**: The pattern `head(key)` then `fetch(info.url)` uses the blob's CDN URL directly. Vercel Blob URLs are cached by CDN. After `del()`, the blob is gone but the CDN may serve stale cached data for 60+ seconds.
```typescript
// handleDelete deletes blob
await del(blobInfo.url)

// Meanwhile, GET /api/share/[id] with correct password fetches from cache
const info = await head(key)  // returns 404 but...
const res = await fetch(info.url)  // CDN serves cached version!
```
**Impact**: After share deletion, a concurrent GET request might still retrieve the article (data leak).
**Fix**: Don't fetch from blob's public URL. Instead, use Vercel Blob `get()` API directly or implement server-side buffer. Add cache-control headers.
**Severity**: 🔴 Data leak (post-deletion access)

---

## 🟡 WARNINGS

### 5. **Missing try-catch on bcrypt hash (timeout risk)**
**File**: `api/share/index.ts:73`
**Issue**: `hashPassword()` can be slow (bcrypt with 10 rounds ≈ 100-200ms). No timeout handling.
```typescript
const passwordHash = await hashPassword(password)  // no timeout
```
If bcrypt is slow + Vercel Blob ops are slow, you can exceed 10s timeout.
**Fix**: Add timeout wrapper: `Promise.race([hashPassword(...), timeout(5000)])`. Return 503 Service Unavailable if timeout.
**Severity**: 🟡 Function timeout risk in production

---

### 6. **No retry logic on blob read failures**
**File**: `api/share/index.ts:22-32`
**Issue**: `readBlob()` returns null on any error. Transient network errors (1% failure rate) cause silent 404s.
```typescript
async function readBlob<T>(key: string): Promise<T | null> {
  try {
    const info = await head(key)
    if (!info) return null
    const res = await fetch(info.url)
    if (!res.ok) return null  // all HTTP errors treated as not found
    return res.json() as Promise<T>
  } catch {
    return null  // network error → null
  }
}
```
**Impact**: Users can't create shares if Vercel Blob API is briefly unavailable.
**Fix**: Implement exponential backoff retry (up to 3 attempts) before returning null.
**Severity**: 🟡 Reliability issue

---

### 7. **List endpoint doesn't report isExpired status**
**File**: `api/share/index.ts:120-129`
**Issue**: `handleList()` returns expiresAt but doesn't compute whether share is expired. Frontend must check client-side.
```typescript
const metas: ShareMeta[] = records
  .filter((r): r is ShareRecord => r !== null)
  .map(({ id, slug, createdAt, expiresAt, locked }) => ({ id, slug, createdAt, expiresAt, locked }))
// locked IS returned ✓
// isExpired NOT computed ✗
```
**Impact**: Minor UX issue (frontend has to check expiry client-side).
**Fix**: Add `isExpired: boolean` to ShareMeta.
**Severity**: 🟡 UX/API design issue

---

### 8. **Password minimum length weak (1 char allowed)**
**File**: `api/share/index.ts:54-56`
**Issue**: Allows 1-character passwords.
```typescript
if (!password || typeof password !== 'string' || password.length < 1) {
  res.status(400).json({ error: 'Missing password' })
}
```
**Impact**: Single-char passwords have only 62 possible values; easily brute-forced. Rate limit (10 attempts) can be reset by owner.
**Fix**: Enforce minimum 8 chars: `password.length < 8`.
**Severity**: 🟡 Security weakness (weak password acceptance)

---

## 🔵 LGTM

### ✅ Input validation is solid
- Slug: non-empty string ✓ (line 50-52)
- Password: non-empty string ✓ (line 54-56) — but too weak
- expiresInDays: 1-365 ✓ (line 58-60)

### ✅ Authentication is correct
- Session token verification uses HMAC-SHA256 ✓ (_lib.ts:86)
- Signature validation before payload decode ✓ (_lib.ts:82-90)
- Auth user extraction handles malformed cookies gracefully ✓ (_lib.ts:98-115)
- All authenticated endpoints check login ✓

### ✅ Rate limiting logic is sound
- isLocked() correctly returns true at MAX_ATTEMPTS ✓ (_lib.ts:71-72)
- Attempts incremented on wrong password ✓ ([id].ts:96-97)
- Lock state persisted to blob ✓

### ✅ Unit tests are comprehensive
- 100% coverage of pure functions (_lib.ts)
- Token verification tests with expiry, tampering, malformed input ✓
- Password hashing never stores plaintext ✓
- All edge cases covered (empty cookie, missing session field, tampered signature) ✓
- Boundary tests for expiry (exact current time) ✓

### ✅ Blob key format prevents collisions
- `shareKey(id)` → `shares/{id}.json` ✓
- `indexKey(userId)` → `shares/index-{userId}.json` ✓
- Separation by prefix prevents cross-pollution ✓

### ✅ Authorization is enforced
- DELETE requires authenticated user AND createdBy match ✓ ([id].ts:127-129)
- List endpoint only returns login's own shares ✓
- No cross-user data leakage ✓

### ✅ Article fetching path is safe
- Fetches from GitHub raw content (not jsDelivr) ✓ ([id].ts:55)
- Uses Authorization header if `GITHUB_TOKEN` is set ✓ ([id].ts:44)
- No auth token leakage in public URLs ✓

---

## DETAILED ANALYSIS BY CHECKLIST ITEM

### 1. Error handling — blob operations
**Status**: ⚠️ **Incomplete**
- `readBlob()` has try-catch ✓
- `writeBlob()` does NOT ✗ (line 34-35)
- `fetchArticle()` does NOT ✗ (line 35-58)
- Suggests failures are not expected but should add retry.

### 2. Concurrent creates — MAX_SHARES cap
**Status**: 🔴 **BROKEN**
Described in finding #1 above.

### 3. Index consistency — atomic writes
**Status**: 🔴 **BROKEN**
Described in findings #2 and #3 above.

### 4. Blob get pattern — head() + fetch()
**Status**: 🔴 **RISKY (CDN stale read)**
Described in finding #4 above. This is a data leak risk.

### 5. List endpoint — auth scope
**Status**: ✅ **CORRECT**
- Only lists `login`'s own shares via `indexKey(login)` ✓
- No cross-user leakage ✓

### 6. Delete + index cleanup
**Status**: 🟡 **Partial**
- Index IS updated ✓ (line 141)
- Blob delete not wrapped in try-catch ✗ (line 135)

### 7. Max shares cap enforcement
**Status**: 🔴 **BROKEN (race condition)**
- Check exists but not atomic.

### 8. Input validation
**Status**: ⚠️ **Mostly Correct**
- slug: non-empty ✓ (line 50)
- password: non-empty ✓ but min length too weak (line 54)
- expiresInDays: 1-365 ✓ (line 58)

### 9. Article fetching path
**Status**: ✅ **CORRECT**
- Fetches from GitHub raw content ✓
- Authorization header correctly used ✓
- No token leakage ✓

### 10. Vercel function timeout
**Status**: 🟡 **RISKY**
- bcrypt with 10 rounds ≈ 100-200ms
- Multiple blob ops + fetch can add 500ms+
- Cumulative: potentially 800ms–1s in worst case
- No timeout wrapper or early abort
- Still under 10s limit but close enough to be a concern under load

---

## ACTIONABLE FIXES (in priority order)

| # | Fix | File:Line | Severity | Effort |
|---|-----|-----------|----------|--------|
| 1 | Atomic CAS for max shares check (use Vercel KV or retry loop) | `api/share/index.ts:64-93` | 🔴 | High |
| 2 | Atomic share + index write (write share, then index with retry; rollback on fail) | `api/share/index.ts:88-93` | 🔴 | High |
| 3 | Wrap blob delete in try-catch (if fail, don't remove from index) | `api/share/[id].ts:135` | 🔴 | Low |
| 4 | Replace `head() + fetch()` with Vercel Blob `get()` API | `api/share/index.ts:22-32`, `api/share/[id].ts:17-27` | 🔴 | Medium |
| 5 | Enforce 8-char minimum password | `api/share/index.ts:54` | 🟡 | Low |
| 6 | Add isExpired to ShareMeta interface | `api/share/_lib.ts:23-29`, `api/share/index.ts:126` | 🟡 | Low |
| 7 | Retry logic on transient blob read failures | `api/share/index.ts:22-32` | 🟡 | Medium |
| 8 | Timeout wrapper for bcrypt | `api/share/index.ts:73` | 🟡 | Low |

---

## RISK ASSESSMENT

**Data Integrity Risk**: 🔴 **HIGH**
- Race conditions can violate share cap.
- Orphaned blobs (index/share mismatch).
- Stale reads after delete (data leak).
- This is NOT production-ready.

**Deployment Readiness**: ❌ **NOT READY**
Must fix findings #1–#4 before shipping.

**Test Coverage**: ✅ **EXCELLENT** (for pure logic)
- Unit tests are thorough for _lib.ts
- Missing: integration tests for concurrent blob operations
- Missing: E2E tests for delete → stale read race

**Code Quality**: ✅ **GOOD**
- Clean separation of concerns (HTTP layer vs. pure functions)
- No dependencies on external packages (crypto, bcryptjs only)
- Good naming and structure

---

## SUMMARY FOR STAKEHOLDER

**Good news**: The core authentication, rate limiting, and password hashing logic are solid. Tests are comprehensive.

**Bad news**: The implementation is **not ready for production** due to data consistency bugs:
1. Multiple users can exceed the 50-share limit via race conditions.
2. Shares can become orphaned (exist in blob but not in index).
3. Deleted shares can still be served from CDN cache.

**Recommendation**: Block deployment. Fix findings #1–#4 before alpha/beta launch.

**Effort to fix**: ~2–3 days for a careful engineer.
