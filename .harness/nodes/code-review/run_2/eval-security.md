# Security Review — run_2 (re-review after blocker fixes)

Angle: verify S1 (password-in-URL) and S2/S4 are fixed; confirm B1-B3 closures from security lens; check for new attack surface.

---

## Fix verification

### S1 — share password in URL

Why it mattered: URL query strings land in Vercel access logs, upstream proxies, browser history, and Referer on any outbound fetch in the rendered article. Compounded by `Access-Control-Allow-Origin: *` on GET allowing cross-origin replay once the password leaked.

Evidence in code:
- `api/share/[id].ts:76` — handleGet on password-protected share returns 401 PASSWORD_REQUIRED and never reads req.query.password.
- `api/share/[id].ts:84` — handlePost parses password only from the JSON body; req.query.password is never referenced.
- `api/share/[id].ts:219` — Access-Control-Allow-Origin is now set only for GET; POST and DELETE stay same-origin.
- `src/pages/SharePage.tsx:60` — client POSTs with `credentials:'same-origin'` and `Content-Type: application/json`.

Closed — password never transits URL/Referer/logs; cross-origin replay blocked.

### S2 — weak OAuth state randomness

Why it mattered: Math.random state (~50 bits, V8-recoverable) enabled predictive CSRF against OAuth login.

Evidence in code:
- `api/auth/login.ts:25` — `crypto.randomBytes(16).toString('hex')` — 128-bit CSPRNG.
- `api/auth/callback.ts:21` — length check then `crypto.timingSafeEqual` for state comparison.

Closed.

### S4 — logout cookie attribute drift

Why it mattered: per RFC6265 §5.3, a clear that drops Secure/SameSite is treated as a distinct cookie by some browsers, leaving the live session cookie alive.

Evidence in code:
- `api/auth/logout.ts:9` — emits `session=; Path=/; HttpOnly; SameSite=Lax; Secure(in prod); Max-Age=0` matching `api/auth/callback.ts:73`.

Closed — attributes now identical on set and clear.

### Cross-confirm B1/B2/B3 from security lens

- B1: `api/_session.ts:30` refuses to sign with dev secret in prod; forge-via-known-secret vector eliminated.
- B2: cache keys login-prefixed; cross-tenant read in a shared browser profile impossible.
- B3: scope narrowed to read:user; blast radius of a leaked JWT reduced from "every private repo" to "public logex-data read".

---

## Non-blocking observations

- SUGGESTION `api/share/[id].ts:148` — CSRF guard on DELETE now correctly requires Origin present.
  reasoning: tightens run_1 observation about absent Origin; closes server-side replay for mutating methods.
  → no action needed; flagged for audit trail.

- SUGGESTION `src/pages/SharePage.tsx:41` — wrong-password and locked branching uses substring match on the string "lock".
  reasoning: fragile coupling to server-side error prose; a copy edit on the server could silently downgrade locked shares into generic errors.
  → return structured error codes like `{ error: 'LOCKED' }` and switch on code, not prose.

- SUGGESTION `api/_session.ts:72` — exp check is conditional on payload.exp being truthy.
  reasoning: a token that passes HMAC but omits exp never expires; defense in depth against a signing-path bug.
  → require `typeof payload.exp === 'number'` and reject otherwise.

- SUGGESTION `api/share/[id].ts:231` — POST (password submit) relies on browser CORS enforcement; there is no server-side Origin check.
  reasoning: a leaked share URL replayed server-to-server still needs the password (which no longer transits URL), so risk is residual, not active.
  → optional hardening — add Origin match on POST for parity with DELETE.

openIssues S3 (rate-limit) and backend-#5 (plaintext access_token in JWT) remain medium, accepted as documented debt.

---

## Verdict

LGTM
