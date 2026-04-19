import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const PUBLISH_SCRIPT = join(__dirname, '..', 'publish.ts')

function runPublish(args: string[]): string {
  return execFileSync('npx', ['tsx', PUBLISH_SCRIPT, ...args], {
    encoding: 'utf-8',
    timeout: 15000,
  })
}

describe('publish.ts', () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = join(tmpdir(), `logex-publish-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dataDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(dataDir)) {
      rmSync(dataDir, { recursive: true })
    }
  })

  function writeIndex(index: { articles: unknown[]; lastUpdated: string }) {
    writeFileSync(join(dataDir, 'index.json'), JSON.stringify(index))
  }

  function writeArticles(articles: unknown[]): string {
    const p = join(dataDir, 'new-articles.json')
    writeFileSync(p, JSON.stringify(articles))
    return p
  }

  function writeDecisions(decisions: unknown[]): string {
    const p = join(dataDir, 'decisions.json')
    writeFileSync(p, JSON.stringify({ decisions }))
    return p
  }

  describe('prepare-match', () => {
    it('returns needsLlm=false when no existing articles for session', () => {
      writeIndex({ articles: [], lastUpdated: '' })
      const artPath = writeArticles([
        { title: 'Test', summary: 'x', body: 'y', tags: [], chunkIndices: [1, 2] },
      ])

      const out = runPublish([
        'prepare-match',
        '--data-dir', dataDir,
        '--session-id', 'abc123',
        '--articles', artPath,
      ])
      const result = JSON.parse(out)
      expect(result.needsLlm).toBe(false)
      expect(result.decisions).toHaveLength(1)
      expect(result.decisions[0].action).toBe('insert')
    })

    it('returns needsLlm=true when existing articles have same sessionId (legacy shape)', () => {
      writeIndex({
        articles: [{
          slug: '2026-04-14-old',
          title: 'Old Article',
          sessionId: 'abc123',
          chunkIndices: [1, 2, 3],
          path: '2026/04/14/2026-04-14-old.json',
        }],
        lastUpdated: '',
      })
      const artPath = writeArticles([
        { title: 'New Version', summary: 'x', body: 'y', tags: [], chunkIndices: [1, 2, 3, 4] },
      ])

      const out = runPublish([
        'prepare-match',
        '--data-dir', dataDir,
        '--session-id', 'abc123',
        '--articles', artPath,
      ])
      const result = JSON.parse(out)
      expect(result.needsLlm).toBe(true)
      expect(result.matchingPrompt).toContain('abc123')
      expect(result.matchingPrompt).toContain('Old Article')
      expect(result.matchingPrompt).toContain('New Version')
    })

    it('reads title from i18n[primaryLang] in new-shape existing entries', () => {
      writeIndex({
        articles: [{
          slug: '2026-04-14-old',
          sessionId: 'abc123',
          chunkIndices: [1, 2, 3],
          primaryLang: 'zh',
          i18n: {
            zh: { title: '旧中文标题', summary: 'x', path: '2026/04/14/2026-04-14-old.zh.json' },
            en: { title: 'Old English Title', summary: 'x', path: '2026/04/14/2026-04-14-old.en.json' },
          },
        }],
        lastUpdated: '',
      })
      const artPath = writeArticles([
        { title: 'New Version', summary: 'x', body: 'y', tags: [], chunkIndices: [1, 2, 3, 4] },
      ])

      const out = runPublish([
        'prepare-match',
        '--data-dir', dataDir,
        '--session-id', 'abc123',
        '--articles', artPath,
      ])
      const result = JSON.parse(out)
      expect(result.needsLlm).toBe(true)
      expect(result.matchingPrompt).toContain('旧中文标题')
    })

    it('ignores existing articles without chunkIndices', () => {
      writeIndex({
        articles: [{
          slug: '2026-04-14-old',
          title: 'Old',
          sessionId: 'abc123',
          path: '2026/04/14/2026-04-14-old.json',
        }],
        lastUpdated: '',
      })
      const artPath = writeArticles([
        { title: 'New', summary: 'x', body: 'y', tags: [], chunkIndices: [1] },
      ])

      const out = runPublish([
        'prepare-match',
        '--data-dir', dataDir,
        '--session-id', 'abc123',
        '--articles', artPath,
      ])
      const result = JSON.parse(out)
      expect(result.needsLlm).toBe(false)
    })
  })

  describe('execute — primary language only', () => {
    it('inserts a zh-only article, writing <slug>.zh.json and i18n-shaped index entry', () => {
      writeIndex({ articles: [], lastUpdated: '' })
      const artPath = writeArticles([
        {
          title: '第一篇文章',
          summary: '摘要',
          body: '# 你好',
          tags: ['test'],
          chunkIndices: [1, 2],
          project: 'logex',
          lang: 'zh',
        },
      ])
      const decPath = writeDecisions([{ newIndex: 0, action: 'insert' }])

      const out = runPublish([
        'execute',
        '--data-dir', dataDir,
        '--session-id', 'sess-001',
        '--articles', artPath,
        '--decisions', decPath,
      ])
      const result = JSON.parse(out)
      expect(result.results).toHaveLength(1)
      expect(result.results[0].action).toBe('inserted')
      expect(result.results[0].langs).toEqual(['zh'])

      const idx = JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf-8'))
      expect(idx.articles).toHaveLength(1)
      const entry = idx.articles[0]
      expect(entry.primaryLang).toBe('zh')
      expect(entry.i18n.zh.title).toBe('第一篇文章')
      expect(entry.i18n.zh.path).toMatch(/\.zh\.json$/)
      expect(entry.i18n.en).toBeUndefined()
      expect(entry.chunkIndices).toEqual([1, 2])
      expect(entry.sessionId).toBe('sess-001')

      // File exists and has lang field
      const bodyFile = JSON.parse(readFileSync(join(dataDir, entry.i18n.zh.path), 'utf-8'))
      expect(bodyFile.lang).toBe('zh')
      expect(bodyFile.body).toBe('# 你好')
    })
  })

  describe('execute — bilingual', () => {
    it('writes both <slug>.zh.json and <slug>.en.json when translations present', () => {
      writeIndex({ articles: [], lastUpdated: '' })
      const artPath = writeArticles([
        {
          title: '第一篇',
          summary: '摘要',
          body: '# 你好',
          tags: ['test'],
          chunkIndices: [1, 2],
          project: 'logex',
          lang: 'zh',
          translations: {
            en: { title: 'First Article', summary: 'sum', body: '# Hello' },
          },
        },
      ])
      const decPath = writeDecisions([{ newIndex: 0, action: 'insert' }])

      const out = runPublish([
        'execute',
        '--data-dir', dataDir,
        '--session-id', 'sess-001',
        '--articles', artPath,
        '--decisions', decPath,
      ])
      const result = JSON.parse(out)
      expect(result.results[0].langs.sort()).toEqual(['en', 'zh'])

      const idx = JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf-8'))
      const entry = idx.articles[0]
      expect(entry.primaryLang).toBe('zh')
      expect(entry.i18n.zh.title).toBe('第一篇')
      expect(entry.i18n.en.title).toBe('First Article')

      const zhFile = JSON.parse(readFileSync(join(dataDir, entry.i18n.zh.path), 'utf-8'))
      const enFile = JSON.parse(readFileSync(join(dataDir, entry.i18n.en.path), 'utf-8'))
      expect(zhFile.lang).toBe('zh')
      expect(zhFile.body).toBe('# 你好')
      expect(enFile.lang).toBe('en')
      expect(enFile.body).toBe('# Hello')
      // Shared fields
      expect(zhFile.slug).toBe(enFile.slug)
      expect(zhFile.chunkIndices).toEqual(enFile.chunkIndices)
    })

    it('defaults primaryLang to zh when lang not specified (backward compat)', () => {
      writeIndex({ articles: [], lastUpdated: '' })
      const artPath = writeArticles([
        {
          title: 'Legacy Article',
          summary: 'x',
          body: 'y',
          tags: [],
          chunkIndices: [1],
          // no lang field
        },
      ])
      const decPath = writeDecisions([{ newIndex: 0, action: 'insert' }])

      runPublish([
        'execute',
        '--data-dir', dataDir,
        '--session-id', 'sess-001',
        '--articles', artPath,
        '--decisions', decPath,
      ])

      const idx = JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf-8'))
      expect(idx.articles[0].primaryLang).toBe('zh')
      expect(idx.articles[0].i18n.zh).toBeDefined()
    })
  })

  describe('execute — update', () => {
    it('updates an existing legacy-shape article, preserving slug and heroImage', () => {
      const existingDir = join(dataDir, '2026', '04', '14')
      mkdirSync(existingDir, { recursive: true })
      writeFileSync(join(existingDir, '2026-04-14-old-slug.json'), JSON.stringify({
        slug: '2026-04-14-old-slug',
        title: 'Old Title',
        body: 'old body',
        heroImage: 'https://example.com/old.png',
        stats: { entries: 100 },
        duration: '2h',
      }))

      writeIndex({
        articles: [{
          slug: '2026-04-14-old-slug',
          title: 'Old Title',
          sessionId: 'sess-001',
          chunkIndices: [1, 2],
          path: '2026/04/14/2026-04-14-old-slug.json',
        }],
        lastUpdated: '',
      })

      const artPath = writeArticles([
        {
          title: 'Updated Title',
          summary: 'new sum',
          body: '# Updated',
          tags: ['v2'],
          chunkIndices: [1, 2, 3],
          project: 'logex',
          lang: 'zh',
        },
      ])
      const decPath = writeDecisions([
        { newIndex: 0, action: 'update', existingSlug: '2026-04-14-old-slug' },
      ])

      const out = runPublish([
        'execute',
        '--data-dir', dataDir,
        '--session-id', 'sess-001',
        '--articles', artPath,
        '--decisions', decPath,
      ])
      const result = JSON.parse(out)
      expect(result.results[0].action).toBe('updated')
      expect(result.results[0].slug).toBe('2026-04-14-old-slug')

      const idx = JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf-8'))
      const entry = idx.articles[0]
      expect(entry.primaryLang).toBe('zh')
      expect(entry.i18n.zh.title).toBe('Updated Title')
      expect(entry.heroImage).toBe('https://example.com/old.png')
      expect(entry.stats.entries).toBe(100)
      expect(entry.chunkIndices).toEqual([1, 2, 3])

      // The new-shape file should have been written
      const zhPath = entry.i18n.zh.path
      expect(zhPath).toMatch(/\.zh\.json$/)
      const zhFile = JSON.parse(readFileSync(join(dataDir, zhPath), 'utf-8'))
      expect(zhFile.heroImage).toBe('https://example.com/old.png')
      expect(zhFile.body).toBe('# Updated')
    })

    it('merges new translations into existing i18n map (update preserves absent langs)', () => {
      // Seed: existing article has both zh and en.
      const existingDir = join(dataDir, '2026', '04', '14')
      mkdirSync(existingDir, { recursive: true })
      writeFileSync(join(existingDir, '2026-04-14-foo.zh.json'), JSON.stringify({
        slug: '2026-04-14-foo', lang: 'zh', title: '旧中文', body: '旧', heroImage: '',
      }))
      writeFileSync(join(existingDir, '2026-04-14-foo.en.json'), JSON.stringify({
        slug: '2026-04-14-foo', lang: 'en', title: 'Old EN', body: 'old', heroImage: '',
      }))
      writeIndex({
        articles: [{
          slug: '2026-04-14-foo',
          date: '2026-04-14',
          sessionId: 'sess-001',
          chunkIndices: [1],
          primaryLang: 'zh',
          i18n: {
            zh: { title: '旧中文', summary: 'x', path: '2026/04/14/2026-04-14-foo.zh.json' },
            en: { title: 'Old EN', summary: 'x', path: '2026/04/14/2026-04-14-foo.en.json' },
          },
        }],
        lastUpdated: '',
      })

      // New article only supplies zh; en should be preserved from existing index.
      const artPath = writeArticles([
        {
          title: '新中文',
          summary: 'new',
          body: '新',
          tags: ['v2'],
          chunkIndices: [1, 2],
          project: 'logex',
          lang: 'zh',
        },
      ])
      const decPath = writeDecisions([
        { newIndex: 0, action: 'update', existingSlug: '2026-04-14-foo' },
      ])

      runPublish([
        'execute',
        '--data-dir', dataDir,
        '--session-id', 'sess-001',
        '--articles', artPath,
        '--decisions', decPath,
      ])

      const idx = JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf-8'))
      const entry = idx.articles[0]
      expect(entry.i18n.zh.title).toBe('新中文')
      // en untouched in index
      expect(entry.i18n.en.title).toBe('Old EN')
    })
  })

  describe('execute — slug idempotency (Bug 6: no double date prefix)', () => {
    it('update preserves existing slug verbatim, no double date prefix', () => {
      const existingDir = join(dataDir, '2026', '04', '17')
      mkdirSync(existingDir, { recursive: true })
      writeFileSync(join(existingDir, '2026-04-17-foo-bar.zh.json'), JSON.stringify({
        slug: '2026-04-17-foo-bar', lang: 'zh', title: 'Old', body: 'old', heroImage: '',
      }))
      writeIndex({
        articles: [{
          slug: '2026-04-17-foo-bar',
          date: '2026-04-17',
          sessionId: 'sess-001',
          chunkIndices: [1],
          primaryLang: 'zh',
          i18n: {
            zh: { title: 'Old', summary: 'x', path: '2026/04/17/2026-04-17-foo-bar.zh.json' },
          },
        }],
        lastUpdated: '',
      })

      const artPath = writeArticles([
        { title: 'Updated', summary: 'new', body: 'new body', tags: [], chunkIndices: [1, 2], lang: 'zh' },
      ])
      const decPath = writeDecisions([
        { newIndex: 0, action: 'update', existingSlug: '2026-04-17-foo-bar' },
      ])

      const out = runPublish([
        'execute', '--data-dir', dataDir, '--session-id', 'sess-001',
        '--articles', artPath, '--decisions', decPath,
      ])
      const result = JSON.parse(out)
      // Must stay 2026-04-17-foo-bar, NOT 2026-04-18-2026-04-17-foo-bar
      expect(result.results[0].slug).toBe('2026-04-17-foo-bar')
      expect(result.results[0].slug).not.toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}/)
    })

    it('insert with pre-dated slug does not double-prefix', () => {
      writeIndex({ articles: [], lastUpdated: '' })
      const artPath = writeArticles([
        {
          title: 'Test', summary: 'x', body: 'y', tags: [], chunkIndices: [1],
          slug: '2026-04-17-foo-bar', lang: 'zh',
        },
      ])
      const decPath = writeDecisions([{ newIndex: 0, action: 'insert' }])

      const out = runPublish([
        'execute', '--data-dir', dataDir, '--session-id', 'sess-001',
        '--articles', artPath, '--decisions', decPath,
      ])
      const result = JSON.parse(out)
      expect(result.results[0].slug).toBe('2026-04-17-foo-bar')
    })

    it('insert without slug generates date-prefixed slug', () => {
      writeIndex({ articles: [], lastUpdated: '' })
      const artPath = writeArticles([
        { title: 'No Slug', summary: 'x', body: 'y', tags: [], chunkIndices: [1], lang: 'zh' },
      ])
      const decPath = writeDecisions([{ newIndex: 0, action: 'insert' }])

      const out = runPublish([
        'execute', '--data-dir', dataDir, '--session-id', 'sess-001',
        '--articles', artPath, '--decisions', decPath,
      ])
      const result = JSON.parse(out)
      expect(result.results[0].slug).toMatch(/^\d{4}-\d{2}-\d{2}-/)
    })
  })

  describe('execute — misc', () => {
    it('falls back to insert when existingSlug not found', () => {
      writeIndex({ articles: [], lastUpdated: '' })
      const artPath = writeArticles([
        { title: 'Orphan', summary: 'x', body: 'y', tags: [], chunkIndices: [1], lang: 'zh' },
      ])
      const decPath = writeDecisions([
        { newIndex: 0, action: 'update', existingSlug: 'nonexistent-slug' },
      ])

      const out = runPublish([
        'execute',
        '--data-dir', dataDir,
        '--session-id', 'sess-001',
        '--articles', artPath,
        '--decisions', decPath,
      ])
      const result = JSON.parse(out)
      expect(result.results[0].action).toBe('inserted')
    })

    it('uses LLM-suggested slug when available', () => {
      writeIndex({ articles: [], lastUpdated: '' })
      const artPath = writeArticles([
        {
          title: 'Test',
          summary: 'x',
          body: 'y',
          tags: [],
          chunkIndices: [1],
          slug: 'my-great-article-slug',
          lang: 'zh',
        },
      ])
      const decPath = writeDecisions([{ newIndex: 0, action: 'insert' }])

      const out = runPublish([
        'execute',
        '--data-dir', dataDir,
        '--session-id', 'sess-001',
        '--articles', artPath,
        '--decisions', decPath,
      ])
      const result = JSON.parse(out)
      expect(result.results[0].slug).toContain('my-great-article-slug')
    })
  })
})
