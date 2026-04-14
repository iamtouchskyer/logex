import { describe, it, expect } from 'vitest'
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { JournalEntry } from '../types'
import { parseJsonl, extractMessages } from '../parse'

function writeTmpJsonl(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'sb-test-'))
  const file = join(dir, 'test.jsonl')
  writeFileSync(file, lines.join('\n'))
  return file
}

describe('parseJsonl', () => {
  it('parses valid JSONL entries', () => {
    const line1 = JSON.stringify({ type: 'user', message: { content: 'hello' }, timestamp: '2025-01-01', sessionId: 's1' })
    const line2 = JSON.stringify({ type: 'assistant', message: { content: 'world' }, timestamp: '2025-01-02', sessionId: 's1' })
    const file = writeTmpJsonl([line1, line2])

    const entries = parseJsonl(file)
    expect(entries).toHaveLength(2)
    expect(entries[0].type).toBe('user')
    expect(entries[1].type).toBe('assistant')
    unlinkSync(file)
  })

  it('skips blank lines', () => {
    const line = JSON.stringify({ type: 'user', message: { content: 'hello' }, timestamp: '2025-01-01', sessionId: 's1' })
    const file = writeTmpJsonl(['', '', line, ''])

    const entries = parseJsonl(file)
    expect(entries).toHaveLength(1)
    unlinkSync(file)
  })

  it('skips malformed JSON lines', () => {
    const valid = JSON.stringify({ type: 'user', message: { content: 'ok' }, timestamp: '2025-01-01', sessionId: 's1' })
    const file = writeTmpJsonl(['not json', valid, '{broken'])

    const entries = parseJsonl(file)
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('user')
    unlinkSync(file)
  })

  it('returns empty array for completely empty input', () => {
    const file = writeTmpJsonl([''])

    const entries = parseJsonl(file)
    expect(entries).toHaveLength(0)
    unlinkSync(file)
  })
})

describe('extractMessages', () => {
  it('extracts text messages from user and assistant entries', () => {
    const entries: JournalEntry[] = [
      {
        type: 'user',
        message: { content: 'This is a user message with enough text' },
        timestamp: '2025-01-01T00:00:00Z',
        sessionId: 's1',
      },
      {
        type: 'assistant',
        message: { content: 'This is an assistant reply long enough' },
        timestamp: '2025-01-01T00:01:00Z',
        sessionId: 's1',
      },
    ]

    const msgs = extractMessages(entries)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].text).toBe('This is a user message with enough text')
    expect(msgs[0].isToolOutput).toBe(false)
    expect(msgs[1].role).toBe('assistant')
  })

  it('skips non-user, non-assistant entries', () => {
    const entries: JournalEntry[] = [
      {
        type: 'system',
        message: { content: 'System message long enough to pass' },
        timestamp: '2025-01-01T00:00:00Z',
        sessionId: 's1',
      },
    ]

    const msgs = extractMessages(entries)
    expect(msgs).toHaveLength(0)
  })

  it('skips system-reminder content in text blocks', () => {
    const entries: JournalEntry[] = [
      {
        type: 'user',
        message: {
          content: [
            { type: 'text' as const, text: 'This contains <system-reminder>blah</system-reminder> stuff' },
          ],
        },
        timestamp: '2025-01-01T00:00:00Z',
        sessionId: 's1',
      },
    ]

    const msgs = extractMessages(entries)
    expect(msgs).toHaveLength(0)
  })

  it('separates tool output from user text', () => {
    const entries: JournalEntry[] = [
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result' as const,
              content: [
                { type: 'text' as const, text: 'Tool output result data here that is long enough to pass the threshold' },
              ],
            },
          ],
        },
        timestamp: '2025-01-01T00:00:00Z',
        sessionId: 's1',
      },
    ]

    const msgs = extractMessages(entries)
    expect(msgs).toHaveLength(0)
  })

  it('extracts user text from array content blocks alongside tool results', () => {
    const entries: JournalEntry[] = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text' as const, text: 'Here is some analysis of the code that is long enough' },
            {
              type: 'tool_result' as const,
              content: 'file content here',
            },
          ],
        },
        timestamp: '2025-01-01T00:00:00Z',
        sessionId: 's1',
      },
    ]

    const msgs = extractMessages(entries)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].text).toBe('Here is some analysis of the code that is long enough')
    expect(msgs[0].isToolOutput).toBe(false)
  })

  it('skips messages with text shorter than 10 characters', () => {
    const entries: JournalEntry[] = [
      {
        type: 'user',
        message: { content: 'short' },
        timestamp: '2025-01-01T00:00:00Z',
        sessionId: 's1',
      },
    ]

    const msgs = extractMessages(entries)
    expect(msgs).toHaveLength(0)
  })

  it('skips skill preamble text blocks', () => {
    const entries: JournalEntry[] = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text' as const, text: 'Base directory for this skill: /Users/test' },
          ],
        },
        timestamp: '2025-01-01T00:00:00Z',
        sessionId: 's1',
      },
    ]

    const msgs = extractMessages(entries)
    expect(msgs).toHaveLength(0)
  })
})
