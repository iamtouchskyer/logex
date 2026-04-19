import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ArticleIndex, ArticleIndexEntry } from '../storage/types'
import type { SessionArticle } from '../../pipeline/types'

const mockAdapter = vi.hoisted(() => ({
  loadIndex: vi.fn(),
  loadArticle: vi.fn(),
}))

vi.mock('../storage', () => ({
  createAdapter: () => mockAdapter,
}))

import { loadIndex, loadArticle, loadAllArticles } from '../data'

function makeEntry(slug: string, date = '2026-04-15', opts: {
  zh?: boolean
  en?: boolean
  primaryLang?: 'zh' | 'en'
} = {}): ArticleIndexEntry {
  const { zh = true, en = true, primaryLang = 'zh' } = opts
  const i18n: ArticleIndexEntry['i18n'] = {}
  if (zh) i18n.zh = { title: `[zh]${slug}`, summary: 'zh-summary', path: `2026/04/15/${slug}.zh.json` }
  if (en) i18n.en = { title: `[en]${slug}`, summary: 'en-summary', path: `2026/04/15/${slug}.en.json` }
  return {
    slug,
    date,
    project: 'test',
    tags: [],
    primaryLang,
    i18n,
  }
}

const makeIndex = (articles: ArticleIndexEntry[]): ArticleIndex => ({
  articles,
  lastUpdated: '2026-04-15',
})

const makeArticle = (slug: string): SessionArticle => ({
  slug,
  lang: 'zh',
  title: `Article ${slug}`,
  summary: 'summary',
  body: 'body',
  date: '2026-04-15',
  tags: [],
  project: 'test',
  sessionId: 'test-session-id',
  duration: '1h 0min',
  stats: { entries: 1, messages: 1, chunks: 1 },
})

describe('loadIndex', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delegates to adapter', async () => {
    const index = makeIndex([])
    mockAdapter.loadIndex.mockResolvedValueOnce(index)
    const result = await loadIndex()
    expect(result).toEqual(index)
  })
})

describe('loadArticle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delegates to adapter with slug + lang', async () => {
    const article = makeArticle('my-article')
    mockAdapter.loadArticle.mockResolvedValueOnce(article)
    const result = await loadArticle('my-article', 'zh')
    expect(result).toEqual(article)
    expect(mockAdapter.loadArticle).toHaveBeenCalledWith('my-article', 'zh')
  })

  it('propagates errors', async () => {
    mockAdapter.loadArticle.mockRejectedValueOnce(new Error('Article not found: missing'))
    await expect(loadArticle('missing', 'en')).rejects.toThrow('Article not found: missing')
  })
})

describe('loadAllArticles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns rows resolved to the requested lang', async () => {
    const e = makeEntry('a1', '2026-04-15', { zh: true, en: true, primaryLang: 'zh' })
    mockAdapter.loadIndex.mockResolvedValueOnce(makeIndex([e]))

    const zh = await loadAllArticles('zh')
    expect(zh[0].title).toBe('[zh]a1')
    expect(zh[0].lang).toBe('zh')
    expect(zh[0].path).toMatch(/\.zh\.json$/)
    expect(zh[0].availableLangs.sort()).toEqual(['en', 'zh'])
    expect(zh[0].primaryLang).toBe('zh')
  })

  it('falls back to primaryLang when requested lang is missing', async () => {
    const e = makeEntry('a1', '2026-04-15', { zh: true, en: false, primaryLang: 'zh' })
    mockAdapter.loadIndex.mockResolvedValueOnce(makeIndex([e]))

    const rows = await loadAllArticles('en')
    expect(rows[0].lang).toBe('zh')            // resolved fallback
    expect(rows[0].primaryLang).toBe('zh')
    expect(rows[0].availableLangs).toEqual(['zh'])
    expect(rows[0].title).toBe('[zh]a1')
  })

  it('sorts newest first', async () => {
    const e1 = makeEntry('a1', '2026-04-15')
    const e2 = makeEntry('a2', '2026-04-14')
    mockAdapter.loadIndex.mockResolvedValueOnce(makeIndex([e2, e1]))

    const rows = await loadAllArticles('zh')
    expect(rows.map((r) => r.slug)).toEqual(['a1', 'a2'])
  })

  it('accepts legacy flat-shape index entries transparently', async () => {
    const legacyEntry = {
      slug: 'legacy-1',
      title: 'Legacy Title',
      summary: 'legacy',
      date: '2026-04-10',
      tags: [],
      project: 'test',
      path: '2026/04/10/legacy-1.json',
    }
    mockAdapter.loadIndex.mockResolvedValueOnce({
      articles: [legacyEntry] as unknown as ArticleIndex['articles'],
      lastUpdated: '2026-04-15',
    })

    const rows = await loadAllArticles('zh')
    expect(rows[0].slug).toBe('legacy-1')
    expect(rows[0].title).toBe('Legacy Title')
    // legacy defaults to zh primary
    expect(rows[0].primaryLang).toBe('zh')
    expect(rows[0].availableLangs).toEqual(['zh'])
  })

  it('returns empty array when no articles', async () => {
    mockAdapter.loadIndex.mockResolvedValueOnce(makeIndex([]))
    const result = await loadAllArticles('en')
    expect(result).toHaveLength(0)
    expect(mockAdapter.loadArticle).not.toHaveBeenCalled()
  })
})
