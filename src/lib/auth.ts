import { useState, useEffect } from 'react'
import { clearMemCache } from './storage/GitHubAdapter'

export interface User {
  login: string
  name: string | null
  avatar: string | null
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  return {
    user,
    loading,
    login: () => { window.location.href = '/api/auth/login' },
    logout: () => {
      // Drop any user-scoped cache before navigating so the next user who
      // logs into the same tab cannot read the previous user's data.
      clearMemCache()
      // F-5: also scrub persistent `logex.*` keys from localStorage +
      // sessionStorage. Any `logex-` prefixed key is app-scoped state (e.g.
      // `logex-sidebar-collapsed`, future per-user drafts). Leaving them
      // behind means user B sees user A's UI state / leaks.
      scrubLogexStorage()
      window.location.href = '/api/auth/logout'
    },
  }
}

/**
 * Remove every localStorage + sessionStorage key starting with `logex.` or
 * `logex-`. Exported for unit tests — not part of the public surface.
 */
export function scrubLogexStorage(): void {
  const isLogex = (k: string): boolean => k.startsWith('logex.') || k.startsWith('logex-')
  for (const store of [
    typeof localStorage !== 'undefined' ? localStorage : null,
    typeof sessionStorage !== 'undefined' ? sessionStorage : null,
  ]) {
    if (!store) continue
    try {
      const toDelete: string[] = []
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)
        if (k && isLogex(k)) toDelete.push(k)
      }
      for (const k of toDelete) {
        try { store.removeItem(k) } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
}
