# F2.1 Build Summary — Share Link API

## What was built

### Source files
- `api/share/_lib.ts` — pure helper functions (token gen, bcrypt, expiry, rate limit, JWT verify, blob key utils)
- `api/share/index.ts` — POST /api/share (create) + GET /api/share (list)
- `api/share/[id].ts` — GET /api/share/[id] (validate + serve) + DELETE /api/share/[id] (revoke)

### Test file
- `src/lib/__tests__/share-api.test.ts` — 35 unit tests covering all pure functions

### Incidental fix
- `src/components/Sidebar.tsx:13` — pre-existing TS error `RefObject<HTMLDivElement>` → `RefObject<HTMLDivElement | null>` (React 19 / TS 6 stricter ref typing)

## Architecture decisions

| Decision | Rationale |
|---|---|
| `crypto.randomBytes` instead of `nanoid` | nanoid v5 is pure ESM; Vercel serverless functions run CommonJS. Avoids dynamic import complexity. |
| `bcryptjs` (pure JS) | No native bindings, works in Vercel sandbox. |
| `_lib.ts` pure function layer | Testable without HTTP mocks. All business logic separated from I/O. |
| `head()` + `fetch(url)` for reads | `@vercel/blob` `get()` returns stream; `head()` gives CDN URL, then plain `fetch` returns JSON directly. |
| `addRandomSuffix: false` on `put()` | Deterministic blob keys (`shares/{id}.json`) needed for lookup. |

## Test results
```
Test Files  7 passed (7)
Tests      107 passed (107)
Duration   985ms
```

## Build result
```
✓ built in 91ms (zero TS errors)
```

## Constraints satisfied
- ✅ No plaintext passwords stored or logged
- ✅ Token is exactly 12 alphanumeric chars
- ✅ Expiry enforced server-side (isExpired checks blob expiresAt)
- ✅ Rate limit: 10 attempts → locked=true, persisted to blob
- ✅ Cap: 50 shares per user (index check before creation)
- ✅ CORS: GET /api/share/[id] → `Access-Control-Allow-Origin: *`; other endpoints → same-origin
- ✅ All error responses return JSON with `{ error: string }`
- ✅ Auth: HS256 JWT from session cookie, same pattern as me.ts
