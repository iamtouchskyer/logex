/**
 * GitHub App Manifest Flow — Step 2 (callback)
 *
 * GitHub redirects here with ?code=xxx after the user creates the App.
 * We exchange the code for full credentials, then:
 *   1. Write GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET to Vercel env via API
 *   2. Show the user a success page with next steps
 *
 * Vercel env write requires VERCEL_ACCESS_TOKEN + VERCEL_PROJECT_ID env vars.
 * If those aren't set, we display the credentials for manual copy-paste.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

interface GitHubAppConversion {
  id: number
  slug: string
  client_id: string
  client_secret: string
  webhook_secret: string | null
  pem: string
  html_url: string
  owner: { login: string }
}

async function writeVercelEnv(key: string, value: string, token: string, projectId: string): Promise<boolean> {
  try {
    // First try to update existing
    const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key,
        value,
        type: 'encrypted',
        target: ['production', 'preview', 'development'],
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

function successPage(appSlug: string, clientId: string, autoConfigured: boolean, manualVars?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Session Brain — Setup Complete</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui; background: #0a0a1a; color: #e2e8f0;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; padding: 24px; }
    .card { background: #1a1a2e; border: 1px solid #2d2d4a; border-radius: 12px;
            padding: 32px; max-width: 540px; width: 100%; }
    h2 { color: #06b6d4; margin: 0 0 8px; }
    .badge { display: inline-block; background: #064e3b; color: #34d399;
             border-radius: 6px; padding: 2px 10px; font-size: 12px;
             font-weight: 600; margin-bottom: 20px; }
    p { color: #94a3b8; line-height: 1.6; margin: 0 0 16px; }
    .step { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px;
            padding: 16px; margin: 12px 0; }
    .step-num { color: #06b6d4; font-weight: 700; font-size: 12px;
                text-transform: uppercase; letter-spacing: 0.05em; }
    code { background: #0f172a; border: 1px solid #1e293b; border-radius: 4px;
           padding: 2px 6px; font-size: 13px; color: #7dd3fc; font-family: monospace; }
    pre { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px;
          padding: 16px; overflow-x: auto; font-size: 13px; color: #7dd3fc;
          line-height: 1.5; margin: 12px 0; }
    .cta { display: inline-block; background: #06b6d4; color: #0a0a1a;
           border-radius: 8px; padding: 12px 24px; font-weight: 700;
           text-decoration: none; margin-top: 8px; }
    .warn { background: #1c1a0a; border: 1px solid #78350f; border-radius: 8px;
            padding: 16px; margin: 12px 0; color: #fbbf24; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>GitHub App Created ✓</h2>
    <span class="badge">logex-${appSlug}</span>
    <p>Your GitHub App is live. Here's what happens next:</p>

    ${autoConfigured ? `
    <div class="step">
      <div class="step-num">✅ Done automatically</div>
      <p style="margin:8px 0 0">Wrote <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code>
      to Vercel. Redeploy to pick them up.</p>
    </div>
    <div class="step">
      <div class="step-num">Step 1 — Set remaining vars in Vercel</div>
      <p style="margin:8px 0 0">In your Vercel dashboard, add:</p>
      <pre>SESSION_SECRET=$(openssl rand -hex 32)
ALLOWED_GITHUB_USERS=iamtouchskyer</pre>
    </div>
    ` : `
    <div class="warn">⚠️ Auto-configuration skipped (no VERCEL_ACCESS_TOKEN set).
    Copy the values below manually.</div>
    ${manualVars ? `<pre>${manualVars}</pre>` : ''}
    <div class="step">
      <div class="step-num">Step 1 — Add to Vercel env</div>
      <p style="margin:8px 0 0">Go to Vercel → Project Settings → Environment Variables and add the values above, plus:</p>
      <pre>SESSION_SECRET=&lt;run: openssl rand -hex 32&gt;
ALLOWED_GITHUB_USERS=iamtouchskyer</pre>
    </div>
    `}

    <div class="step">
      <div class="step-num">Step 2 — Redeploy</div>
      <p style="margin:8px 0 0">Run <code>npx vercel --prod</code> or push a commit to trigger a deploy.</p>
    </div>

    <div class="step">
      <div class="step-num">Step 3 — Done</div>
      <p style="margin:8px 0 0">Visit your site and click "Sign in with GitHub". It should work immediately.</p>
    </div>

    <a class="cta" href="/">Go to Session Brain →</a>
  </div>
</body>
</html>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code } = req.query as { code?: string }

  if (!code) {
    return res.status(400).send('Missing code parameter from GitHub')
  }

  // Exchange code for app credentials
  const convRes = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!convRes.ok) {
    const err = await convRes.text()
    return res.status(500).send(`GitHub conversion failed: ${err}`)
  }

  const app = await convRes.json() as GitHubAppConversion
  const { client_id, client_secret, slug } = app

  // Try to auto-write to Vercel
  const vercelToken = process.env.VERCEL_ACCESS_TOKEN
  const vercelProjectId = process.env.VERCEL_PROJECT_ID ?? process.env.VERCEL_PROJECT_PRODUCTION_URL

  let autoConfigured = false
  if (vercelToken && vercelProjectId) {
    const [ok1, ok2] = await Promise.all([
      writeVercelEnv('GITHUB_CLIENT_ID', client_id, vercelToken, vercelProjectId),
      writeVercelEnv('GITHUB_CLIENT_SECRET', client_secret, vercelToken, vercelProjectId),
    ])
    autoConfigured = ok1 && ok2
  }

  const manualVars = autoConfigured ? undefined :
    `GITHUB_CLIENT_ID=${client_id}\nGITHUB_CLIENT_SECRET=${client_secret}`

  res.setHeader('Content-Type', 'text/html')
  res.status(200).send(successPage(slug, client_id, autoConfigured, manualVars))
}
