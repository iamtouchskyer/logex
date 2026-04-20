#!/usr/bin/env node
/**
 * check-secrets.mjs — block common prod-secret patterns from reaching git.
 *
 * Usage:
 *   node scripts/check-secrets.mjs                 # scan `git diff --cached`
 *   node scripts/check-secrets.mjs <file> [<file>] # scan given files
 *
 * Exit 0 = clean. Exit 1 = at least one match. Output is filename + line
 * number + which pattern family tripped (never the secret value).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';

// Single danger regex. The three env-var names must be followed by `=<value>`
// so prose mentioning them in docs doesn't trip.
const DANGER_RE =
  /(BLOB_READ_WRITE_TOKEN|GITHUB_CLIENT_SECRET|SESSION_SECRET)\s*=\s*\S+|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}/;

function patternFamily(match) {
  if (/^BLOB_READ_WRITE_TOKEN/.test(match)) return 'BLOB_READ_WRITE_TOKEN';
  if (/^GITHUB_CLIENT_SECRET/.test(match)) return 'GITHUB_CLIENT_SECRET';
  if (/^SESSION_SECRET/.test(match)) return 'SESSION_SECRET';
  if (/^sk-/.test(match)) return 'sk-*';
  if (/^ghp_/.test(match)) return 'ghp_*';
  return 'unknown';
}

/** @returns {{ file: string, line: number, family: string }[]} */
function scanContent(file, content) {
  const hits = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DANGER_RE);
    if (m) hits.push({ file, line: i + 1, family: patternFamily(m[0]) });
  }
  return hits;
}

function scanFile(path) {
  if (!existsSync(path)) return [];
  try {
    const st = statSync(path);
    if (!st.isFile()) return [];
  } catch {
    return [];
  }
  let content = '';
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  return scanContent(path, content);
}

function scanStagedDiff() {
  // List of staged files (Added, Copied, Modified, Renamed).
  let nameOnly = '';
  try {
    nameOnly = execFileSync(
      'git',
      ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
      { encoding: 'utf8' },
    );
  } catch (e) {
    console.error('check-secrets: git diff failed:', e?.message || e);
    process.exit(2);
  }
  const files = nameOnly.split('\n').filter(Boolean);
  const hits = [];
  for (const f of files) {
    // Scan the staged blob content (not working tree) so that `git add` of a
    // secret followed by a working-tree revert is still caught.
    let staged = '';
    try {
      staged = execFileSync('git', ['show', `:${f}`], { encoding: 'utf8' });
    } catch {
      continue; // binary / deleted / unreadable — skip
    }
    hits.push(...scanContent(f, staged));
  }
  return hits;
}

function main() {
  const args = process.argv.slice(2);
  const hits = args.length
    ? args.flatMap(scanFile)
    : scanStagedDiff();

  if (hits.length === 0) {
    process.exit(0);
  }

  console.error('');
  console.error('✘ check-secrets: potential secret(s) detected:');
  for (const h of hits) {
    console.error(`  - ${h.file}:${h.line}  pattern=${h.family}`);
  }
  console.error('');
  console.error('Refusing the operation. If this is a false positive, tighten');
  console.error('scripts/check-secrets.mjs — do NOT bypass with --no-verify.');
  process.exit(1);
}

main();
