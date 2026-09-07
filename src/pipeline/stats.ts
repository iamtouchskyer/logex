import { execFileSync } from 'node:child_process'

const STATS_SCRIPT = `${process.env.HOME}/.claude/skills/session-recap/scripts/extract-session-stats.py`

type ExecFileSync = typeof execFileSync

/**
 * Rich stats via the local session-recap skill (process boundary).
 * Optional by design — machines without the skill degrade to null stats.
 * `exec` is injectable for tests.
 */
export function extractRichStats(
  jsonlPath: string,
  exec: ExecFileSync = execFileSync,
): Record<string, unknown> | null {
  try {
    const out = exec('python3', [STATS_SCRIPT, '--jsonl', jsonlPath], {
      encoding: 'utf-8',
      timeout: 30000,
    })
    return JSON.parse(out)
  } catch {
    console.error('Warning: session-recap stats extraction failed, continuing without rich stats')
    return null
  }
}
