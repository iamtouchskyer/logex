/**
 * ArticleCard unit tests — U4.1
 *
 * Mock boundary: none. Uses real router (navigates via window.location.hash).
 * Exercises: gradient fallback (no heroImage), image render + onError → gradient,
 * meta rendering, tags, stats pills, keyboard + click navigation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArticleCard } from '../ArticleCard'
import type { ArticleMeta } from '../../lib/storage/types'

function makeArticle(overrides: Partial<ArticleMeta> = {}): ArticleMeta {
  // Use "Today" so formatDate hits the early-return path deterministically.
  return {
    slug: 'test-slug',
    title: 'Test Title',
    summary: 'A test summary of the article.',
    date: new Date().toISOString(),
    tags: [],
    project: 'logex',
    path: '/articles/test-slug',
    lang: 'en',
    primaryLang: 'en',
    availableLangs: ['en'],
    ...overrides,
  }
}

describe('ArticleCard', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it('renders title, summary, and project badge', () => {
    render(<ArticleCard article={makeArticle({ title: 'Hello World' })} />)
    expect(screen.getByRole('heading', { name: 'Hello World' })).toBeInTheDocument()
    expect(screen.getByText('A test summary of the article.')).toBeInTheDocument()
    // ProjectBadge renders project name — there are two places ("logex"):
    // the gradient fallback span AND the badge. Use getAllByText.
    expect(screen.getAllByText('logex').length).toBeGreaterThanOrEqual(1)
  })

  it('renders gradient fallback when heroImage is absent', () => {
    const { container } = render(<ArticleCard article={makeArticle()} />)
    expect(container.querySelector('.article-card__hero-gradient')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders <img> when heroImage is provided', () => {
    const { container } = render(
      <ArticleCard
        article={makeArticle({ heroImage: 'https://example.com/hero.png' })}
      />,
    )
    // alt="" makes the image presentational — no img role — query by tag.
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toBe('https://example.com/hero.png')
    expect(container.querySelector('.article-card__hero-gradient')).toBeNull()
  })

  it('falls back to gradient when <img> fires onError', () => {
    const { container } = render(
      <ArticleCard
        article={makeArticle({ heroImage: 'https://broken.example.com/x.png' })}
      />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    // Simulate the image failing to load
    fireEvent.error(img!)
    // Now gradient should render instead
    expect(container.querySelector('.article-card__hero-gradient')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('applies project-specific gradient color', () => {
    const { container } = render(
      <ArticleCard article={makeArticle({ project: 'mitsein' })} />,
    )
    const gradient = container.querySelector(
      '.article-card__hero-gradient',
    ) as HTMLElement
    // mitsein gradient uses #06b6d4 → jsdom normalizes to rgb(6, 182, 212)
    expect(gradient.style.background).toContain('rgb(6, 182, 212)')
  })

  it('applies DEFAULT_GRADIENT for unknown project', () => {
    const { container } = render(
      <ArticleCard article={makeArticle({ project: 'unknown-xyz' })} />,
    )
    const gradient = container.querySelector(
      '.article-card__hero-gradient',
    ) as HTMLElement
    // default gradient uses #3b82f6 → rgb(59, 130, 246)
    expect(gradient.style.background).toContain('rgb(59, 130, 246)')
  })

  it('renders "Today" for same-day date', () => {
    render(<ArticleCard article={makeArticle()} />)
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('renders "Yesterday" for 1-day-old article', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    render(<ArticleCard article={makeArticle({ date: yesterday })} />)
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
  })

  it('renders "N days ago" for <7 days old', () => {
    const threeDays = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    render(<ArticleCard article={makeArticle({ date: threeDays })} />)
    expect(screen.getByText('3 days ago')).toBeInTheDocument()
  })

  it('renders "1 week ago" for 7-13 day range', () => {
    const tenDays = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    render(<ArticleCard article={makeArticle({ date: tenDays })} />)
    expect(screen.getByText('1 week ago')).toBeInTheDocument()
  })

  it('renders "N weeks ago" for 14-29 days old', () => {
    const twentyDays = new Date(
      Date.now() - 20 * 24 * 60 * 60 * 1000,
    ).toISOString()
    render(<ArticleCard article={makeArticle({ date: twentyDays })} />)
    expect(screen.getByText('2 weeks ago')).toBeInTheDocument()
  })

  it('renders absolute date for ≥30 days old', () => {
    const old = new Date('2020-05-15T12:00:00Z').toISOString()
    render(<ArticleCard article={makeArticle({ date: old })} />)
    // Locale-formatted — check for "May" and 2020
    expect(screen.getByText(/May/i)).toBeInTheDocument()
    expect(screen.getByText(/2020/)).toBeInTheDocument()
  })

  it('renders duration when provided', () => {
    render(<ArticleCard article={makeArticle({ duration: '3h 20min' })} />)
    expect(screen.getByText('3h 20min')).toBeInTheDocument()
  })

  it('does not render duration element when undefined', () => {
    const { container } = render(<ArticleCard article={makeArticle()} />)
    // Only date + badge → no duration text; check no "h " patterns in meta
    const meta = container.querySelector('.article-card__meta')
    expect(meta?.textContent).not.toMatch(/\dh/)
  })

  it('renders tags when provided', () => {
    render(
      <ArticleCard
        article={makeArticle({ tags: ['typescript', 'testing'] })}
      />,
    )
    expect(screen.getByText('typescript')).toBeInTheDocument()
    expect(screen.getByText('testing')).toBeInTheDocument()
  })

  it('does not render tags container when tags is empty', () => {
    const { container } = render(<ArticleCard article={makeArticle({ tags: [] })} />)
    expect(container.querySelector('.article-card__tags')).toBeNull()
  })

  it('does not render tags container when tags is missing', () => {
    const a = makeArticle()
    // @ts-expect-error — intentionally test runtime tolerance for missing tags
    delete a.tags
    const { container } = render(<ArticleCard article={a} />)
    expect(container.querySelector('.article-card__tags')).toBeNull()
  })

  it('renders rich stats pills (tokens + cost) when available', () => {
    render(
      <ArticleCard
        article={makeArticle({
          stats: {
            entries: 100,
            messages: 50,
            chunks: 10,
            tokens: {
              input: 10_000,
              output: 5_000,
              cache_creation: 1_000,
              cache_read: 500,
              total: 16_500,
            },
            costEstimate: { total_cost: 2.3456, currency: 'USD' },
          },
        })}
      />,
    )
    // tokens: 16500 / 1000 = 16.5 → toFixed(0) = "17"
    expect(screen.getByText(/17K tokens/)).toBeInTheDocument()
    // cost: 2.3456 → $2.35
    expect(screen.getByText(/\$2\.35/)).toBeInTheDocument()
  })

  it('renders tokens pill without cost when costEstimate missing', () => {
    const { container } = render(
      <ArticleCard
        article={makeArticle({
          stats: {
            entries: 1,
            messages: 1,
            chunks: 1,
            tokens: {
              input: 500,
              output: 500,
              cache_creation: 0,
              cache_read: 0,
              total: 1000,
            },
          },
        })}
      />,
    )
    expect(screen.getByText(/1K tokens/)).toBeInTheDocument()
    expect(container.querySelector('.article-card__stat-pill--cost')).toBeNull()
  })

  it('does not render stats pills when stats lack tokens', () => {
    const { container } = render(
      <ArticleCard
        article={makeArticle({
          stats: { entries: 1, messages: 1, chunks: 1 },
        })}
      />,
    )
    expect(container.querySelector('.article-card__stats')).toBeNull()
  })

  it('has accessible button role with aria-label', () => {
    render(<ArticleCard article={makeArticle({ title: 'Read Me' })} />)
    const btn = screen.getByRole('button', { name: /read: read me/i })
    expect(btn).toHaveAttribute('tabIndex', '0')
  })

  it('click navigates to /articles/:slug', async () => {
    const user = userEvent.setup()
    render(<ArticleCard article={makeArticle({ slug: 'click-slug' })} />)
    await user.click(screen.getByRole('button', { name: /read:/i }))
    // navigate() with no lang prefix uses parseHash().lang → injects "/en/" or "/zh/"
    expect(window.location.hash).toMatch(/#\/(en|zh)\/articles\/click-slug/)
  })

  it('Enter key navigates to article', () => {
    render(<ArticleCard article={makeArticle({ slug: 'kb-slug' })} />)
    const card = screen.getByRole('button', { name: /read:/i })
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(window.location.hash).toMatch(/#\/(en|zh)\/articles\/kb-slug/)
  })

  it('Space key navigates to article', () => {
    render(<ArticleCard article={makeArticle({ slug: 'sp-slug' })} />)
    const card = screen.getByRole('button', { name: /read:/i })
    fireEvent.keyDown(card, { key: ' ' })
    expect(window.location.hash).toMatch(/#\/(en|zh)\/articles\/sp-slug/)
  })

  it('other keys do NOT navigate', () => {
    render(<ArticleCard article={makeArticle({ slug: 'no-nav' })} />)
    const card = screen.getByRole('button', { name: /read:/i })
    fireEvent.keyDown(card, { key: 'a' })
    expect(window.location.hash).toBe('')
  })
})
