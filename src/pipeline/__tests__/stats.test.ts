import { describe, it, expect, vi, afterEach } from 'vitest'
import { extractRichStats } from '../stats.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('extractRichStats', () => {
  it('parses the stats script stdout', () => {
    const exec = vi.fn().mockReturnValue(JSON.stringify({ tokens: { total: 42 } }))
    const stats = extractRichStats('/tmp/s.jsonl', exec)
    expect(stats).toEqual({ tokens: { total: 42 } })
    const [cmd, args, opts] = exec.mock.calls[0]
    expect(cmd).toBe('python3')
    expect(args[0]).toContain('extract-session-stats.py')
    expect(args).toContain('--jsonl')
    expect(args).toContain('/tmp/s.jsonl')
    expect(opts).toMatchObject({ encoding: 'utf-8', timeout: 30000 })
  })

  it('returns null and warns when the subprocess fails', () => {
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exec = vi.fn().mockImplementation(() => {
      throw new Error('script not found')
    })
    expect(extractRichStats('/tmp/s.jsonl', exec)).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('stats extraction failed'),
    )
  })

  it('returns null when the script emits invalid JSON', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const exec = vi.fn().mockReturnValue('not json')
    expect(extractRichStats('/tmp/s.jsonl', exec)).toBeNull()
  })
})
