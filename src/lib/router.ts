import { useState, useEffect, useCallback } from 'react'

interface Route {
  path: string
  params: Record<string, string>
}

function parseHash(): Route {
  const hash = window.location.hash.slice(1) || '/'

  // Match #/articles/:slug
  const articleMatch = hash.match(/^\/articles\/([^/]+)$/)
  if (articleMatch) {
    return { path: '/articles/:slug', params: { slug: articleMatch[1] } }
  }

  // Match #/articles
  if (hash === '/articles') {
    return { path: '/', params: {} }
  }

  // Match #/timeline
  if (hash === '/timeline') {
    return { path: '/timeline', params: {} }
  }

  // Match #/settings/shares
  if (hash === '/settings/shares') {
    return { path: '/settings/shares', params: {} }
  }

  // Default
  return { path: '/', params: {} }
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

export function navigate(path: string): void {
  window.location.hash = path
}

export function useNavigate(): (path: string) => void {
  return useCallback((path: string) => navigate(path), [])
}
