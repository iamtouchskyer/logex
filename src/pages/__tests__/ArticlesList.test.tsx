/**
 * ArticlesList unit tests — U6.1
 *
 * Mock boundary: none. Uses real ArticleCard + SearchBar children and real i18n.
 * Exercises loading / error / empty / populated, project filter toggle, search
 * across title/summary/tags, search-no-results branch.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ArticlesList } from '../ArticlesList'
import type { ArticleMeta } from '../../lib/storage/types'

function a(overrides: Partial<ArticleMeta> = {}): ArticleMeta {
  return {
    slug: overrides.slug ?? 's',
    title: 'T',
    summary: 'sum',
    date: new Date().toISOString(),
    tags: [],
    project: 'logex',
    path: '/articles/s',
    lang: 'en',
    primaryLang: 'en',
    availableLangs: ['en'],
    ...overrides,
  }
}

describe('ArticlesList', () => {
  afterEach(() => cleanup())

  it('shows loading state with role=status', () => {
    render(<ArticlesList articles={[]} loading={true} error={null} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows error state with role=alert and detail', () => {
    render(<ArticlesList articles={[]} loading={false} error="boom" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })

  it('shows empty-list state when no articles', () => {
    render(<ArticlesList articles={[]} loading={false} error={null} />)
    // noneFound message rendered in both sr-only status + main state-message
    expect(document.querySelectorAll('.articles-feed').length).toBe(0)
  })

  it('renders all articles when ALL project active', () => {
    const list = [a({ slug: 'x', title: 'Alpha' }), a({ slug: 'y', title: 'Beta', project: 'other' })]
    render(<ArticlesList articles={list} loading={false} error={null} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('filters by project when project button clicked', () => {
    const list = [
      a({ slug: 'x', title: 'Alpha', project: 'logex' }),
      a({ slug: 'y', title: 'Beta', project: 'other' }),
    ]
    render(<ArticlesList articles={list} loading={false} error={null} />)
    // Click the "other" project filter
    fireEvent.click(screen.getByRole('button', { name: 'other', pressed: false }))
    expect(screen.queryByText('Alpha')).toBeNull()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('filters by search query across title, summary, and tags', () => {
    const list = [
      a({ slug: 'x', title: 'Alpha', summary: 's1', tags: ['red'] }),
      a({ slug: 'y', title: 'Beta', summary: 'unique-summary', tags: ['blue'] }),
      a({ slug: 'z', title: 'Gamma', summary: 's3', tags: ['RedHat'] }),
    ]
    render(<ArticlesList articles={list} loading={false} error={null} />)
    const input = screen.getByRole('searchbox')

    fireEvent.change(input, { target: { value: 'alpha' } })
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).toBeNull()

    fireEvent.change(input, { target: { value: 'unique-summary' } })
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).toBeNull()

    fireEvent.change(input, { target: { value: 'red' } })
    // case-insensitive tag match: 'red' matches 'red' and 'RedHat'
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).toBeNull()
  })

  it('shows try-different hint when search yields zero results', () => {
    const list = [a({ slug: 'x', title: 'Alpha' })]
    render(<ArticlesList articles={list} loading={false} error={null} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzzzzz' } })
    expect(screen.queryByText('Alpha')).toBeNull()
    // Feed div should not render
    expect(document.querySelectorAll('.articles-feed').length).toBe(0)
  })

  it('toggles aria-pressed on active project filter button', () => {
    const list = [a({ slug: 'x', project: 'logex' }), a({ slug: 'y', project: 'other' })]
    render(<ArticlesList articles={list} loading={false} error={null} />)
    const logex = screen.getByRole('button', { name: 'logex' })
    expect(logex.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(logex)
    expect(logex.getAttribute('aria-pressed')).toBe('true')
  })
})
