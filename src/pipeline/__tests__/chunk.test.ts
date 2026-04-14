import { describe, it, expect } from 'vitest'
import { chunkByConversation, scoreChunk, filterChunks } from '../chunk'
import type { Message, Chunk } from '../types'

function makeMsg(
  role: 'user' | 'assistant',
  text: string,
  opts: Partial<Message> = {},
): Message {
  return {
    role,
    text,
    isToolOutput: false,
    timestamp: '2025-01-01T00:00:00Z',
    ...opts,
  }
}

function makeChunk(messages: Message[], overrides: Partial<Chunk> = {}): Chunk {
  const totalLen = messages.reduce((s, m) => s + m.text.length, 0)
  const userTextLen = messages
    .filter((m) => m.role === 'user' && !m.isToolOutput)
    .reduce((s, m) => s + m.text.length, 0)
  return {
    messages,
    totalLen,
    userTextLen,
    startTs: messages[0]?.timestamp ?? '',
    endTs: messages[messages.length - 1]?.timestamp ?? '',
    ...overrides,
  }
}

describe('chunkByConversation', () => {
  it('keeps short conversation as single chunk', () => {
    const msgs = [
      makeMsg('user', 'Hello there, this is a message'),
      makeMsg('assistant', 'Hi, how can I help you today'),
    ]

    const chunks = chunkByConversation(msgs)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].messages).toHaveLength(2)
  })

  it('splits when totalLen exceeds maxChars', () => {
    const longText = 'x'.repeat(4000)
    const msgs = [
      makeMsg('user', longText),
      makeMsg('assistant', longText),
      makeMsg('user', 'New chunk starts here with this message'),
    ]

    const chunks = chunkByConversation(msgs, 6000)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('splits on user message when > 3000 chars and > 3 messages', () => {
    const msgs = [
      makeMsg('user', 'a'.repeat(1000)),
      makeMsg('assistant', 'b'.repeat(1000)),
      makeMsg('user', 'c'.repeat(500)),
      makeMsg('assistant', 'd'.repeat(600)),
      makeMsg('user', 'New chunk should split here since > 3000 and > 3 msgs'),
    ]

    const chunks = chunkByConversation(msgs)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('returns empty array for empty input', () => {
    const chunks = chunkByConversation([])
    expect(chunks).toHaveLength(0)
  })

  it('preserves start and end timestamps', () => {
    const msgs = [
      makeMsg('user', 'First message with enough length', { timestamp: '2025-01-01T00:00:00Z' }),
      makeMsg('assistant', 'Reply message with enough text too', { timestamp: '2025-01-01T01:00:00Z' }),
    ]

    const chunks = chunkByConversation(msgs)
    expect(chunks[0].startTs).toBe('2025-01-01T00:00:00Z')
    expect(chunks[0].endTs).toBe('2025-01-01T01:00:00Z')
  })

  it('counts userTextLen only for non-tool user messages', () => {
    const msgs = [
      makeMsg('user', 'User text here for testing', { isToolOutput: false }),
      makeMsg('user', 'Tool output content here', { isToolOutput: true }),
      makeMsg('assistant', 'Assistant reply text here'),
    ]

    const chunks = chunkByConversation(msgs)
    // userTextLen should only count the first message (non-tool user)
    expect(chunks[0].userTextLen).toBe('User text here for testing'.length)
  })
})

describe('scoreChunk', () => {
  it('returns 0.0 for chunk with empty non-tool text', () => {
    const chunk = makeChunk([
      makeMsg('user', '   ', { isToolOutput: true }),
    ])
    // All messages are tool output, conversationText is empty
    const score = scoreChunk(chunk)
    expect(score).toBe(0.0)
  })

  it('returns 0.1 when signals from fewer than 2 categories', () => {
    const chunk = makeChunk([
      makeMsg('user', 'There is a bug in the code'),
    ])
    const score = scoreChunk(chunk)
    expect(score).toBe(0.1)
  })

  it('scores above 0.1 when signals from >= 2 categories', () => {
    const chunk = makeChunk([
      makeMsg('user', 'I found a bug, the root cause is a design pattern issue because of the architecture decision'),
    ])
    const score = scoreChunk(chunk)
    expect(score).toBeGreaterThan(0.1)
  })

  it('gives higher score with more category breadth', () => {
    const narrowChunk = makeChunk([
      makeMsg('user', 'There is a bug, need to debug and fix the error'),
      makeMsg('assistant', 'The architecture design pattern shows a trade-off'),
    ])

    const broadChunk = makeChunk([
      makeMsg('user', 'There is a bug, need to debug and fix the error. I discovered a gotcha trap.'),
      makeMsg('assistant', 'The architecture design pattern shows a trade-off because the reason is evaluation review'),
    ])

    const narrowScore = scoreChunk(narrowChunk)
    const broadScore = scoreChunk(broadChunk)
    expect(broadScore).toBeGreaterThanOrEqual(narrowScore)
  })

  it('ignores tool output messages in scoring', () => {
    const chunk = makeChunk([
      makeMsg('user', 'bug error fix debug architecture design', { isToolOutput: true }),
    ])
    // All text is tool output, filtered out
    const score = scoreChunk(chunk)
    expect(score).toBe(0.0)
  })

  it('caps score at 1.0', () => {
    const chunk = makeChunk([
      makeMsg(
        'user',
        'bug error fix debug root cause traceback broken architecture design pattern trade-off decision approach learned discovered insight gotcha trap pitfall trick because instead of rather than why the reason review evaluate score verdict assessment',
      ),
    ])
    const score = scoreChunk(chunk)
    expect(score).toBeLessThanOrEqual(1.0)
  })
})

describe('filterChunks', () => {
  it('returns only chunks with score >= threshold', () => {
    const lowChunk = makeChunk([
      makeMsg('user', 'Hello world, nothing special here at all'),
    ])
    const highChunk = makeChunk([
      makeMsg('user', 'Found a bug, root cause is the architecture design pattern because of the reason, discovered a gotcha'),
    ])

    const result = filterChunks([lowChunk, highChunk], 0.25)
    // lowChunk should score 0.1 (< 0.25), highChunk should score above 0.25
    expect(result.length).toBeGreaterThanOrEqual(1)
    for (const chunk of result) {
      expect(chunk.insightScore).toBeGreaterThanOrEqual(0.25)
    }
  })

  it('sets insightScore on all input chunks (even filtered out)', () => {
    const chunk = makeChunk([
      makeMsg('user', 'Simple message without much signal content here'),
    ])

    filterChunks([chunk], 0.25)
    expect(chunk.insightScore).toBeDefined()
    expect(typeof chunk.insightScore).toBe('number')
  })

  it('returns empty array when no chunks meet threshold', () => {
    const chunk = makeChunk([
      makeMsg('user', 'Just a plain boring message with no signals'),
    ])

    const result = filterChunks([chunk], 0.5)
    expect(result).toHaveLength(0)
  })

  it('uses default threshold of 0.25', () => {
    const lowChunk = makeChunk([
      makeMsg('user', 'Hello, nothing important going on here'),
    ])

    const result = filterChunks([lowChunk])
    // Score should be 0.1 which is below default 0.25
    expect(result).toHaveLength(0)
  })
})
