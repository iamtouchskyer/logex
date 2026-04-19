# Security Review — logex-io multi-tenant rework

Angle: threat model, data exposure, session hygiene. Backend review already flagged SESSION_SECRET fallback (#1), cross-user cache (#2), over-broad `repo` scope (#3), error-taxonomy collapse (#4), plaintext `access_token` in JWT (#5), unvalidated `articlePath` (#6). NOT duplicated here.

---

## 🔴 Blockers

### S1. Share password transits as URL query param
- 🔴 `api/share/[id].ts:41` — `const password = req.query.password`.
- Threat: query strings are logged everywhere GET URLs land — Vercel access logs, upstream proxy logs, browser history, `Referer` on any outbound link/image inside the rendered article. A password-protected share becomes a password-leaked share the moment the recipient's browser fetches an external resource embedded in the article snapshot, or the URL is pasted into chat previews that follow redirects.
- Compounded by `Access-Control-Allow-Origin: *` on the GET path (line 159) — any origin can replay `GET /api/share/:id?password=...` once the password is observed.
- Fix: require `POST /api/share/:id/verify` with password in body, issue a short-lived share-session cookie (httpOnly, 15m), then `GET /api/share/:id` reads that cookie. No password in URL, ever.

---

## 🟡 Non-blocking

### S2. OAuth `state` generated with `Math.random()`
- 🟡 `api/auth/login.ts:20` — `Math.random().toString(36).slice(2)` (~50 bits, non-CSPRNG, V8 state recoverable from a few outputs).
- Threat: attacker who scrapes a few `state`s from log surfaces can predict the next and craft an OAuth-login CSRF that plants their account into a victim's browser (reverse account-takeover → silent data read once victim shares).
- Fix: `crypto.randomBytes(16).toString('hex')`.

### S3. No per-user rate-limit on `/api/articles/*`
- 🟡 `api/articles/_lib.ts` — Stolen/leaked JWT → unlimited proxy to `api.github.com` under our OAuth app → we get 2ary rate-limited globally, every tenant degraded.
- Fix: per-`login` token bucket (Vercel KV, 60 req/min) in `articles/_lib.ts`.

### S4. `/api/auth/logout` cookie flags drift from login
- 🟡 `api/auth/logout.ts:4` — emits `session=; Path=/; HttpOnly; Max-Age=0` — missing `Secure` and `SameSite=Lax` that login sets. Per RFC6265 §5.3 browsers treat this as a distinct cookie; the live cookie may persist on some clients.
- Fix: match attributes exactly on both set and clear.

---

## 🔵 Suggestions

- `api/share/[id].ts:89-102` CSRF on DELETE only checks `origin` when present — a fetch without `Origin` header slips through. Require `Origin` to exist AND match; reject when absent for mutating methods.
- Article body XSS: couldn't verify the reader sanitizes markdown→HTML in this scope. If the renderer allows raw HTML, stored XSS from a compromised `logex-data` (or a malicious share snapshot) runs same-origin — not token-exfil (httpOnly protects), but could call `/api/share` POST as the victim. Confirm `ArticleReader` uses a safe renderer; add one review pass on MD pipeline.
- `me.ts` correctly omits `access_token` ✅ — confirms XSS cannot exfil it via `/api/auth/me`.
- `callback.ts:25` state compare is non-constant-time; state is single-use random so impact negligible, but `crypto.timingSafeEqual` costs nothing.
- No open-redirect: `callback.ts:76` hardcodes `/`. ✅

---

## Verdict

**ITERATE**

S1 (password-in-URL) is a real leak path independent of backend's three blockers and must be fixed before ship. S2–S4 can land in a follow-up. Re-review after S1 + backend #1/#2/#3.
