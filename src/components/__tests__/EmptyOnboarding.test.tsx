import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EmptyOnboarding } from '../EmptyOnboarding'

describe('EmptyOnboarding', () => {
  it('renders 3 CLI steps with login injected into the mkdir command', () => {
    render(<EmptyOnboarding login="alice" />)
    expect(screen.getByText(/Get started with logex/)).toBeInTheDocument()
    expect(screen.getByText(/npm install -g @touchskyer\/logex/)).toBeInTheDocument()
    expect(screen.getByText(/mkdir alice\/logex-data/)).toBeInTheDocument()
    expect(screen.getByText(/logex write/)).toBeInTheDocument()
    cleanup()
  })

  it('uses <login> placeholder when login not supplied', () => {
    render(<EmptyOnboarding />)
    expect(screen.getByText(/mkdir <login>\/logex-data/)).toBeInTheDocument()
    cleanup()
  })

  it('renders error + retry button when error passed', () => {
    const onRetry = vi.fn()
    render(<EmptyOnboarding login="alice" error="Something exploded" onRetry={onRetry} />)
    expect(screen.getByText('Something exploded')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(btn)
    expect(onRetry).toHaveBeenCalledOnce()
    cleanup()
  })

  it('renders error without retry button when onRetry missing', () => {
    render(<EmptyOnboarding login="alice" error="err" />)
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    cleanup()
  })

  it('each code block is keyboard-focusable (tabIndex=0)', () => {
    render(<EmptyOnboarding login="alice" />)
    const pres = document.querySelectorAll('pre')
    expect(pres.length).toBeGreaterThanOrEqual(3)
    pres.forEach((p) => expect(p.getAttribute('tabindex')).toBe('0'))
    cleanup()
  })
})
