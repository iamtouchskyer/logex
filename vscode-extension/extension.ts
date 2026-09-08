import * as vscode from 'vscode'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface SessionEntry {
  timestamp: string
  project: string
  path: string
}

interface LogexRun {
  ok: boolean
  stdout: string
  stderr: string
}

const MAX_BUFFER = 64 * 1024 * 1024

// npm installs .cmd shims on Windows — spawning the bare name fails there.
const LOGEX_BIN = process.platform === 'win32' ? 'logex.cmd' : 'logex'
const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function runLogex(args: string[]): LogexRun {
  const direct = spawnSync(LOGEX_BIN, args, { encoding: 'utf-8', maxBuffer: MAX_BUFFER })
  if (!direct.error) {
    return { ok: direct.status === 0, stdout: direct.stdout ?? '', stderr: direct.stderr ?? '' }
  }
  // logex not on PATH — fall back to the npm package runner.
  const viaNpx = spawnSync(
    NPX_BIN,
    ['--yes', '@touchskyer/logex', ...args],
    { encoding: 'utf-8', maxBuffer: MAX_BUFFER },
  )
  return {
    ok: !viaNpx.error && viaNpx.status === 0,
    stdout: viaNpx.stdout ?? '',
    stderr: viaNpx.stderr ?? '',
  }
}

function parseSessionList(stdout: string): SessionEntry[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\S+)\s{2}(\S+)\s{2}(.+)$/)
      return m ? { timestamp: m[1], project: m[2], path: m[3] } : null
    })
    .filter((e): e is SessionEntry => e !== null)
}

async function prepareSession(entry: SessionEntry): Promise<void> {
  const run = runLogex(['prepare', entry.path, '--mode', 'article'])
  if (!run.ok || !run.stdout.trim()) {
    const detail = (run.stderr || 'no output').split('\n').slice(-3).join(' ').slice(0, 300)
    void vscode.window.showErrorMessage(`logex prepare failed: ${detail}`)
    return
  }
  const outDir = mkdtempSync(join(tmpdir(), 'logex-vscode-'))
  const outFile = join(outDir, 'prepare.json')
  writeFileSync(outFile, run.stdout)
  const doc = await vscode.workspace.openTextDocument(outFile)
  await vscode.window.showTextDocument(doc)
  void vscode.window.showInformationMessage(
    'Prepared. Feed the segmentationPrompt to your agent, then publish with `logex publish prepare-match` + `execute`.',
  )
}

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('logex.writeArticle', async () => {
    const sessions = parseSessionList(runLogex(['list']).stdout)
    if (sessions.length === 0) {
      void vscode.window.showInformationMessage(
        'No recent logex sessions found under ~/.claude/projects or ~/.codex/sessions.',
      )
      return
    }
    const picked = await vscode.window.showQuickPick(
      sessions.map((s) => ({
        label: `${s.project} - ${new Date(s.timestamp).toLocaleString()}`,
        detail: s.path,
        entry: s,
      })),
      { placeHolder: 'Select a coding-agent session to prepare' },
    )
    if (picked) await prepareSession(picked.entry)
  })
  context.subscriptions.push(disposable)
}

export function deactivate(): void {
  // no-op
}
