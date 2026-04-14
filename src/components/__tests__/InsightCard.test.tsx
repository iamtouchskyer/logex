import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InsightCard } from '../InsightCard'
import type { InsightCard as InsightCardType } from '../../pipeline/types'

// Mock router to avoid actual navigation
vi.mock('../../lib/router', () => ({
  navigate: vi.fn(),
}))

import { navigate } from '../../lib/router'

const mockCard: InsightCardType = {
  slug: 'react-hooks-gotcha',
  category: 'GOTCHA',
  confidence: 0.9,
  title: 'React Hooks Gotcha',
  body: 'When using useEffect with async functions, you must handle cleanup properly to avoid memory leaks.',
  tags: ['react', 'hooks', 'async'],
  sessionId: 'session-abc',
  extractedAt: '2025-06-15T10:30:00Z',
}

describe('InsightCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the title', () => {
    render(<InsightCard card={mockCard} />)
    expect(screen.getByText('React Hooks Gotcha')).toBeInTheDocument()
  })

  it('renders the body text', () => {
    render(<InsightCard card={mockCard} />)
    expect(screen.getByText(mockCard.body)).toBeInTheDocument()
  })

  it('renders all tags', () => {
    render(<InsightCard card={mockCard} />)
    expect(screen.getByText('react')).toBeInTheDocument()
    expect(screen.getByText('hooks')).toBeInTheDocument()
    expect(screen.getByText('async')).toBeInTheDocument()
  })

  it('renders the formatted date', () => {
    render(<InsightCard card={mockCard} />)
    // formatDate produces "Jun 15, 2025" format
    expect(screen.getByText('Jun 15, 2025')).toBeInTheDocument()
  })

  it('renders the category badge', () => {
    render(<InsightCard card={mockCard} />)
    expect(screen.getByText('GOTCHA')).toBeInTheDocument()
  })

  it('navigates to detail page on click', async () => {
    const { userEvent } = await import('@testing-library/user-event').then((m) => ({
      userEvent: m.default,
    }))
    const user = userEvent.setup()

    render(<InsightCard card={mockCard} />)
    const article = screen.getByRole('link', { name: /View insight: React Hooks Gotcha/ })
    await user.click(article)

    expect(navigate).toHaveBeenCalledWith('/insights/react-hooks-gotcha')
  })

  it('has correct aria-label for accessibility', () => {
    render(<InsightCard card={mockCard} />)
    const article = screen.getByRole('link', { name: 'View insight: React Hooks Gotcha' })
    expect(article).toBeInTheDocument()
  })

  it('is keyboard accessible', () => {
    render(<InsightCard card={mockCard} />)
    const article = screen.getByRole('link', { name: /View insight/ })
    expect(article).toHaveAttribute('tabindex', '0')
  })

  it('renders without tags when tags array is empty', () => {
    const cardNoTags = { ...mockCard, tags: [] }
    const { container } = render(<InsightCard card={cardNoTags} />)
    expect(container.querySelector('.insight-card__tags')).toBeNull()
  })
})
