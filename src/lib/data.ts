import type { CardIndex, InsightCard, SessionMeta, SessionArticle } from '../pipeline/types'

const BASE = '/data'

export async function loadIndex(): Promise<CardIndex & { articles?: string[] }> {
  const res = await fetch(`${BASE}/index.json`)
  if (!res.ok) throw new Error(`Failed to load index: ${res.status}`)
  return res.json()
}

export async function loadCard(slug: string): Promise<InsightCard> {
  const res = await fetch(`${BASE}/cards/${slug}.json`)
  if (!res.ok) throw new Error(`Card not found: ${slug}`)
  return res.json()
}

export async function loadAllCards(): Promise<InsightCard[]> {
  const index = await loadIndex()
  const results = await Promise.allSettled(index.cards.map(loadCard))
  return results
    .filter((r): r is PromiseFulfilledResult<InsightCard> => r.status === 'fulfilled')
    .map((r) => r.value)
}

export async function loadArticle(slug: string): Promise<SessionArticle> {
  const res = await fetch(`${BASE}/articles/${slug}.json`)
  if (!res.ok) throw new Error(`Article not found: ${slug}`)
  return res.json()
}

export async function loadAllArticles(): Promise<SessionArticle[]> {
  const index = await loadIndex()
  const slugs = index.articles ?? []
  const results = await Promise.allSettled(slugs.map(loadArticle))
  return results
    .filter((r): r is PromiseFulfilledResult<SessionArticle> => r.status === 'fulfilled')
    .map((r) => r.value)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export async function loadSession(sessionId: string): Promise<SessionMeta> {
  const res = await fetch(`${BASE}/sessions/${sessionId}.json`)
  if (!res.ok) throw new Error(`Session not found: ${sessionId}`)
  return res.json()
}
