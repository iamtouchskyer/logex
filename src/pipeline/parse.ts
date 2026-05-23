import { readFileSync } from 'fs'
import type { JournalEntry, ContentBlock, Message } from './types'

interface NormalizedEntry {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
  timestamp: string
}

/**
 * Parse a JSONL file into journal entries.
 * Skips blank lines and malformed JSON.
 */
export function parseJsonl(filepath: string): JournalEntry[] {
  const raw = readFileSync(filepath, 'utf-8')
  const entries: JournalEntry[] = []
  let skipped = 0

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      entries.push(JSON.parse(trimmed))
    } catch {
      skipped++
    }
  }

  if (skipped > 0) {
    console.error(`Warning: skipped ${skipped} malformed JSONL line(s)`)
  }

  return entries
}

function normalizeEntry(entry: JournalEntry): NormalizedEntry | null {
  if ((entry.type === 'user' || entry.type === 'assistant') && entry.message) {
    return {
      role: entry.type,
      content: entry.message.content,
      timestamp: entry.timestamp ?? '',
    }
  }

  if (entry.type !== 'response_item') return null
  const payload = entry.payload
  if (payload?.type !== 'message') return null
  if (payload.role !== 'user' && payload.role !== 'assistant') return null
  if (payload.content === undefined) return null
  return { role: payload.role, content: payload.content, timestamp: entry.timestamp ?? '' }
}

function shouldSkipText(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.includes('<system-reminder>')
    || trimmed.startsWith('Base directory for this skill:')
    || trimmed.startsWith('<command-message>')
}

function extractTextFromContent(content: string | ContentBlock[]): {
  text: string
  isToolOutput: boolean
} {
  if (typeof content === 'string') return { text: content, isToolOutput: false }

  const userTexts: string[] = []
  const toolTexts: string[] = []

  for (const block of content) {
    if (typeof block !== 'object' || !block) continue
    if (block.type === 'text' || block.type === 'input_text' || block.type === 'output_text') {
      const text = block.text ?? ''
      if (!shouldSkipText(text)) userTexts.push(text)
    } else if (block.type === 'tool_result') {
      appendToolText(block.content, toolTexts)
    }
  }

  return {
    text: userTexts.join('\n'),
    isToolOutput: toolTexts.length > 0 && userTexts.length === 0,
  }
}

function appendToolText(content: string | ContentBlock[] | undefined, out: string[]): void {
  if (typeof content === 'string') {
    out.push(content.slice(0, 300))
    return
  }
  if (!Array.isArray(content)) return
  for (const item of content) {
    if (typeof item === 'object' && item?.type === 'text') {
      out.push((item.text ?? '').slice(0, 300))
    }
  }
}

/**
 * Extract clean messages from journal entries.
 * Separates user text from tool output; skips system reminders and skill preambles.
 */
export function extractMessages(entries: JournalEntry[]): Message[] {
  const messages: Message[] = []

  for (const entry of entries) {
    const normalized = normalizeEntry(entry)
    if (!normalized) continue

    const { text, isToolOutput } = extractTextFromContent(normalized.content)

    if (!text.trim() || text.trim().length < 10) continue

    messages.push({
      role: normalized.role,
      text,
      isToolOutput,
      timestamp: normalized.timestamp,
    })
  }

  return messages
}
