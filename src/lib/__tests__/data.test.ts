import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InsightCard } from '../../pipeline/types'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

import { searchCards, filterByCategory, filterByTag, loadIndex, loadCard, loadAllCards } from '../data'

function makeCard(overrides: Partial<InsightCard> = {}): InsightCard {
  return {
    slug: 'test-slug',
    category: 'GOTCHA',
    confidence: 0.9,
    title: 'Test Title',
    body: 'Test body content here',
    tags: ['testing', 'vitest'],
    sessionId: 'session-1',
    extractedAt: '2025-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('searchCards', () => {
  it('matches by title', async () => {
    const cards = [
      makeCard({ title: 'React hooks gotcha' }),
      makeCard({ title: 'Vite config setup', slug: 'vite-config' }),
    ]

    const result = await searchCards('react', cards)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('React hooks gotcha')
  })

  it('matches by body', async () => {
    const cards = [
      makeCard({ body: 'The useEffect cleanup runs on unmount' }),
      makeCard({ body: 'Vite uses esbuild for dev', slug: 'vite' }),
    ]

    const result = await searchCards('cleanup', cards)
    expect(result).toHaveLength(1)
    expect(result[0].body).toContain('cleanup')
  })

  it('matches by tags', async () => {
    const cards = [
      makeCard({ tags: ['react', 'hooks'] }),
      makeCard({ tags: ['vite', 'build'], slug: 'vite' }),
    ]

    const result = await searchCards('hooks', cards)
    expect(result).toHaveLength(1)
    expect(result[0].tags).toContain('hooks')
  })

  it('is case-insensitive', async () => {
    const cards = [makeCard({ title: 'React Hooks Pattern' })]

    const result = await searchCards('REACT', cards)
    expect(result).toHaveLength(1)
  })

  it('returns empty array for no match', async () => {
    const cards = [makeCard({ title: 'Something else', body: 'Nothing related', tags: ['other'] })]

    const result = await searchCards('nonexistent', cards)
    expect(result).toHaveLength(0)
  })
})

describe('filterByCategory', () => {
  it('filters cards by category', () => {
    const cards = [
      makeCard({ category: 'GOTCHA' }),
      makeCard({ category: 'PATTERN', slug: 'pattern-1' }),
      makeCard({ category: 'GOTCHA', slug: 'gotcha-2' }),
    ]

    const result = filterByCategory(cards, 'GOTCHA')
    expect(result).toHaveLength(2)
    result.forEach((c) => expect(c.category).toBe('GOTCHA'))
  })

  it('returns empty array when no cards match category', () => {
    const cards = [makeCard({ category: 'GOTCHA' })]

    const result = filterByCategory(cards, 'DISCOVERY')
    expect(result).toHaveLength(0)
  })
})

describe('filterByTag', () => {
  it('filters cards by tag', () => {
    const cards = [
      makeCard({ tags: ['react', 'hooks'] }),
      makeCard({ tags: ['vite'], slug: 'vite' }),
    ]

    const result = filterByTag(cards, 'react')
    expect(result).toHaveLength(1)
    expect(result[0].tags).toContain('react')
  })

  it('returns empty for unmatched tag', () => {
    const cards = [makeCard({ tags: ['react'] })]

    const result = filterByTag(cards, 'angular')
    expect(result).toHaveLength(0)
  })
})

describe('loadIndex', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches and returns index data', async () => {
    const indexData = { cards: ['slug-1', 'slug-2'], sessions: ['s1'], lastUpdated: '2025-06-01' }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(indexData),
    })

    const result = await loadIndex()
    expect(result).toEqual(indexData)
    expect(mockFetch).toHaveBeenCalledWith('/data/index.json')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    await expect(loadIndex()).rejects.toThrow('Failed to load index: 404')
  })
})

describe('loadCard', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches card by slug', async () => {
    const card = makeCard({ slug: 'my-card' })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(card),
    })

    const result = await loadCard('my-card')
    expect(result).toEqual(card)
    expect(mockFetch).toHaveBeenCalledWith('/data/cards/my-card.json')
  })

  it('throws when card not found', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    await expect(loadCard('missing')).rejects.toThrow('Card not found: missing')
  })
})

describe('loadAllCards', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('loads all cards from index', async () => {
    const card1 = makeCard({ slug: 'card-1' })
    const card2 = makeCard({ slug: 'card-2' })

    // First call: loadIndex
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ cards: ['card-1', 'card-2'], sessions: [], lastUpdated: '' }),
    })
    // Second and third calls: loadCard
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(card1),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(card2),
    })

    const result = await loadAllCards()
    expect(result).toHaveLength(2)
  })

  it('skips failed card fetches gracefully', async () => {
    const card1 = makeCard({ slug: 'card-1' })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ cards: ['card-1', 'card-fail'], sessions: [], lastUpdated: '' }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(card1),
    })
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const result = await loadAllCards()
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('card-1')
  })
})
