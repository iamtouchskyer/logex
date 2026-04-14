import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

import { loadIndex, loadCard, loadAllCards, loadArticle, loadAllArticles } from '../data'

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
    const card = { slug: 'my-card', title: 'Test' }
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
    const card1 = { slug: 'card-1' }
    const card2 = { slug: 'card-2' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ cards: ['card-1', 'card-2'], sessions: [], lastUpdated: '' }),
    })
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
    const card1 = { slug: 'card-1' }

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

describe('loadArticle', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches article by slug', async () => {
    const article = { slug: 'my-article', title: 'Test Article' }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(article),
    })

    const result = await loadArticle('my-article')
    expect(result).toEqual(article)
    expect(mockFetch).toHaveBeenCalledWith('/data/articles/my-article.json')
  })

  it('throws when article not found', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    await expect(loadArticle('missing')).rejects.toThrow('Article not found: missing')
  })
})

describe('loadAllArticles', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('loads all articles from index', async () => {
    const a1 = { slug: 'a1', date: '2025-06-02T00:00:00Z' }
    const a2 = { slug: 'a2', date: '2025-06-01T00:00:00Z' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ cards: [], articles: ['a1', 'a2'], lastUpdated: '' }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(a1),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(a2),
    })

    const result = await loadAllArticles()
    expect(result).toHaveLength(2)
    // Should be sorted newest first
    expect(result[0].slug).toBe('a1')
    expect(result[1].slug).toBe('a2')
  })

  it('returns empty array when no articles in index', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ cards: [], lastUpdated: '' }),
    })

    const result = await loadAllArticles()
    expect(result).toHaveLength(0)
  })

  it('skips failed article fetches gracefully', async () => {
    const a1 = { slug: 'a1', date: '2025-06-01T00:00:00Z' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ cards: [], articles: ['a1', 'a-fail'], lastUpdated: '' }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(a1),
    })
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const result = await loadAllArticles()
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('a1')
  })
})
