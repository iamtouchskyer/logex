import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as dotenv from 'dotenv'

export class MissingGitHubTokenError extends Error {
  constructor() {
    super(
      "GITHUB_TOKEN missing. Generate a classic PAT with 'repo' scope at https://github.com/settings/tokens/new and set GITHUB_TOKEN in ~/.claude/.env",
    )
    this.name = 'MissingGitHubTokenError'
  }
}

/**
 * Read `~/.claude/.env` into a plain object without mutating process.env.
 * Returns `{}` if the file is missing or unreadable.
 */
function readClaudeEnvFile(): Record<string, string> {
  const path = join(homedir(), '.claude', '.env')
  if (!existsSync(path)) return {}
  try {
    const buf = readFileSync(path)
    return dotenv.parse(buf)
  } catch {
    return {}
  }
}

/**
 * Resolve GitHub token via 4-branch precedence:
 *   1. process.env.GITHUB_TOKEN_LOGEX
 *   2. process.env.GITHUB_TOKEN
 *   3. ~/.claude/.env GITHUB_TOKEN_LOGEX
 *   4. ~/.claude/.env GITHUB_TOKEN
 * Throws MissingGitHubTokenError if none present.
 * Never logs the token.
 */
export function resolveGitHubToken(): string {
  const envLogex = process.env.GITHUB_TOKEN_LOGEX
  if (envLogex && envLogex.trim()) return envLogex.trim()

  const envToken = process.env.GITHUB_TOKEN
  if (envToken && envToken.trim()) return envToken.trim()

  const fileEnv = readClaudeEnvFile()
  const fileLogex = fileEnv.GITHUB_TOKEN_LOGEX
  if (fileLogex && fileLogex.trim()) return fileLogex.trim()

  const fileToken = fileEnv.GITHUB_TOKEN
  if (fileToken && fileToken.trim()) return fileToken.trim()

  throw new MissingGitHubTokenError()
}

/** Mask a token for safe logging. Never include the raw token. */
export function maskToken(token: string | undefined | null): string {
  if (!token) return '[REDACTED]'
  return token.startsWith('ghp_') ? 'ghp_***' : '[REDACTED]'
}
