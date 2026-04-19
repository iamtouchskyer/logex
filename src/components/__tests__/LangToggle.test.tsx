/**
 * LangToggle unit tests — U6.1
 *
 * Mock boundary: none. Uses real router (setLang mutates window.location.hash).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LangToggle } from '../LangToggle'

describe('LangToggle', () => {
  beforeEach(() => {
    window.location.hash = '#/en/'
  })
  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it('renders both zh and en buttons', () => {
    render(<LangToggle />)
    expect(screen.getByRole('button', { name: /zh|中/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /en|eng/i })).toBeInTheDocument()
  })

  it('marks the current language button with aria-pressed=true', () => {
    window.location.hash = '#/en/'
    render(<LangToggle />)
    const buttons = screen.getAllByRole('button')
    const en = buttons.find((b) => b.textContent === 'EN')!
    const zh = buttons.find((b) => b.textContent === 'ZH')!
    expect(en.getAttribute('aria-pressed')).toBe('true')
    expect(zh.getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking inactive lang updates window.location.hash to new lang', () => {
    window.location.hash = '#/en/articles'
    render(<LangToggle />)
    const zh = screen.getAllByRole('button').find((b) => b.textContent === 'ZH')!
    fireEvent.click(zh)
    expect(window.location.hash).toMatch(/^#\/zh\//)
  })

  it('clicking the already-active lang does NOT change hash (no-op branch)', () => {
    window.location.hash = '#/en/articles'
    render(<LangToggle />)
    const en = screen.getAllByRole('button').find((b) => b.textContent === 'EN')!
    const before = window.location.hash
    fireEvent.click(en)
    expect(window.location.hash).toBe(before)
  })
})
