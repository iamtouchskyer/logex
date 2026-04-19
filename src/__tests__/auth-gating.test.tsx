import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

// jsdom polyfill for matchMedia (used by useTheme)
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    value: (q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  })
}

// Mock data loader so we don't hit /api/articles/* during the test
vi.mock('../lib/data', () => ({
  loadAllArticles: vi.fn(async () => []),
}))
// Mock auth hook: parametrized per test via mutable object
const authState = { user: null as null | { login: string; name: string | null; avatar: string | null }, loading: false }
vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

import App from '../App'

function setHash(h: string) {
  window.history.replaceState(null, '', '#' + h)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

describe('App auth gating', () => {
  const origLocation = window.location
  let hrefSetter: string | null = null

  beforeEach(() => {
    authState.user = null
    authState.loading = false
    hrefSetter = null
    // Replace window.location with a proxy that captures href assignments.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new Proxy(origLocation, {
        get(t, p) {
          if (p === 'href') return origLocation.href
          return (t as unknown as Record<string | symbol, unknown>)[p as string]
        },
        set(_t, p, v) {
          if (p === 'href') { hrefSetter = v; return true }
          ;(origLocation as unknown as Record<string, unknown>)[p as string] = v
          return true
        },
      }),
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: origLocation })
    cleanup()
  })

  it('unauthenticated user on `/` is redirected to /api/auth/login', async () => {
    setHash('/')
    render(<App />)
    await waitFor(() => expect(hrefSetter).toBe('/api/auth/login'))
    expect(screen.getByText(/Redirecting to GitHub sign-in/)).toBeInTheDocument()
  })

  it('unauthenticated user on /share/:id is NOT redirected (public)', async () => {
    setHash('/share/abcdef123456')
    render(<App />)
    await new Promise((r) => setTimeout(r, 10))
    expect(hrefSetter).toBeNull()
  })

  it('unauthenticated user on /logged-out is NOT redirected (public)', async () => {
    setHash('/logged-out')
    render(<App />)
    await new Promise((r) => setTimeout(r, 10))
    expect(hrefSetter).toBeNull()
    expect(screen.getByRole('heading', { name: /Signed out/i })).toBeInTheDocument()
  })

  it('authenticated user on `/` renders the app shell, no redirect', async () => {
    authState.user = { login: 'alice', name: null, avatar: null }
    setHash('/')
    render(<App />)
    await new Promise((r) => setTimeout(r, 10))
    expect(hrefSetter).toBeNull()
  })

  it('auth loading shows spinner', () => {
    authState.loading = true
    render(<App />)
    expect(document.querySelector('.state-message__spinner')).not.toBeNull()
  })
})
