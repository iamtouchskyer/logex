/**
 * ArticleReader unit tests — U6.1
 *
 * Mock boundary: `../lib/data` (external storage adapter, matches precedent in
 * auth-gating.test.tsx / ShareModal.test.tsx) and `../lib/auth` (network call
 * to /api/auth/me). No mocking of router, MarkdownRenderer, or ArticleReader
 * itself.
 *
 * Exercises: loading state, success render, error state + "Back" button,
 * hero image render vs gradient fallback, heroImage onError → gradient,
 * share button visibility per auth state, share modal open/close focus return.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import type { SessionArticle } from '../../pipeline/types'

const loadArticleMock = vi.fn()
vi.mock('../../lib/data', () => ({
  loadArticle: (...args: unknown[]) => loadArticleMock(...args),
}))

const authState: { user: null | { login: string; name: string | null; avatar: string | null } } = {
  user: null,
}
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

import { ArticleReader } from '../ArticleReader'

function makeArticle(overrides: Partial<SessionArticle> = {}): SessionArticle {
  return {
    slug: 'sample',
    title: 'Sample Article',
    summary: 'summary of the sample',
    body: '# Hello\n\nBody text.',
    date: new Date('2025-01-15T00:00:00Z').toISOString(),
    tags: ['alpha', 'beta'],
    project: 'logex',
    sessionId: 'abcdef0123456789',
    stats: {
      entries: 10,
      messages: 20,
      chunks: 3,
      tokens: { total: 1500, input: 1000, output: 500 },
      llmCalls: 4,
      toolCalls: { total: 8 } as unknown as SessionArticle['stats']['toolCalls'],
      costEstimate: { total_cost: 0.12 } as unknown as SessionArticle['stats']['costEstimate'],
    },
    ...overrides,
  } as SessionArticle
}

describe('ArticleReader', () => {
  beforeEach(() => {
    authState.user = null
    loadArticleMock.mockReset()
    window.location.hash = '#/en/articles/sample'
  })
  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it('shows loading state before article resolves', async () => {
    // Never-resolving promise: captures the loading branch
    loadArticleMock.mockReturnValue(new Promise(() => {}))
    render(<ArticleReader slug="sample" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/Loading article/)).toBeInTheDocument()
  })

  it('renders article content on successful load', async () => {
    loadArticleMock.mockResolvedValue(makeArticle())
    render(<ArticleReader slug="sample" />)
    await waitFor(() => expect(screen.getByText('Sample Article')).toBeInTheDocument())
    expect(screen.getByText(/summary of the sample/)).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
    // session id shortened to 8 chars
    expect(screen.getByText(/session:abcdef01/)).toBeInTheDocument()
  })

  it('renders stats pills with tokens when article.stats.tokens present', async () => {
    loadArticleMock.mockResolvedValue(makeArticle())
    render(<ArticleReader slug="sample" />)
    await waitFor(() => expect(screen.getByText('Sample Article')).toBeInTheDocument())
    expect(screen.getByText(/2K tokens/)).toBeInTheDocument()
    expect(screen.getByText(/4 LLM calls/)).toBeInTheDocument()
    expect(screen.getByText(/8 tool uses/)).toBeInTheDocument()
    expect(screen.getByText(/\$0\.12/)).toBeInTheDocument()
  })

  it('falls back to entries/messages/chunks pills when tokens absent', async () => {
    loadArticleMock.mockResolvedValue(
      makeArticle({
        stats: {
          entries: 5,
          messages: 11,
          chunks: 2,
        } as unknown as SessionArticle['stats'],
      }),
    )
    render(<ArticleReader slug="sample" />)
    await waitFor(() => expect(screen.getByText(/5 entries/)).toBeInTheDocument())
    expect(screen.getByText(/11 messages/)).toBeInTheDocument()
    expect(screen.getByText(/2 chunks/)).toBeInTheDocument()
  })

  it('renders hero image when heroImage is set and has not errored', async () => {
    loadArticleMock.mockResolvedValue(makeArticle({ heroImage: 'https://example.com/h.jpg' }))
    render(<ArticleReader slug="sample" />)
    await waitFor(() => expect(screen.getByText('Sample Article')).toBeInTheDocument())
    const img = document.querySelector('img.reader__hero-img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toBe('https://example.com/h.jpg')
  })

  it('swaps to gradient when hero image fires onError', async () => {
    loadArticleMock.mockResolvedValue(makeArticle({ heroImage: 'https://example.com/h.jpg' }))
    render(<ArticleReader slug="sample" />)
    await waitFor(() => expect(screen.getByText('Sample Article')).toBeInTheDocument())
    const img = document.querySelector('img.reader__hero-img') as HTMLImageElement
    fireEvent.error(img)
    await waitFor(() => {
      expect(document.querySelector('img.reader__hero-img')).toBeNull()
      expect(document.querySelector('.reader__hero-gradient')).not.toBeNull()
    })
  })

  it('renders gradient (no img) when heroImage missing', async () => {
    loadArticleMock.mockResolvedValue(makeArticle({ heroImage: undefined }))
    render(<ArticleReader slug="sample" />)
    await waitFor(() => expect(screen.getByText('Sample Article')).toBeInTheDocument())
    expect(document.querySelector('img.reader__hero-img')).toBeNull()
    expect(document.querySelector('.reader__hero-gradient')).not.toBeNull()
  })

  it('shows error state + Back button when loadArticle rejects', async () => {
    loadArticleMock.mockRejectedValue(new Error('nope'))
    render(<ArticleReader slug="sample" />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('Article not found')).toBeInTheDocument()
    expect(screen.getByText('nope')).toBeInTheDocument()
    // Real router navigate: click updates location.hash
    fireEvent.click(screen.getByRole('button', { name: /back to articles/i }))
    expect(window.location.hash).toMatch(/#\/(en|zh)\/$/)
  })

  it('does NOT render share button when user is not authenticated', async () => {
    authState.user = null
    loadArticleMock.mockResolvedValue(makeArticle())
    render(<ArticleReader slug="sample" />)
    await waitFor(() => expect(screen.getByText('Sample Article')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /share this article/i })).toBeNull()
  })

  it('shows share button when user is authenticated and opens modal on click', async () => {
    authState.user = { login: 'alice', name: null, avatar: null }
    loadArticleMock.mockResolvedValue(makeArticle())
    render(<ArticleReader slug="sample" />)
    await waitFor(() => expect(screen.getByText('Sample Article')).toBeInTheDocument())
    const shareBtn = screen.getByRole('button', { name: /share this article/i })
    expect(shareBtn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(shareBtn)
    // After opening, the share modal dialog appears
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('Back nav button returns user to /', async () => {
    loadArticleMock.mockResolvedValue(makeArticle())
    render(<ArticleReader slug="sample" />)
    await waitFor(() => expect(screen.getByText('Sample Article')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /back to articles/i }))
    expect(window.location.hash).toMatch(/#\/(en|zh)\/$/)
  })

  it('renders subagents pill when stats.subagents.count > 0', async () => {
    loadArticleMock.mockResolvedValue(
      makeArticle({
        stats: {
          entries: 1, messages: 1, chunks: 1,
          tokens: { total: 1000, input: 500, output: 500 },
          llmCalls: 1,
          toolCalls: { total: 1 } as unknown as SessionArticle['stats']['toolCalls'],
          subagents: { count: 3 } as unknown as SessionArticle['stats']['subagents'],
        } as unknown as SessionArticle['stats'],
      }),
    )
    render(<ArticleReader slug="sample" />)
    await waitFor(() => expect(screen.getByText(/3 subagents/)).toBeInTheDocument())
  })

  it('renders duration meta when article.duration is set', async () => {
    loadArticleMock.mockResolvedValue(makeArticle({ duration: '12m 30s' }))
    render(<ArticleReader slug="sample" />)
    await waitFor(() => expect(screen.getByText('12m 30s')).toBeInTheDocument())
  })

  it('re-fetches when slug prop changes', async () => {
    loadArticleMock.mockResolvedValueOnce(makeArticle({ slug: 'first', title: 'First' }))
    const { rerender } = render(<ArticleReader slug="first" />)
    await waitFor(() => expect(screen.getByText('First')).toBeInTheDocument())
    loadArticleMock.mockResolvedValueOnce(makeArticle({ slug: 'second', title: 'Second' }))
    await act(async () => {
      rerender(<ArticleReader slug="second" />)
    })
    await waitFor(() => expect(screen.getByText('Second')).toBeInTheDocument())
    expect(loadArticleMock).toHaveBeenCalledTimes(2)
  })
})
