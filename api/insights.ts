import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface CardIndex {
  cards: string[]
  sessions: string[]
  lastUpdated: string
}

interface InsightCard {
  slug: string
  category: string
  confidence: number
  title: string
  body: string
  tags: string[]
  sessionId: string
  extractedAt: string
}

const DATA_DIR = join(process.cwd(), 'public', 'data')

function readJSON<T>(path: string): T | null {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function loadAllCards(): InsightCard[] {
  const index = readJSON<CardIndex>(join(DATA_DIR, 'index.json'))
  if (!index) return []
  return index.cards
    .map((slug) => readJSON<InsightCard>(join(DATA_DIR, 'cards', `${slug}.json`)))
    .filter((c): c is InsightCard => c !== null)
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const { method, query } = req

  if (method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // GET /api/insights/[slug]
  const slug = query.slug
  if (typeof slug === 'string' && slug.length > 0) {
    const card = readJSON<InsightCard>(join(DATA_DIR, 'cards', `${slug}.json`))
    if (!card) return res.status(404).json({ error: 'Card not found' })
    return res.status(200).json(card)
  }

  // Load all cards
  let cards = loadAllCards()

  // Filter by category
  const category = query.category
  if (typeof category === 'string') {
    cards = cards.filter((c) => c.category === category)
  }

  // Search by query string
  const q = query.q
  if (typeof q === 'string') {
    const lower = q.toLowerCase()
    cards = cards.filter(
      (c) =>
        c.title.toLowerCase().includes(lower) ||
        c.body.toLowerCase().includes(lower) ||
        c.tags.some((t) => t.toLowerCase().includes(lower)),
    )
  }

  return res.status(200).json(cards)
}
