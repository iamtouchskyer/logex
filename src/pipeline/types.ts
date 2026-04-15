export interface JournalEntry {
  type: 'user' | 'assistant' | string
  message: { role?: string; content: string | ContentBlock[] }
  timestamp: string
  sessionId: string
  uuid?: string
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  content?: string | ContentBlock[]
}

export interface Message {
  role: 'user' | 'assistant'
  text: string
  isToolOutput: boolean
  timestamp: string
}

export interface Chunk {
  messages: Message[]
  userTextLen: number
  totalLen: number
  startTs: string
  endTs: string
  insightScore?: number
}

export interface InsightCard {
  slug: string
  category: 'GOTCHA' | 'PATTERN' | 'DECISION' | 'DISCOVERY'
  confidence: number
  title: string
  body: string
  tags: string[]
  sessionId: string
  extractedAt: string
}

export interface SessionMeta {
  sessionId: string
  cwd: string
  startTime: string
  endTime: string
  totalEntries: number
  totalMessages: number
  totalChunks: number
  signalChunks: number
  cardsExtracted: number
}

export interface CardIndex {
  cards: string[]
  sessions: string[]
  lastUpdated: string
}

export interface SessionArticle {
  slug: string           // e.g. "2026-04-14-session-brain-opc-loop"
  title: string          // e.g. "Session Brain: 从 spike 到产品的 OPC Loop"
  summary: string        // 2-3 sentence executive summary
  body: string           // Full markdown article body
  heroImage?: string | null  // full https:// URL or null
  tags: string[]
  sessionId: string
  project: string        // e.g. "session-brain", "mitsein", "opc"
  date: string           // ISO date
  duration?: string      // e.g. "3h 20min" — optional, some older articles may omit
  stats: {
    entries: number
    messages: number
    chunks: number
    // Rich stats from session-recap parser
    tokens?: {
      input: number
      output: number
      cache_creation: number
      cache_read: number
      total: number
    }
    llmCalls?: number
    modelsUsed?: string[]
    toolCalls?: {
      total: number
      byType: Record<string, number>
    }
    subagents?: {
      count: number
      agents: Array<{ type: string; description: string }>
    }
    filesTouched?: string[]
    costEstimate?: {
      total_cost: number
      currency: string
    }
    durationMinutes?: number
  }
}

export interface ArticleIndex {
  articles: string[]     // slugs
  lastUpdated: string
}
