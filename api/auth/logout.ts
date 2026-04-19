import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Match login's cookie attributes exactly — per RFC6265 §5.3 some browsers
  // treat a clear that drops `Secure`/`SameSite` as a distinct cookie and
  // leave the live session cookie untouched.
  const isLocal = !process.env.VERCEL_URL
  const secure = isLocal ? '' : ' Secure;'
  res.setHeader('Set-Cookie', `session=; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=0`)
  // Redirect to the public Landing page. The app renders Landing for any
  // unauth user (no auto-redirect to GitHub), so there's no silent re-login
  // loop. The ?signed_out=1 query triggers a brief "Signed out." flash on
  // the landing so the user gets feedback.
  res.redirect('/?signed_out=1')
}
