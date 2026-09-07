// Sync the release version into manifests that `npm version` does not touch.
// Run from the repo root: node scripts/sync-version.mjs <version>
import { readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2]
if (!version) {
  console.error('usage: node scripts/sync-version.mjs <version>')
  process.exit(1)
}

const targets = [
  ['.claude-plugin/plugin.json', (pkg) => ({ ...pkg, version })],
  [
    '.claude-plugin/marketplace.json',
    (pkg) => ({ ...pkg, plugins: pkg.plugins.map((p) => ({ ...p, version })) }),
  ],
  [
    'server.json',
    (pkg) => ({
      ...pkg,
      version,
      packages: pkg.packages.map((p) => ({ ...p, version })),
    }),
  ],
]

for (const [file, bump] of targets) {
  const next = bump(JSON.parse(readFileSync(file, 'utf-8')))
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`synced ${file} -> ${version}`)
}
