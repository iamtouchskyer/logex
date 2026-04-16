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
    dataDir = join(tmpdir(), `logex-publish-test-${Date.now()}`)
    mkdirSync(dataDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(dataDir)) {
      rmSync(dataDir, { recursive: true })
    }
  })

  function writeIndex(index: { articles: any[]; lastUpdated: string }) {
    writeFileSync(join(dataDir, 'index.json'), JSON.stringify(index))
  }

  function writeArticles(articles: any[]): string {
    const p = join(dataDir, 'new-articles.json')
    writeFileSync(p, JSON.stringify(articles))
    return p
  }

  function writeDecisions(decisions: any[]): string {
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

    it('returns needsLlm=true when existing articles have same sessionId', () => {
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

    it('ignores existing articles without chunkIndices', () => {
      writeIndex({
        articles: [{
          slug: '2026-04-14-old',
          title: 'Old',
          sessionId: 'abc123',
          // no chunkIndices
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

  describe('execute', () => {
    it('inserts new articles correctly', () => {
      writeIndex({ articles: [], lastUpdated: '' })
      const artPath = writeArticles([
        { title: 'First Article', summary: 'sum', body: '# Hello', tags: ['test'], chunkIndices: [1, 2], project: 'logex' },
      ])
      const decPath = writeDecisions([
        { newIndex: 0, action: 'insert' },
      ])

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

      // Check index was updated
      const idx = JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf-8'))
      expect(idx.articles).toHaveLength(1)
      expect(idx.articles[0].chunkIndices).toEqual([1, 2])
      expect(idx.articles[0].sessionId).toBe('sess-001')
    })

    it('updates existing articles preserving slug', () => {
      // Create existing article file
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
        { title: 'Updated Title', summary: 'new sum', body: '# Updated', tags: ['v2'], chunkIndices: [1, 2, 3], project: 'logex' },
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
      expect(result.results[0].slug).toBe('2026-04-14-old-slug') // slug preserved

      // Check file content was updated but heroImage preserved
      const updated = JSON.parse(readFileSync(join(existingDir, '2026-04-14-old-slug.json'), 'utf-8'))
      expect(updated.title).toBe('Updated Title')
      expect(updated.body).toBe('# Updated')
      expect(updated.heroImage).toBe('https://example.com/old.png')
      expect(updated.stats).toEqual({ entries: 100 })
      expect(updated.chunkIndices).toEqual([1, 2, 3])
    })

    it('falls back to insert when existingSlug not found', () => {
      writeIndex({ articles: [], lastUpdated: '' })
      const artPath = writeArticles([
        { title: 'Orphan', summary: 'x', body: 'y', tags: [], chunkIndices: [1] },
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
        { title: 'Test', summary: 'x', body: 'y', tags: [], chunkIndices: [1], slug: 'my-great-article-slug' },
      ])
      const decPath = writeDecisions([
        { newIndex: 0, action: 'insert' },
      ])

      const out = runPublish([
        'execute',
        '--data-dir', dataDir,
        '--session-id', 'sess-001',
        '--articles', artPath,
        '--decisions', decPath,
      ])
      const result = JSON.parse(out)
      // slug should have date prefix + LLM slug
      expect(result.results[0].slug).toContain('my-great-article-slug')
    })
  })
})
