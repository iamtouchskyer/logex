import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategoryBadge } from '../CategoryBadge'
import type { InsightCard } from '../../pipeline/types'

const categories: InsightCard['category'][] = ['GOTCHA', 'PATTERN', 'DECISION', 'DISCOVERY']

const expectedClasses: Record<InsightCard['category'], string> = {
  GOTCHA: 'badge--gotcha',
  PATTERN: 'badge--pattern',
  DECISION: 'badge--decision',
  DISCOVERY: 'badge--discovery',
}

describe('CategoryBadge', () => {
  it.each(categories)('renders correct text for %s', (category) => {
    render(<CategoryBadge category={category} />)
    expect(screen.getByText(category)).toBeInTheDocument()
  })

  it.each(categories)('applies correct color class for %s', (category) => {
    render(<CategoryBadge category={category} />)
    const badge = screen.getByText(category)
    expect(badge).toHaveClass('badge')
    expect(badge).toHaveClass(expectedClasses[category])
  })

  it('renders as a span element', () => {
    render(<CategoryBadge category="GOTCHA" />)
    const badge = screen.getByText('GOTCHA')
    expect(badge.tagName).toBe('SPAN')
  })
})
