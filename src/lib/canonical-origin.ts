/**
 * Canonical public origin for building shareable URLs. Preview deploys
 * (logex-*.vercel.app) would otherwise bake their preview hostname into
 * share URLs, which breaks after the preview expires and requires SSO.
 *
 * Uses VITE_PUBLIC_ORIGIN if set (production), falls back to
 * window.location.origin in dev / local.
 */
export function getCanonicalOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_ORIGIN
  if (typeof configured === 'string' && configured.startsWith('https://')) {
    return configured.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}
