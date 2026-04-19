#!/usr/bin/env tsx
/**
 * backfill-i18n.ts — Migrate existing logex-data articles to the i18n schema.
 *
 * What it does (per article in logex-data/index.json):
 *   1. Assume primaryLang='zh' (current corpus is all Chinese).
 *   2. Rename the flat `<slug>.json` → `<slug>.zh.json`.
 *      Rewrite the JSON body: add `lang: 'zh'`, keep everything else.
 *   3. Call Claude to translate+rewrite the article in English.
 *      Write `<slug>.en.json` with `lang: 'en'`.
 *   4. Rewrite the index.json entry into the new i18n shape
 *      (primaryLang + i18n map).
 *
 * Flags:
 *   --data-dir <dir>     (default: ~/Code/logex-data)
 *   --dry-run            Preview actions, no writes, no LLM calls
 *   --only <slug>        Process only this slug
 *   --limit <n>          Process at most N articles (ordered by date desc)
 *   --skip-translation   Migrate schema only (rename + index rewrite), no EN
 *   --force              Re-translate even if an en file already exists
 *
 * Usage:
 *   npx tsx scripts/backfill-i18n.ts --dry-run
 *   npx tsx scripts/backfill-i18n.ts --only 2026-04-16-opc-hardening-journey --limit 1
 *   npx tsx scripts/backfill-i18n.ts                # full run
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import Anthropic from '@anthropic-ai/sdk'
import { buildTranslateRewritePrompt, toTranslatable } from '../src/pipeline/prompt'
import type { Lang, SessionArticle } from '../src/pipeline/types'

interface Args {
  dataDir: string
  dryRun: boolean
  only?: string
  limit?: number
  skipTranslation: boolean
  force: boolean
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`)
    return i === -1 ? undefined : argv[i + 1]
  }
  const has = (name: string) => argv.includes(`--${name}`)
  return {
    dataDir: get('data-dir') ?? join(homedir(), 'Code', 'logex-data'),
    dryRun: has('dry-run'),
    only: get('only'),
    limit: get('limit') ? Number(get('limit')) : undefined,
    skipTranslation: has('skip-translation'),
    force: has('force'),
  }
}

interface LegacyEntry {
  slug: string
  title: string
  summary: string
  date: string
  tags: string[]
  project?: string
  sessionId?: string
  chunkIndices?: number[]
  duration?: string
  stats?: SessionArticle['stats']
  heroImage?: string
  path: string
}

interface LangMeta { title: string; summary: string; path: string }
interface NewEntry {
  slug: string
  date: string
  project: string
  tags: string[]
  sessionId?: string
  chunkIndices?: number[]
  duration?: string
  stats?: SessionArticle['stats']
  heroImage?: string
  primaryLang: Lang
  i18n: Partial<Record<Lang, LangMeta>>
}

function isNewShape(e: unknown): boolean {
  return !!e && typeof e === 'object' && 'i18n' in e && !!(e as Record<string, unknown>).i18n
}

async function translateArticle(source: SessionArticle): Promise<{
  title: string
  summary: string
  body: string
  tags: string[]
  project?: string
}> {
  const prompt = buildTranslateRewritePrompt(toTranslatable(source), 'zh', 'en')
  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  // Strip ```json fences if present
  const jsonStr = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  // Try to locate the outermost JSON object
  const firstBrace = jsonStr.indexOf('{')
  const lastBrace = jsonStr.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error(`No JSON object in translation response: ${text.slice(0, 200)}`)
  }
  const parsed = JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1))
  if (!parsed.title || !parsed.body) {
    throw new Error(`Translation response missing title/body: ${JSON.stringify(parsed).slice(0, 200)}`)
  }
  return parsed
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { dataDir, dryRun, only, limit, skipTranslation, force } = args

  console.error(`[backfill-i18n] dataDir=${dataDir} dryRun=${dryRun} only=${only ?? '-'} limit=${limit ?? '-'} skipTranslation=${skipTranslation} force=${force}`)

  const indexPath = join(dataDir, 'index.json')
  if (!existsSync(indexPath)) {
    console.error(`index.json not found at ${indexPath}`)
    process.exit(1)
  }
  const index: { articles: Record<string, unknown>[]; lastUpdated: string } = JSON.parse(
    readFileSync(indexPath, 'utf-8'),
  )

  let entries = index.articles.slice()
  if (only) entries = entries.filter((e) => e.slug === only)
  entries.sort((a, b) => (b.slug > a.slug ? 1 : -1))
  if (limit) entries = entries.slice(0, limit)

  console.error(`[backfill-i18n] will process ${entries.length} entries`)

  const report: Array<{ slug: string; action: string; note?: string }> = []

  for (const raw of entries) {
    const slug = raw.slug
    if (isNewShape(raw) && !force) {
      report.push({ slug, action: 'skip', note: 'already-i18n' })
      continue
    }
    const legacy: LegacyEntry = raw as LegacyEntry

    // --- Step 1: rename body file to .zh.json ---
    const oldAbsPath = join(dataDir, legacy.path)
    const zhRelPath = legacy.path.replace(/\.json$/, '.zh.json')
    const zhAbsPath = join(dataDir, zhRelPath)

    let bodyJson: SessionArticle
    if (existsSync(oldAbsPath)) {
      bodyJson = JSON.parse(readFileSync(oldAbsPath, 'utf-8')) as SessionArticle
    } else if (existsSync(zhAbsPath)) {
      bodyJson = JSON.parse(readFileSync(zhAbsPath, 'utf-8')) as SessionArticle
    } else {
      report.push({ slug, action: 'error', note: `body file missing: ${legacy.path}` })
      continue
    }

    // Ensure lang field on body
    bodyJson.lang = 'zh'

    if (!dryRun) {
      if (existsSync(oldAbsPath) && oldAbsPath !== zhAbsPath) {
        renameSync(oldAbsPath, zhAbsPath)
      }
      writeFileSync(zhAbsPath, JSON.stringify(bodyJson, null, 2))
    }

    // --- Step 2: translate to EN ---
    const enRelPath = legacy.path.replace(/\.json$/, '.en.json')
    const enAbsPath = join(dataDir, enRelPath)
    let enMeta: LangMeta | undefined

    const enExists = existsSync(enAbsPath)
    if (skipTranslation) {
      // pass
    } else if (enExists && !force) {
      const existing = JSON.parse(readFileSync(enAbsPath, 'utf-8'))
      enMeta = { title: existing.title, summary: existing.summary, path: enRelPath }
    } else {
      if (dryRun) {
        report.push({ slug, action: 'would-translate' })
      } else {
        console.error(`[backfill-i18n] translating ${slug} → en ...`)
        try {
          const t = await translateArticle(bodyJson)
          const enBody: SessionArticle = {
            ...bodyJson,
            lang: 'en',
            title: t.title,
            summary: t.summary,
            body: t.body,
            // tags + project stay unchanged per prompt rules
          }
          writeFileSync(enAbsPath, JSON.stringify(enBody, null, 2))
          enMeta = { title: t.title, summary: t.summary, path: enRelPath }
        } catch (err) {
          report.push({ slug, action: 'error', note: `translate-failed: ${(err as Error).message}` })
          continue
        }
      }
    }

    // --- Step 3: rewrite index entry ---
    const newEntry: NewEntry = {
      slug,
      date: legacy.date ?? slug.slice(0, 10),
      project: legacy.project ?? '',
      tags: legacy.tags ?? [],
      sessionId: legacy.sessionId,
      chunkIndices: legacy.chunkIndices,
      duration: legacy.duration,
      stats: legacy.stats,
      heroImage: legacy.heroImage,
      primaryLang: 'zh',
      i18n: {
        zh: {
          title: legacy.title,
          summary: legacy.summary,
          path: zhRelPath,
        },
        ...(enMeta ? { en: enMeta } : {}),
      },
    }

    // Mutate in place (find by slug)
    const idx = index.articles.findIndex((a) => a.slug === slug)
    if (idx !== -1 && !dryRun) {
      index.articles[idx] = newEntry
    }

    report.push({
      slug,
      action: dryRun ? 'would-migrate' : 'migrated',
      note: enMeta ? 'zh+en' : 'zh-only',
    })
  }

  if (!dryRun) {
    index.lastUpdated = new Date().toISOString().slice(0, 10)
    writeFileSync(indexPath, JSON.stringify(index, null, 2))
  }

  console.error('[backfill-i18n] done')
  console.log(JSON.stringify({ report, dryRun }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
