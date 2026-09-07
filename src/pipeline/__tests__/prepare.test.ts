import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runPrepare } from '../prepare.js'

// Rich-stats extraction shells out to a local python script — a process
// boundary. Mock the stats module so tests are hermetic on machines
// with or without the session-recap skill installed.
const extractRichStatsMock = vi.hoisted(() => vi.fn())
vi.mock('../stats.js', () => ({ extractRichStats: extractRichStatsMock }))

class ExitSignal extends Error {
  readonly code: number
  constructor(code: number) {
    super(`exit ${code}`)
    this.code = code
  }
}

interface Captured {
  stderr: string
  stdout: string
  exitCode: number | null
}

function makeIO(argv: string[]) {
  const captured: Captured = { stderr: '', stdout: '', exitCode: null }
  const io = {
    argv,
    stderr: (s: string) => {
      captured.stderr += s
    },
    stdout: (s: string) => {
      captured.stdout += s
    },
    exit: (code: number): never => {
      captured.exitCode = code
      throw new ExitSignal(code)
    },
  }
  return { io, captured }
}

function withFixture(lines: string[], fn: (file: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'logex-prepare-'))
  const file = join(dir, 'session.jsonl')
  writeFileSync(file, lines.join('\n') + '\n')
  try {
    fn(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const USER_MSG =
  'Please debug this error: the auth token refresh is broken. '
  + 'The reason seems to be a race condition. How do we fix it?'

const claudeFixture = [
  JSON.stringify({
    type: 'user',
    message: { role: 'user', content: USER_MSG },
    timestamp: '2026-01-01T10:00:00Z',
    sessionId: 'sess-claude-1',
  }),
  JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: 'Checking the refresh path now.' },
    timestamp: '2026-01-01T10:00:05Z',
    sessionId: 'sess-claude-1',
  }),
]

const codexFixture = [
  JSON.stringify({
    timestamp: '2026-01-01T10:00:00Z',
    type: 'session_meta',
    payload: { session_id: 'codex-sess-42' },
  }),
  JSON.stringify({
    timestamp: '2026-01-01T10:00:01Z',
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: USER_MSG }],
    },
  }),
]

describe('runPrepare CLI tail', () => {
  it('usage error when no jsonl path is given', () => {
    const { io, captured } = makeIO([])
    expect(() => runPrepare(io)).toThrow(ExitSignal)
    expect(captured.exitCode).toBe(1)
    expect(captured.stderr).toMatch(/Usage: logex prepare/)
  })

  it('rejects an invalid --mode value before touching the filesystem', () => {
    const { io, captured } = makeIO(['x.jsonl', '--mode', 'bogus'])
    expect(() => runPrepare(io)).toThrow(ExitSignal)
    expect(captured.exitCode).toBe(1)
    expect(captured.stderr).toMatch(/Invalid mode/)
  })

  it('article mode emits chunk summaries + segmentation prompt with rich stats', () => {
    extractRichStatsMock.mockReturnValue({ tokens: { total: 1234 } })
    withFixture(claudeFixture, (file) => {
      const { io, captured } = makeIO([file, '--mode', 'article'])
      runPrepare(io)
      expect(captured.exitCode).toBeNull()
      const payload = JSON.parse(captured.stdout)
      expect(payload.sessionId).toBe('sess-claude-1')
      expect(payload.mode).toBe('article')
      expect(payload.prompt).toBeNull()
      expect(payload.chunkSummaries.length).toBeGreaterThan(0)
      expect(payload.chunkSummaries[0].score).toBeGreaterThanOrEqual(0.25)
      expect(payload.segmentationPrompt).toContain('coding agent session')
      expect(payload.meta.richStats).toEqual({ tokens: { total: 1234 } })
      expect(extractRichStatsMock).toHaveBeenCalledWith(file)
      expect(captured.stderr).toMatch(/Signal chunks: 1 \/ 1/)
    })
  })

  it('cards mode emits a single extraction prompt', () => {
    extractRichStatsMock.mockReturnValue(null)
    withFixture(claudeFixture, (file) => {
      const { io, captured } = makeIO([file, '--mode', 'cards'])
      runPrepare(io)
      const payload = JSON.parse(captured.stdout)
      expect(payload.mode).toBe('cards')
      expect(typeof payload.prompt).toBe('string')
      expect(payload.prompt.length).toBeGreaterThan(0)
      expect(payload.chunkSummaries).toEqual([])
    })
  })

  it('sessions without usable messages hit the no-signal path and exit 0', () => {
    extractRichStatsMock.mockReturnValue(null)
    const tiny = [
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'hi' },
        timestamp: '2026-01-01T10:00:00Z',
        sessionId: 'sess-tiny',
      }),
    ]
    withFixture(tiny, (file) => {
      const { io, captured } = makeIO([file])
      expect(() => runPrepare(io)).toThrow(ExitSignal)
      expect(captured.exitCode).toBe(0)
      const payload = JSON.parse(captured.stdout)
      expect(payload.chunkSummaries).toEqual([])
      expect(payload.segmentationPrompt).toBeNull()
      expect(payload.meta.richStats).toBeNull()
    })
  })

  it('extracts sessionId from Codex session_meta payload', () => {
    extractRichStatsMock.mockReturnValue(null)
    withFixture(codexFixture, (file) => {
      const { io, captured } = makeIO([file, '--mode', 'article'])
      runPrepare(io)
      const payload = JSON.parse(captured.stdout)
      expect(payload.sessionId).toBe('codex-sess-42')
    })
  })
})
