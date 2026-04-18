#!/usr/bin/env node
// Verify logex-data i18n structure (OUT-1, OUT-2).
// Exit 0 = pass; non-zero = fail with stderr explanation.
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const DATA = process.argv[2] || `${process.env.HOME}/Code/logex-data`
const idx = JSON.parse(readFileSync(join(DATA, 'index.json'), 'utf-8'))

const fails = []
let zhCount = 0, enCount = 0

// walk all article JSONs
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(zh|en)\.json$/.test(name)) {
      if (name.endsWith('.zh.json')) zhCount++
      else enCount++
    } else if (/^\d{4}-.*\.json$/.test(name) && !name.endsWith('.zh.json') && !name.endsWith('.en.json')) {
      fails.push(`legacy flat file still exists: ${p}`)
    }
  }
}
for (const y of ['2025', '2026']) {
  const p = join(DATA, y)
  if (existsSync(p)) walk(p)
}

console.log(`found ${zhCount} .zh.json, ${enCount} .en.json`)
if (zhCount !== enCount) fails.push(`.zh/.en count mismatch: ${zhCount} vs ${enCount}`)
if (idx.articles.length !== zhCount) fails.push(`index entries (${idx.articles.length}) != zh files (${zhCount})`)

// Check every index entry has proper i18n shape
for (const e of idx.articles) {
  if (!e.primaryLang) fails.push(`${e.slug}: missing primaryLang`)
  if (!e.i18n || !e.i18n.zh || !e.i18n.en) fails.push(`${e.slug}: missing i18n.zh or i18n.en`)
  else {
    for (const lang of ['zh', 'en']) {
      const m = e.i18n[lang]
      if (!m.title || !m.summary || !m.path) fails.push(`${e.slug}: i18n.${lang} missing fields`)
      else if (!existsSync(join(DATA, m.path))) fails.push(`${e.slug}: i18n.${lang}.path not readable: ${m.path}`)
    }
  }
}

if (fails.length) {
  console.error(`\n❌ ${fails.length} failures:`)
  for (const f of fails.slice(0, 20)) console.error('  ' + f)
  process.exit(1)
}
console.log(`✅ verified ${idx.articles.length} articles, ${zhCount} zh + ${enCount} en files, index schema clean`)
