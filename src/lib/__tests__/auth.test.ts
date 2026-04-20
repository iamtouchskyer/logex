/**
 * F-5 regression: logout() must scrub every `logex.*` and `logex-*` key
 * from localStorage + sessionStorage. Otherwise user B (who logs into the
 * same tab after user A) inherits user A's UI state / drafts / prefs.
 *
 * Biting: seed logex.* keys + one foreign key, call scrubLogexStorage(),
 * assert logex.* keys gone, foreign key intact. Removing the scrub loop
 * from auth.ts makes this red.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { scrubLogexStorage } from '../auth'

describe('auth.scrubLogexStorage (F-5)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('removes every logex.* and logex-* key from localStorage', () => {
    localStorage.setItem('logex.draft.article-1', 'secret-body')
    localStorage.setItem('logex-sidebar-collapsed', 'true')
    localStorage.setItem('unrelated-theme', 'dark') // must survive

    scrubLogexStorage()

    expect(localStorage.getItem('logex.draft.article-1')).toBeNull()
    expect(localStorage.getItem('logex-sidebar-collapsed')).toBeNull()
    expect(localStorage.getItem('unrelated-theme')).toBe('dark')
  })

  it('removes every logex.* and logex-* key from sessionStorage', () => {
    sessionStorage.setItem('logex.session-token-hint', 'x')
    sessionStorage.setItem('logex-nav-state', 'collapsed')
    sessionStorage.setItem('foreign.key', 'keep-me')

    scrubLogexStorage()

    expect(sessionStorage.getItem('logex.session-token-hint')).toBeNull()
    expect(sessionStorage.getItem('logex-nav-state')).toBeNull()
    expect(sessionStorage.getItem('foreign.key')).toBe('keep-me')
  })

  it('is a no-op when there are no logex keys', () => {
    localStorage.setItem('other', 'a')
    scrubLogexStorage()
    expect(localStorage.getItem('other')).toBe('a')
  })

  it('handles a storage with many keys without skipping due to index shift', () => {
    // Removing keys mid-iteration shifts indexes — our impl collects then
    // deletes. Make sure nothing is skipped.
    for (let i = 0; i < 10; i++) localStorage.setItem(`logex.k${i}`, String(i))
    scrubLogexStorage()
    for (let i = 0; i < 10; i++) expect(localStorage.getItem(`logex.k${i}`)).toBeNull()
  })
})
