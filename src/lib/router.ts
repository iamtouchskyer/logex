import { useState, useEffect, useCallback } from 'react'
import type { Lang } from '../pipeline/types'

interface Route {
  path: string
  params: Record<string, string>
  lang: Lang
}

const LANG_KEY = 'logex.lang'

/** Detect initial language preference: localStorage → navigator.language → 'en'. */
export function detectInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored === 'zh' || stored === 'en') return stored
  } catch { /* ignore */ }
  const nav = typeof navigator !== 'undefined' ? navigator.language ?? '' : ''
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function persistLang(lang: Lang): void {
  try { localStorage.setItem(LANG_KEY, lang) } catch { /* ignore */ }
}

/**
 * Extract a lang prefix from a hash path ("/zh/articles/x" → { lang: 'zh', rest: '/articles/x' }).
 * Returns `{ lang: null, rest: hash }` if no prefix is present.
 */
export function splitLangPrefix(hash: string): { lang: Lang | null; rest: string } {
  const m = hash.match(/^\/(zh|en)(\/.*)?$/)
  if (!m) return { lang: null, rest: hash }
  return { lang: m[1] as Lang, rest: m[2] ?? '/' }
}

export function parseHash(): Route {
  const hash = window.location.hash.slice(1) || '/'

  // Share route is lang-independent — keep it at top level
  const shareMatch = hash.match(/^\/share\/([^/]+)$/)
  if (shareMatch) {
    return { path: '/share/:id', params: { id: shareMatch[1] }, lang: detectInitialLang() }
  }

  const { lang: prefix, rest } = splitLangPrefix(hash)
  const lang: Lang = prefix ?? detectInitialLang()
  // If no lang prefix was in the URL, persist the detected one so future nav is stable.
  if (!prefix) persistLang(lang)
  else persistLang(prefix)

  const path = rest

  const articleMatch = path.match(/^\/articles\/([^/]+)$/)
  if (articleMatch) {
    return { path: '/articles/:slug', params: { slug: articleMatch[1] }, lang }
  }
  if (path === '/articles' || path === '/') {
    return { path: '/', params: {}, lang }
  }
  if (path === '/timeline') {
    return { path: '/timeline', params: {}, lang }
  }
  if (path === '/settings/shares') {
    return { path: '/settings/shares', params: {}, lang }
  }

  return { path: '/', params: {}, lang }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash)

  useEffect(() => {
    const handler = () => setRoute(parseHash())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  return route
}

/** Current lang shorthand. */
export function useLang(): Lang {
  return useRoute().lang
}

/**
 * Navigate to a path. If the path starts with `/share/` it is used as-is
 * (lang-independent). Otherwise, the current lang prefix is injected.
 *
 * `path` can be either the "bare" path ("/articles/foo") or already
 * lang-prefixed ("/zh/articles/foo") — both are handled.
 */
export function navigate(path: string, lang?: Lang): void {
  // Share pages are lang-free
  if (path.startsWith('/share/')) {
    window.location.hash = path
    return
  }
  const { lang: existingPrefix, rest } = splitLangPrefix(path)
  const target = lang ?? existingPrefix ?? (parseHash().lang)
  const bare = existingPrefix ? rest : path
  window.location.hash = `/${target}${bare === '/' ? '/' : bare}`
}

/** Swap the current lang, preserving the current page. */
export function setLang(lang: Lang): void {
  persistLang(lang)
  const { rest } = splitLangPrefix(window.location.hash.slice(1) || '/')
  // Share pages: don't touch the URL
  if (rest.startsWith('/share/')) return
  window.location.hash = `/${lang}${rest === '/' ? '/' : rest}`
}

export function useNavigate(): (path: string) => void {
  return useCallback((path: string) => navigate(path), [])
}
