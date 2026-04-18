#!/usr/bin/env tsx
// One-off: translate the 3 new-shape entries that backfill skipped.
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import Anthropic from '@anthropic-ai/sdk'
import { buildTranslateRewritePrompt, toTranslatable } from '../src/pipeline/prompt'
import type { SessionArticle } from '../src/pipeline/types'

const DATA = join(homedir(), 'Code', 'logex-data')
const SLUGS = [
  '2026-04-18-2026-04-17-opc-extension-capability-contract',
  '2026-04-18-2026-04-17-logex-genesis',
  '2026-04-18-2026-04-17-github-oauth-automation-dead-end',
]

async function translate(source: SessionArticle) {
  const prompt = buildTranslateRewritePrompt(toTranslatable(source), 'zh', 'en')
  const client = new Anthropic()
  const resp = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  const first = cleaned.indexOf('{'), last = cleaned.lastIndexOf('}')
  return JSON.parse(cleaned.slice(first, last + 1))
}

async function main() {
  const idxPath = join(DATA, 'index.json')
  const idx = JSON.parse(readFileSync(idxPath, 'utf-8'))

  for (const slug of SLUGS) {
    const entry = idx.articles.find((a: any) => a.slug === slug)
    if (!entry) { console.error(`${slug}: not in index`); continue }
    const zhPath = entry.i18n.zh.path
    const enPath = zhPath.replace(/\.zh\.json$/, '.en.json')
    const zhAbs = join(DATA, zhPath)
    const enAbs = join(DATA, enPath)

    const source = JSON.parse(readFileSync(zhAbs, 'utf-8')) as SessionArticle
    console.error(`translating ${slug} ...`)
    const t = await translate(source)
    const enBody: SessionArticle = {
      ...source, lang: 'en',
      title: t.title, summary: t.summary, body: t.body,
    }
    writeFileSync(enAbs, JSON.stringify(enBody, null, 2))
    entry.i18n.en = { title: t.title, summary: t.summary, path: enPath }
    console.error(`  ✓ ${enPath}`)
  }

  idx.lastUpdated = new Date().toISOString().slice(0, 10)
  writeFileSync(idxPath, JSON.stringify(idx, null, 2))
  console.log(JSON.stringify({ translated: SLUGS.length }, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
