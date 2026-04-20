import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIG_HOME = process.env.HOME
const ORIG_LOGEX = process.env.GITHUB_TOKEN_LOGEX
const ORIG_TOKEN = process.env.GITHUB_TOKEN

let tmpHome: string

async function loadFresh() {
  vi.resetModules()
  return await import('../github-token.js')
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'logex-token-'))
  mkdirSync(join(tmpHome, '.claude'), { recursive: true })
  process.env.HOME = tmpHome
  delete process.env.GITHUB_TOKEN_LOGEX
  delete process.env.GITHUB_TOKEN
})

afterEach(() => {
  if (ORIG_HOME !== undefined) process.env.HOME = ORIG_HOME
  if (ORIG_LOGEX !== undefined) process.env.GITHUB_TOKEN_LOGEX = ORIG_LOGEX
  else delete process.env.GITHUB_TOKEN_LOGEX
  if (ORIG_TOKEN !== undefined) process.env.GITHUB_TOKEN = ORIG_TOKEN
  else delete process.env.GITHUB_TOKEN
  try { rmSync(tmpHome, { recursive: true, force: true }) } catch { /* ignore */ }
})

describe('resolveGitHubToken', () => {
  it('returns process.env.GITHUB_TOKEN_LOGEX first (branch 1)', async () => {
    process.env.GITHUB_TOKEN_LOGEX = 'ghp_envlogex'
    process.env.GITHUB_TOKEN = 'ghp_envtoken'
    writeFileSync(join(tmpHome, '.claude', '.env'), 'GITHUB_TOKEN_LOGEX=ghp_filelogex\nGITHUB_TOKEN=ghp_filetoken\n')
    const { resolveGitHubToken } = await loadFresh()
    expect(resolveGitHubToken()).toBe('ghp_envlogex')
  })

  it('falls back to process.env.GITHUB_TOKEN (branch 2)', async () => {
    process.env.GITHUB_TOKEN = 'ghp_envtoken'
    writeFileSync(join(tmpHome, '.claude', '.env'), 'GITHUB_TOKEN_LOGEX=ghp_filelogex\n')
    const { resolveGitHubToken } = await loadFresh()
    expect(resolveGitHubToken()).toBe('ghp_envtoken')
  })

  it('falls back to ~/.claude/.env GITHUB_TOKEN_LOGEX (branch 3)', async () => {
    writeFileSync(join(tmpHome, '.claude', '.env'), 'GITHUB_TOKEN_LOGEX=ghp_filelogex\nGITHUB_TOKEN=ghp_filetoken\n')
    const { resolveGitHubToken } = await loadFresh()
    expect(resolveGitHubToken()).toBe('ghp_filelogex')
  })

  it('falls back to ~/.claude/.env GITHUB_TOKEN (branch 4)', async () => {
    writeFileSync(join(tmpHome, '.claude', '.env'), 'GITHUB_TOKEN=ghp_filetoken\n')
    const { resolveGitHubToken } = await loadFresh()
    expect(resolveGitHubToken()).toBe('ghp_filetoken')
  })

  it('throws MissingGitHubTokenError with actionable URL if no source has a token', async () => {
    // No env vars, no file
    const { resolveGitHubToken, MissingGitHubTokenError } = await loadFresh()
    let err: Error | null = null
    try { resolveGitHubToken() } catch (e) { err = e as Error }
    expect(err).toBeInstanceOf(MissingGitHubTokenError)
    expect(err?.message).toContain('https://github.com/settings/tokens/new')
    expect(err?.message).toContain("'repo' scope")
  })

  it('ignores empty-string file entries and falls through', async () => {
    writeFileSync(join(tmpHome, '.claude', '.env'), 'GITHUB_TOKEN_LOGEX=\nGITHUB_TOKEN=ghp_filetoken\n')
    const { resolveGitHubToken } = await loadFresh()
    expect(resolveGitHubToken()).toBe('ghp_filetoken')
  })

  it('maskToken redacts token for logging', async () => {
    const { maskToken } = await loadFresh()
    expect(maskToken('ghp_supersecret')).toBe('ghp_***')
    expect(maskToken('something-else')).toBe('[REDACTED]')
    expect(maskToken(undefined)).toBe('[REDACTED]')
  })

  it('swallows .env read errors (readFileSync throws) and falls through', async () => {
    // Make ~/.claude a file rather than a directory so readFileSync of
    // ~/.claude/.env throws EISDIR/ENOTDIR. The catch branch on L25 in
    // github-token.ts should swallow that and behave as if the file were absent.
    rmSync(join(tmpHome, '.claude'), { recursive: true, force: true })
    // Create a symlink loop or simply a permission issue: easier — create
    // a directory entry at the .env path so readFileSync fails with EISDIR.
    mkdirSync(join(tmpHome, '.claude'), { recursive: true })
    mkdirSync(join(tmpHome, '.claude', '.env'))
    // Now readFileSync will throw EISDIR since .env is a directory.
    const { resolveGitHubToken, MissingGitHubTokenError } = await loadFresh()
    let err: Error | null = null
    try { resolveGitHubToken() } catch (e) { err = e as Error }
    // With no env vars and .env unreadable, MissingGitHubTokenError is thrown.
    expect(err).toBeInstanceOf(MissingGitHubTokenError)
  })
})
