/**
 * SearchBar unit tests — U6.1
 *
 * Mock boundary: none. Exercises real onChange wiring, clear button conditional
 * rendering, and placeholder default via real i18n.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SearchBar } from '../SearchBar'

describe('SearchBar', () => {
  afterEach(() => cleanup())

  it('renders with i18n default placeholder when not provided', () => {
    render(<SearchBar value="" onChange={() => {}} />)
    const input = screen.getByRole('searchbox') as HTMLInputElement
    // Real i18n resolves 'search.placeholder' — must not be the raw key
    expect(input.placeholder).not.toBe('search.placeholder')
    expect(input.placeholder.length).toBeGreaterThan(0)
  })

  it('uses provided placeholder over i18n default', () => {
    render(<SearchBar value="" onChange={() => {}} placeholder="Find articles..." />)
    expect((screen.getByRole('searchbox') as HTMLInputElement).placeholder).toBe(
      'Find articles...',
    )
  })

  it('does NOT render clear button when value is empty', () => {
    render(<SearchBar value="" onChange={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders clear button when value is non-empty', () => {
    render(<SearchBar value="foo" onChange={() => {}} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('fires onChange with the typed value (real input event)', () => {
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'hello' } })
    expect(onChange).toHaveBeenCalledWith('hello')
  })

  it('clear button clears the value via onChange("")', () => {
    const onChange = vi.fn()
    render(<SearchBar value="stuff" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('reflects current controlled value in input', () => {
    render(<SearchBar value="initial" onChange={() => {}} />)
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('initial')
  })
})
