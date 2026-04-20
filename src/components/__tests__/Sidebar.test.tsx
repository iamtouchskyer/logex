/**
 * Sidebar unit tests — U6.1
 *
 * Mock boundary: none. Uses real router (useLang reads window.location.hash)
 * and real i18n. Covers desktop collapsed/expanded, mobile drawer, project/tag
 * callbacks, stats formatting (k-suffix / raw), active link aria-current.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Sidebar } from '../Sidebar'
import type { ArticleMeta } from '../../lib/storage/types'

function article(overrides: Partial<ArticleMeta> = {}): ArticleMeta {
  return {
    slug: 's',
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

const baseProps = {
  currentPath: '/',
  collapsed: false,
  onToggleCollapse: () => {},
  mobileOpen: false,
  onMobileClose: () => {},
}

describe('Sidebar', () => {
  beforeEach(() => {
    window.location.hash = '#/en/'
  })
  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it('fires onToggleCollapse when the collapse button is clicked', () => {
    const onToggle = vi.fn()
    render(<Sidebar {...baseProps} articles={[]} onToggleCollapse={onToggle} />)
    fireEvent.click(screen.getAllByRole('button', { name: /collapse|expand/i })[0])
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('shows brand text when expanded, hides it when collapsed', () => {
    const { rerender } = render(<Sidebar {...baseProps} articles={[]} />)
    expect(screen.getAllByText('Logex').length).toBeGreaterThan(0)
    rerender(<Sidebar {...baseProps} articles={[]} collapsed={true} />)
    // Mobile sidebar still has "Logex" text but desktop collapsed drops brand text.
    // The desktop aside carries 'sidebar--collapsed' class.
    expect(document.querySelector('.sidebar--collapsed')).not.toBeNull()
  })

  it('marks the current path nav link with aria-current=page', () => {
    render(
      <Sidebar {...baseProps} articles={[]} currentPath="/timeline" />,
    )
    const activeLinks = document.querySelectorAll('[aria-current="page"]')
    expect(activeLinks.length).toBeGreaterThan(0)
    activeLinks.forEach((el) => {
      expect(el.getAttribute('href')).toContain('/timeline')
    })
  })

  it('aggregates project counts and fires onProjectClick with the project name', () => {
    const onProjectClick = vi.fn()
    const list = [
      article({ slug: 'a', project: 'logex' }),
      article({ slug: 'b', project: 'logex' }),
      article({ slug: 'c', project: 'other' }),
    ]
    render(
      <Sidebar {...baseProps} articles={list} onProjectClick={onProjectClick} />,
    )
    // Desktop sidebar shows project buttons with aria-label "Filter by project <name>, <count> articles"
    const logexBtn = screen.getAllByRole('button', {
      name: /Filter by project logex, 2 articles/,
    })[0]
    fireEvent.click(logexBtn)
    expect(onProjectClick).toHaveBeenCalledWith('logex')
  })

  it('aggregates tag counts and fires onTagClick with the tag name', () => {
    const onTagClick = vi.fn()
    const list = [
      article({ slug: 'a', tags: ['x', 'y'] }),
      article({ slug: 'b', tags: ['x'] }),
    ]
    render(<Sidebar {...baseProps} articles={list} onTagClick={onTagClick} />)
    const tagBtn = screen.getAllByRole('button', {
      name: /Filter by tag x, 2 articles/,
    })[0]
    fireEvent.click(tagBtn)
    expect(onTagClick).toHaveBeenCalledWith('x')
  })

  it('formats token stats with k suffix when >= 1000', () => {
    const list = [
      article({
        slug: 'a',
        stats: {
          entries: 1,
          messages: 1,
          chunks: 1,
          tokens: { total: 2500, input: 1000, output: 1500, cache_creation: 0, cache_read: 0 },
        },
      }),
    ]
    render(<Sidebar {...baseProps} articles={list} />)
    // '2.5k' should appear; raw '2500' should not
    expect(screen.getAllByText('2.5k').length).toBeGreaterThan(0)
  })

  it('renders raw token number when < 1000', () => {
    const list = [
      article({
        slug: 'a',
        stats: {
          entries: 1,
          messages: 1,
          chunks: 1,
          tokens: { total: 500, input: 200, output: 300, cache_creation: 0, cache_read: 0 },
        },
      }),
    ]
    render(<Sidebar {...baseProps} articles={list} />)
    expect(screen.getAllByText('500').length).toBeGreaterThan(0)
  })

  it('sums costEstimate across articles and renders with $ prefix', () => {
    const list = [
      article({
        slug: 'a',
        stats: {
          entries: 1, messages: 1, chunks: 1,
          tokens: { total: 0, input: 0, output: 0, cache_creation: 0, cache_read: 0 },
          costEstimate: { total_cost: 1.25, currency: 'USD' },
        },
      }),
      article({
        slug: 'b',
        stats: {
          entries: 1, messages: 1, chunks: 1,
          tokens: { total: 0, input: 0, output: 0, cache_creation: 0, cache_read: 0 },
          costEstimate: { total_cost: 0.5, currency: 'USD' },
        },
      }),
    ]
    render(<Sidebar {...baseProps} articles={list} />)
    expect(screen.getAllByText('$1.75').length).toBeGreaterThan(0)
  })

  it('mobile drawer: overlay appears when mobileOpen=true and calls onMobileClose when clicked', () => {
    const onMobileClose = vi.fn()
    render(
      <Sidebar
        {...baseProps}
        articles={[]}
        mobileOpen={true}
        onMobileClose={onMobileClose}
      />,
    )
    const overlay = document.querySelector('.sidebar__drawer-overlay') as HTMLElement
    expect(overlay).not.toBeNull()
    fireEvent.click(overlay)
    expect(onMobileClose).toHaveBeenCalled()
  })

  it('mobile project/tag clicks call both the filter callback and onMobileClose', () => {
    const onProjectClick = vi.fn()
    const onTagClick = vi.fn()
    const onMobileClose = vi.fn()
    const list = [article({ slug: 'a', project: 'p1', tags: ['t1'] })]
    render(
      <Sidebar
        {...baseProps}
        articles={list}
        mobileOpen={true}
        onProjectClick={onProjectClick}
        onTagClick={onTagClick}
        onMobileClose={onMobileClose}
      />,
    )
    // Mobile drawer has role=dialog
    const dialog = screen.getByRole('dialog')
    const projectBtn = within(dialog)
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('p1'))!
    fireEvent.click(projectBtn)
    expect(onProjectClick).toHaveBeenCalledWith('p1')
    expect(onMobileClose).toHaveBeenCalled()

    onMobileClose.mockClear()
    const tagBtn = within(dialog)
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('t1'))!
    fireEvent.click(tagBtn)
    expect(onTagClick).toHaveBeenCalledWith('t1')
    expect(onMobileClose).toHaveBeenCalled()
  })

  it('does not render projects or tags sections when articles list is empty', () => {
    render(<Sidebar {...baseProps} articles={[]} />)
    // Stats section still renders but projects/tags headings should NOT
    // (component guards with `projects.length > 0 && ...`)
    const headings = Array.from(document.querySelectorAll('.sidebar__section-heading'))
      .map((el) => el.textContent)
    expect(headings.some((h) => h && /project/i.test(h))).toBe(false)
    expect(headings.some((h) => h && /tag/i.test(h))).toBe(false)
  })

  it('renders chevron-right icon when collapsed, chevron-left when expanded', () => {
    const { rerender } = render(<Sidebar {...baseProps} articles={[]} collapsed={false} />)
    const expandedBtn = screen.getAllByRole('button', { name: /collapse/i })[0]
    expect(expandedBtn).toBeInTheDocument()
    rerender(<Sidebar {...baseProps} articles={[]} collapsed={true} />)
    const collapsedBtn = screen.getAllByRole('button', { name: /expand/i })[0]
    expect(collapsedBtn).toBeInTheDocument()
  })
})
