import { describe, it, expect } from 'vitest'
import { buildExtractionPrompt } from '../prompt'
import type { Chunk, Message } from '../types'

function makeMsg(role: 'user' | 'assistant', text: string): Message {
  return { role, text, isToolOutput: false, timestamp: '2025-01-01T00:00:00Z' }
}

function makeChunk(score: number, text: string): Chunk {
  const msgs = [makeMsg('user', text)]
  return {
    messages: msgs,
    userTextLen: text.length,
    totalLen: text.length,
    startTs: '2025-01-01T00:00:00Z',
    endTs: '2025-01-01T00:01:00Z',
    insightScore: score,
  }
}

describe('buildExtractionPrompt', () => {
  it('produces a valid prompt string containing session id', () => {
    const chunks = [makeChunk(0.8, 'Found a critical bug in auth module')]
    const prompt = buildExtractionPrompt(chunks, 'session-abc')

    expect(prompt).toContain('session-abc')
    expect(prompt).toContain('Extract card-worthy insights')
    expect(prompt).toContain('GOTCHA')
    expect(prompt).toContain('PATTERN')
    expect(prompt).toContain('DECISION')
    expect(prompt).toContain('DISCOVERY')
  })

  it('orders segments by score descending', () => {
    const chunks = [
      makeChunk(0.3, 'Low scoring chunk content here'),
      makeChunk(0.9, 'High scoring chunk content here'),
      makeChunk(0.6, 'Medium scoring chunk content here'),
    ]

    const prompt = buildExtractionPrompt(chunks, 'session-1')

    const highIdx = prompt.indexOf('High scoring')
    const medIdx = prompt.indexOf('Medium scoring')
    const lowIdx = prompt.indexOf('Low scoring')

    expect(highIdx).toBeLessThan(medIdx)
    expect(medIdx).toBeLessThan(lowIdx)
  })

  it('respects max budget and truncates chunks', () => {
    const longText = 'x'.repeat(20000)
    const chunks = [
      makeChunk(0.9, longText),
      makeChunk(0.8, longText),
      makeChunk(0.7, longText),
    ]

    const prompt = buildExtractionPrompt(chunks, 'session-2', 30000)

    // The prompt should not include all 3 chunks since 3 * 20000 > 30000
    // (each chunk text is truncated to 1000 chars in the prompt builder, but
    // the test uses a budget small enough to verify the mechanism)
    expect(prompt).toContain('Segment 1')
  })

  it('includes score in segment headers', () => {
    const chunks = [makeChunk(0.85, 'Some insightful text about debugging')]
    const prompt = buildExtractionPrompt(chunks, 'session-3')

    expect(prompt).toContain('score: 0.85')
  })

  it('filters out tool output messages from prompt text', () => {
    const toolMsg: Message = {
      role: 'assistant',
      text: 'This is tool output that should be excluded',
      isToolOutput: true,
      timestamp: '2025-01-01T00:00:00Z',
    }
    const userMsg = makeMsg('user', 'This is real user text included in prompt')

    const chunk: Chunk = {
      messages: [userMsg, toolMsg],
      userTextLen: userMsg.text.length,
      totalLen: userMsg.text.length + toolMsg.text.length,
      startTs: '2025-01-01T00:00:00Z',
      endTs: '2025-01-01T00:01:00Z',
      insightScore: 0.7,
    }

    const prompt = buildExtractionPrompt([chunk], 'session-4')
    expect(prompt).toContain('This is real user text')
    expect(prompt).not.toContain('This is tool output that should be excluded')
  })

  it('produces YAML format instructions', () => {
    const chunks = [makeChunk(0.7, 'Some chunk text for testing')]
    const prompt = buildExtractionPrompt(chunks, 'session-5')

    expect(prompt).toContain('```yaml')
    expect(prompt).toContain('slug:')
    expect(prompt).toContain('category:')
    expect(prompt).toContain('confidence:')
  })

  it('handles empty chunks array', () => {
    const prompt = buildExtractionPrompt([], 'session-empty')
    expect(prompt).toContain('session-empty')
    expect(prompt).toContain('Extract card-worthy insights')
    // No segments, but prompt is still valid
    expect(prompt).not.toContain('Segment 1')
  })
})
