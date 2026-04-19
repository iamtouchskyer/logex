import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LoggedOutPage } from '../pages/LoggedOutPage'

describe('LoggedOutPage', () => {
  const origLocation = window.location
  let hrefSetter: string | null = null

  beforeEach(() => {
    hrefSetter = null
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

  it('renders bilingual signed-out heading', () => {
    render(<LoggedOutPage />)
    expect(screen.getByRole('heading', { name: /Signed out/i })).toBeInTheDocument()
    expect(screen.getByText(/Your session on logex-io has ended\./)).toBeInTheDocument()
  })

  it('renders a focused "Log in with GitHub" button that navigates to /api/auth/login', () => {
    render(<LoggedOutPage />)
    const btn = screen.getByRole('button', { name: /Log in with GitHub/i })
    expect(btn).toBeInTheDocument()
    // Focus moved to the primary action for keyboard users.
    expect(document.activeElement).toBe(btn)
    btn.click()
    expect(hrefSetter).toBe('/api/auth/login')
  })

  it('exposes a labelled main landmark (a11y)', () => {
    render(<LoggedOutPage />)
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('aria-labelledby', 'logged-out-title')
  })
})
