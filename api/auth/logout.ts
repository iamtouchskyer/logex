import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Match login's cookie attributes exactly — per RFC6265 §5.3 some browsers
  // treat a clear that drops `Secure`/`SameSite` as a distinct cookie and
  // leave the live session cookie untouched.
  const isLocal = !process.env.VERCEL_URL
  const secure = isLocal ? '' : ' Secure;'
  res.setHeader('Set-Cookie', `session=; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=0`)
  res.redirect('/')
}
