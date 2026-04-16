import { readFileSync } from 'fs'
import type { JournalEntry, ContentBlock, Message } from './types'

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

/**
 * Extract clean messages from journal entries.
 * Separates user text from tool output; skips system reminders and skill preambles.
 */
export function extractMessages(entries: JournalEntry[]): Message[] {
  const messages: Message[] = []

  for (const entry of entries) {
    const entryType = entry.type
    if (entryType !== 'user' && entryType !== 'assistant') continue

    const msg = entry.message
    if (!msg) continue

    let text: string
    let isToolOutput = false

    if (typeof msg === 'string') {
      text = msg
    } else if (typeof msg === 'object') {
      const content = msg.content
      if (Array.isArray(content)) {
        const userTexts: string[] = []
        const toolTexts: string[] = []

        for (const block of content as ContentBlock[]) {
          if (typeof block !== 'object' || !block) continue

          if (block.type === 'text') {
            const t = block.text ?? ''
            // Skip system reminders entirely
            if (t.includes('<system-reminder>')) continue
            // Skip skill/command preambles
            if (t.trim().startsWith('Base directory for this skill:')) continue
            if (t.trim().startsWith('<command-message>')) continue
            userTexts.push(t)
          } else if (block.type === 'tool_result') {
            const tc = block.content
            if (Array.isArray(tc)) {
              for (const item of tc as ContentBlock[]) {
                if (typeof item === 'object' && item?.type === 'text') {
                  toolTexts.push((item.text ?? '').slice(0, 300))
                }
              }
            } else if (typeof tc === 'string') {
              toolTexts.push(tc.slice(0, 300))
            }
          }
        }

        text = userTexts.join('\n')
        isToolOutput = toolTexts.length > 0 && userTexts.length === 0
      } else {
        text = String(content ?? '')
      }
    } else {
      continue
    }

    if (!text.trim() || text.trim().length < 10) continue

    messages.push({
      role: entryType as 'user' | 'assistant',
      text,
      isToolOutput,
      timestamp: entry.timestamp ?? '',
    })
  }

  return messages
}
