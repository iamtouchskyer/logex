import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import type { JournalEntry, ContentBlock, Message } from './types.js'

interface NormalizedEntry {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
  timestamp: string
}

/**
 * Parse a JSONL file into journal entries.
 * Skips blank lines and malformed JSON.
 * Supports zstd-compressed transcripts (`.zst` / `.zstd`) when the `zstd`
 * binary is available.
 */
export function parseJsonl(filepath: string, exec: typeof execFileSync = execFileSync): JournalEntry[] {
  const raw = readRaw(filepath, exec)
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

function readRaw(filepath: string, exec: typeof execFileSync): string {
  if (!/\.(zst|zstd)$/i.test(filepath)) return readFileSync(filepath, 'utf-8')
  try {
    return exec('zstd', ['-dc', filepath], { maxBuffer: 1024 * 1024 * 1024 })
      .toString('utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `${filepath} is zstd-compressed but the \`zstd\` binary is unavailable. ` +
        'Install zstd (e.g. `brew install zstd`) or decompress first: `zstd -dc file.zst > file.jsonl`.',
      )
    }
    // zstd ran but failed — surface its own diagnosis instead of blaming the binary.
    const detail = (e as { stderr?: Buffer }).stderr?.toString().trim().split('\n').slice(-2).join('; ')
    throw new Error(`Failed to decompress ${filepath}: ${detail || 'zstd reported an error'}`)
  }
}

function normalizeEntry(entry: JournalEntry): NormalizedEntry | null {
  if ((entry.type === 'user' || entry.type === 'assistant') && entry.message) {
    return {
      role: entry.type,
      content: entry.message.content,
      timestamp: entry.timestamp ?? '',
    }
  }

  // Pi agent sessions: {"type":"message","message":{"role":"user|assistant|...","content":...}}
  if (entry.type === 'message' && entry.message) {
    const role = entry.message.role
    if (role !== 'user' && role !== 'assistant') return null
    return {
      role,
      content: entry.message.content,
      timestamp: entry.timestamp ?? '',
    }
  }

  // DSH (DeepSeek Harness) sessions:
  //   {"type":"user/message","data":{"role":"user","content":[...]},      "time":1788169746387}
  //   {"type":"assistant/message","data":{"message":{"role":"assistant","content":[...]}}, "time":...}
  if (entry.type === 'user/message' || entry.type === 'assistant/message') {
    const data = entry.data ?? {}
    const message = entry.type === 'user/message' ? data : data.message
    const role = message?.role
    if (role !== 'user' && role !== 'assistant') return null
    if (message?.content === undefined) return null
    return {
      role,
      content: message.content,
      timestamp: entry.time ? new Date(entry.time).toISOString() : '',
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
