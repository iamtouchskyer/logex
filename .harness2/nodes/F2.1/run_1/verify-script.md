# F2.1 Verification Script

## Prerequisites
```bash
# Set base URL
BASE=https://your-vercel-deployment.vercel.app
# Or locally: BASE=http://localhost:3000

# Obtain a session cookie first (login via /api/auth/login GitHub flow)
# Then capture the session cookie from browser DevTools or curl jar
SESSION_COOKIE="session=eyJhbGciOiJIUzI1NiJ9..."
```

---

## 1. POST /api/share — Create a share link

```bash
curl -s -X POST "$BASE/api/share" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{"slug": "my-article-slug", "password": "secret123", "expiresInDays": 7}' | jq .
```

**Expected 201:**
```json
{
  "id": "Ab3Cd4Ef5Gh6",
  "url": "https://your-vercel-deployment.vercel.app/share/Ab3Cd4Ef5Gh6",
  "expiresAt": "2026-04-23T00:08:27.000Z"
}
```

**Expected 401 (no auth):**
```bash
curl -s -X POST "$BASE/api/share" \
  -H "Content-Type: application/json" \
  -d '{"slug": "test", "password": "pw"}' | jq .
# {"error":"Unauthorized"}
```

**Expected 400 (missing slug):**
```bash
curl -s -X POST "$BASE/api/share" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{"password": "pw"}' | jq .
# {"error":"Missing slug"}
```

---

## 2. GET /api/share — List shares (authenticated)

```bash
curl -s "$BASE/api/share" \
  -H "Cookie: $SESSION_COOKIE" | jq .
```

**Expected 200:**
```json
{
  "shares": [
    {
      "id": "Ab3Cd4Ef5Gh6",
      "slug": "my-article-slug",
      "createdAt": "2026-04-16T00:08:27.000Z",
      "expiresAt": "2026-04-23T00:08:27.000Z",
      "locked": false
    }
  ]
}
```

---

## 3. GET /api/share/[id] — Validate and read (public, no auth)

**Correct password:**
```bash
SHARE_ID="Ab3Cd4Ef5Gh6"
curl -s "$BASE/api/share/$SHARE_ID?password=secret123" | jq .
```
**Expected 200:**
```json
{
  "article": { "...": "full SessionArticle object" },
  "slug": "my-article-slug"
}
```

**Wrong password:**
```bash
curl -s "$BASE/api/share/$SHARE_ID?password=wrongpw" | jq .
# {"error":"Wrong password"}
# HTTP 403
```

**Missing password:**
```bash
curl -s "$BASE/api/share/$SHARE_ID" | jq .
# {"error":"Missing password query param"}
# HTTP 400
```

**Rate limit — 10 wrong attempts → locked:**
```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/share/$SHARE_ID?password=wrong$i"
done
# First 10: 403 (Wrong password)
# 11th: 403 (Share locked due to too many failed attempts)
```

**Expired share:**
```bash
# Create a share with expiresInDays=0 is blocked (min 1). To test expiry, create one then
# manually set expiresAt in past via Vercel Blob dashboard.
# Expected: HTTP 410 {"error":"Share expired"}
```

**Not found:**
```bash
curl -s "$BASE/api/share/doesnotexist" | jq .
# {"error":"Share not found"}  HTTP 404
```

**CORS header present on GET:**
```bash
curl -s -I "$BASE/api/share/$SHARE_ID?password=secret123" | grep -i access-control
# Access-Control-Allow-Origin: *
```

---

## 4. DELETE /api/share/[id] — Revoke

```bash
curl -s -X DELETE "$BASE/api/share/$SHARE_ID" \
  -H "Cookie: $SESSION_COOKIE" -w "%{http_code}"
# 204
```

**Verify deleted:**
```bash
curl -s "$BASE/api/share/$SHARE_ID?password=secret123" | jq .
# {"error":"Share not found"}  HTTP 404
```

**Delete by non-owner:**
```bash
curl -s -X DELETE "$BASE/api/share/$SHARE_ID" \
  -H "Cookie: $OTHER_USER_SESSION_COOKIE" | jq .
# {"error":"Forbidden"}  HTTP 403
```

**Delete unauthenticated:**
```bash
curl -s -X DELETE "$BASE/api/share/$SHARE_ID" | jq .
# {"error":"Unauthorized"}  HTTP 401
```
