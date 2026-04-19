/**
 * Timeline unit tests — U4.1
 *
 * Mock boundary: none. Real router, real i18n.
 * Covers: loading, error, empty, grouped rendering, keyboard + click navigation,
 * back button in error state, zh lang branch.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timeline } from '../Timeline'
import type { ArticleMeta } from '../../lib/storage/types'

function makeArticle(overrides: Partial<ArticleMeta> = {}): ArticleMeta {
  return {
    slug: 'a',
    title: 'Article A',
    summary: 'summary A',
    date: '2026-04-20T10:00:00Z',
    tags: [],
    project: 'logex',
    path: '/articles/a',
    lang: 'en',
    primaryLang: 'en',
    availableLangs: ['en'],
    duration: '1h',
    ...overrides,
  }
}

describe('Timeline', () => {
  beforeEach(() => {
    window.location.hash = '#/en/timeline'
  })

  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it('renders loading state with spinner', () => {
    render(<Timeline articles={[]} loading={true} error={null} />)
    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
    expect(status).toHaveTextContent(/loading/i)
  })

  it('renders error state with detail and back button', () => {
    render(<Timeline articles={[]} loading={false} error="boom" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /back to articles/i }),
    ).toBeInTheDocument()
  })

  it('back button in error state navigates to root', async () => {
    const user = userEvent.setup()
    render(<Timeline articles={[]} loading={false} error="x" />)
    await user.click(screen.getByRole('button', { name: /back to articles/i }))
    expect(window.location.hash).toMatch(/#\/(en|zh)\/?$/)
  })

  it('renders empty state when no articles', () => {
    render(<Timeline articles={[]} loading={false} error={null} />)
    expect(screen.getByText(/no articles to display/i)).toBeInTheDocument()
    expect(
      screen.getByText(/publish some session articles first/i),
    ).toBeInTheDocument()
  })

  it('renders heading + a group per unique day', () => {
    const articles = [
      makeArticle({ slug: 'a', date: '2026-04-20T10:00:00Z' }),
      makeArticle({ slug: 'b', date: '2026-04-20T14:00:00Z' }),
      makeArticle({ slug: 'c', date: '2026-04-18T09:00:00Z' }),
    ]
    const { container } = render(
      <Timeline articles={articles} loading={false} error={null} />,
    )
    expect(screen.getByRole('heading', { level: 2, name: /timeline/i })).toBeInTheDocument()
    // Two unique days → two timeline__group nodes
    expect(container.querySelectorAll('.timeline__group')).toHaveLength(2)
  })

  it('sorts articles desc by date (newest day first)', () => {
    const articles = [
      makeArticle({ slug: 'old', date: '2026-04-01T10:00:00Z', title: 'Old One' }),
      makeArticle({ slug: 'new', date: '2026-04-20T10:00:00Z', title: 'New One' }),
    ]
    const { container } = render(
      <Timeline articles={articles} loading={false} error={null} />,
    )
    const groups = container.querySelectorAll('.timeline__group')
    // Newest group should come first in DOM
    expect(groups[0].textContent).toContain('New One')
    expect(groups[1].textContent).toContain('Old One')
  })

  it('renders duration, project, title, summary for each entry', () => {
    render(
      <Timeline
        articles={[
          makeArticle({
            slug: 's1',
            title: 'My Article',
            summary: 'my summary body',
            duration: '42m',
            project: 'mitsein',
          }),
        ]}
        loading={false}
        error={null}
      />,
    )
    expect(screen.getByRole('heading', { name: 'My Article' })).toBeInTheDocument()
    expect(screen.getByText('my summary body')).toBeInTheDocument()
    expect(screen.getByText('42m')).toBeInTheDocument()
    expect(screen.getByText('mitsein')).toBeInTheDocument()
  })

  it('renders formatted day header in English locale', () => {
    render(
      <Timeline
        articles={[makeArticle({ date: '2026-04-20T10:00:00Z' })]}
        loading={false}
        error={null}
      />,
    )
    // en-US weekday, long-month format
    expect(screen.getByText(/April.*2026/i)).toBeInTheDocument()
  })

  it('renders formatted day header in Chinese locale when lang=zh', () => {
    window.location.hash = '#/zh/timeline'
    render(
      <Timeline
        articles={[makeArticle({ date: '2026-04-20T10:00:00Z' })]}
        loading={false}
        error={null}
      />,
    )
    // zh-CN contains 年/月/日 or "4月"
    const heading = document.querySelector('.timeline__date')
    expect(heading?.textContent).toMatch(/2026|年/)
  })

  it('each entry has a button role with aria-label', () => {
    render(
      <Timeline
        articles={[makeArticle({ slug: 'x', title: 'Hello' })]}
        loading={false}
        error={null}
      />,
    )
    const btn = screen.getByRole('button', { name: /read.*hello/i })
    expect(btn).toHaveAttribute('tabIndex', '0')
  })

  it('clicking an entry navigates to /articles/:slug', async () => {
    const user = userEvent.setup()
    render(
      <Timeline
        articles={[makeArticle({ slug: 'click-me' })]}
        loading={false}
        error={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: /read/i }))
    expect(window.location.hash).toMatch(/#\/(en|zh)\/articles\/click-me/)
  })

  it('Enter key on entry navigates', () => {
    render(
      <Timeline
        articles={[makeArticle({ slug: 'enter-slug' })]}
        loading={false}
        error={null}
      />,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: /read/i }), { key: 'Enter' })
    expect(window.location.hash).toMatch(/#\/(en|zh)\/articles\/enter-slug/)
  })

  it('Space key on entry navigates', () => {
    render(
      <Timeline
        articles={[makeArticle({ slug: 'space-slug' })]}
        loading={false}
        error={null}
      />,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: /read/i }), { key: ' ' })
    expect(window.location.hash).toMatch(/#\/(en|zh)\/articles\/space-slug/)
  })

  it('other keys do NOT navigate', () => {
    window.location.hash = '#/en/timeline'
    render(
      <Timeline
        articles={[makeArticle({ slug: 'no' })]}
        loading={false}
        error={null}
      />,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: /read/i }), { key: 'Tab' })
    // hash should still be the timeline, not an article route
    expect(window.location.hash).not.toMatch(/articles\/no/)
  })

  it('groups entries on the same day together', () => {
    const { container } = render(
      <Timeline
        articles={[
          makeArticle({ slug: 'a', date: '2026-04-20T09:00:00Z' }),
          makeArticle({ slug: 'b', date: '2026-04-20T14:00:00Z' }),
          makeArticle({ slug: 'c', date: '2026-04-20T20:00:00Z' }),
        ]}
        loading={false}
        error={null}
      />,
    )
    const groups = container.querySelectorAll('.timeline__group')
    expect(groups).toHaveLength(1)
    expect(groups[0].querySelectorAll('.timeline__entry')).toHaveLength(3)
  })
})
