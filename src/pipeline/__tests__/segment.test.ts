import { describe, it, expect } from 'vitest'
import { detectProject, buildChunkSummaries, buildSegmentationPrompt, buildSegmentsFromGroups } from '../segment'
import type { Chunk, Message } from '../types'

function makeMsg(role: 'user' | 'assistant', text: string, timestamp = ''): Message {
  return { role, text, isToolOutput: false, timestamp }
}

function makeChunk(overrides: Partial<Chunk> & { messages?: Message[] } = {}): Chunk {
  return {
    messages: overrides.messages ?? [makeMsg('user', 'hello')],
    userTextLen: 100,
    totalLen: 200,
    startTs: overrides.startTs ?? '2026-04-16T10:00:00Z',
    endTs: overrides.endTs ?? '2026-04-16T10:15:00Z',
    insightScore: overrides.insightScore ?? 0.5,
    ...overrides,
  }
}

describe('detectProject', () => {
  it('extracts project from ~/Code/<name> pattern', () => {
    const chunk = makeChunk({
      messages: [makeMsg('user', 'look at ~/Code/mitsein/src/main.ts')],
    })
    expect(detectProject(chunk)).toBe('mitsein')
  })

  it('returns most frequent project', () => {
    const chunk = makeChunk({
      messages: [
        makeMsg('user', '~/Code/mitsein ~/Code/mitsein ~/Code/logex'),
      ],
    })
    expect(detectProject(chunk)).toBe('mitsein')
  })

  it('returns undefined for no project paths', () => {
    const chunk = makeChunk({
      messages: [makeMsg('user', 'just some regular text')],
    })
    expect(detectProject(chunk)).toBeUndefined()
  })

  it('ignores assistant messages', () => {
    const chunk = makeChunk({
      messages: [makeMsg('assistant', '~/Code/mitsein/src/main.ts')],
    })
    expect(detectProject(chunk)).toBeUndefined()
  })
})

describe('buildChunkSummaries', () => {
  it('builds summaries with correct indices and fields', () => {
    const chunks = [
      makeChunk({
        messages: [makeMsg('user', 'debug the auth bug in ~/Code/mitsein')],
        startTs: '2026-04-16T10:00:00Z',
        endTs: '2026-04-16T10:15:00Z',
        insightScore: 0.72,
      }),
      makeChunk({
        messages: [makeMsg('user', 'now redesign the frontend')],
        startTs: '2026-04-16T11:00:00Z',
        endTs: '2026-04-16T11:30:00Z',
        insightScore: 0.45,
      }),
    ]

    const summaries = buildChunkSummaries(chunks)
    expect(summaries).toHaveLength(2)
    expect(summaries[0].index).toBe(1)
    expect(summaries[0].project).toBe('mitsein')
    expect(summaries[0].score).toBe(0.72)
    expect(summaries[0].preview).toContain('debug the auth')
    expect(summaries[1].index).toBe(2)
    expect(summaries[1].project).toBeUndefined()
  })

  it('truncates long previews', () => {
    const longText = 'a'.repeat(300)
    const chunks = [makeChunk({ messages: [makeMsg('user', longText)] })]
    const summaries = buildChunkSummaries(chunks)
    expect(summaries[0].preview.length).toBeLessThanOrEqual(201) // 200 + '…'
  })
})

describe('buildSegmentationPrompt', () => {
  it('includes all chunk summaries in the prompt', () => {
    const summaries = buildChunkSummaries([
      makeChunk({ insightScore: 0.8 }),
      makeChunk({ insightScore: 0.3 }),
    ])
    const prompt = buildSegmentationPrompt(summaries)
    expect(prompt).toContain('[1]')
    expect(prompt).toContain('[2]')
    expect(prompt).toContain('0.80')
    expect(prompt).toContain('0.30')
    expect(prompt).toContain('topic groups')
    expect(prompt).toContain('JSON')
  })
})

describe('buildSegmentsFromGroups', () => {
  const chunks = [
    makeChunk({ startTs: '2026-04-16T10:00:00Z', endTs: '2026-04-16T10:15:00Z', insightScore: 0.8 }),
    makeChunk({ startTs: '2026-04-16T10:16:00Z', endTs: '2026-04-16T10:30:00Z', insightScore: 0.6 }),
    makeChunk({ startTs: '2026-04-16T11:00:00Z', endTs: '2026-04-16T11:15:00Z', insightScore: 0.4 }),
  ]

  it('builds segments from LLM-decided groups', () => {
    const groups = [
      { title: 'Auth debugging', chunkIndices: [1, 2], project: 'mitsein', worthWriting: true },
      { title: 'Config tweaks', chunkIndices: [3], project: null, worthWriting: false },
    ]
    const segments = buildSegmentsFromGroups(chunks, groups)
    expect(segments).toHaveLength(1) // only worthWriting=true
    expect(segments[0].topicHint).toBe('Auth debugging')
    expect(segments[0].chunks).toHaveLength(2)
    expect(segments[0].totalScore).toBeCloseTo(0.7)
    expect(segments[0].project).toBe('mitsein')
  })

  it('handles empty groups', () => {
    const segments = buildSegmentsFromGroups(chunks, [])
    expect(segments).toEqual([])
  })

  it('skips invalid chunk indices', () => {
    const groups = [
      { title: 'Test', chunkIndices: [1, 99], project: null, worthWriting: true },
    ]
    const segments = buildSegmentsFromGroups(chunks, groups)
    expect(segments).toHaveLength(1)
    expect(segments[0].chunks).toHaveLength(1) // only index 1 valid
  })

  it('converts null project to undefined', () => {
    const groups = [
      { title: 'Test', chunkIndices: [1], project: null, worthWriting: true },
    ]
    const segments = buildSegmentsFromGroups(chunks, groups)
    expect(segments[0].project).toBeUndefined()
  })
})
