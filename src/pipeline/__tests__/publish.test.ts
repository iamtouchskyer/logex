import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  publishRun,
  commitBatch,
  assertBlobSize,
  assertBilingual,
  BilingualRequiredError,
  BlobTooLargeError,
  SHAConflictError,
  MAX_BLOB_BYTES,
  fetchIndex,
  execute,
  prepareMatch,
  type FileSpec,
} from '../publish.js'

// Every publishRun path relies on the LOGEX_SKIP_HERO flag to keep the test
// self-contained (no external hero-generation network calls).
beforeEach(() => { process.env.LOGEX_SKIP_HERO = 'true' })
afterEach(() => { delete process.env.LOGEX_SKIP_HERO })

type MockFn = ReturnType<typeof vi.fn>

interface FakeOctokit {
  rest: {
    git: {
      getRef: MockFn
      getCommit: MockFn
      createBlob: MockFn
      createTree: MockFn
      createCommit: MockFn
      updateRef: MockFn
    }
    repos: {
      getContent: MockFn
    }
  }
}

function makeOctokit(overrides: Partial<{
  getRef: MockFn
  getCommit: MockFn
  createBlob: MockFn
  createTree: MockFn
  createCommit: MockFn
  updateRef: MockFn
  getContent: MockFn
}> = {}): FakeOctokit {
  return {
    rest: {
      git: {
        getRef: overrides.getRef ?? vi.fn().mockResolvedValue({ data: { object: { sha: 'parent-sha-1' } } }),
        getCommit: overrides.getCommit ?? vi.fn().mockResolvedValue({ data: { tree: { sha: 'base-tree-sha' } } }),
        createBlob: overrides.createBlob ?? vi.fn().mockImplementation(async ({ content }: { content: string }) => ({
          data: { sha: `blob-${content.length}` },
        })),
        createTree: overrides.createTree ?? vi.fn().mockResolvedValue({ data: { sha: 'new-tree-sha' } }),
        createCommit: overrides.createCommit ?? vi.fn().mockResolvedValue({ data: { sha: 'new-commit-sha' } }),
        updateRef: overrides.updateRef ?? vi.fn().mockResolvedValue({ data: {} }),
      },
      repos: {
        getContent: overrides.getContent ?? vi.fn().mockResolvedValue({
          data: {
            content: Buffer.from(JSON.stringify({ articles: [], lastUpdated: '' })).toString('base64'),
            encoding: 'base64',
          },
        }),
      },
    },
  }
}

function asOk(o: FakeOctokit) {
  return o as unknown as Parameters<typeof publishRun>[0]['octokit']
}

function bilingualArticle(over: {
  title?: string
  chunkIndices?: number[]
  slug?: string
  lang?: 'zh' | 'en'
  tags?: string[]
  heroImageBase64?: string
} = {}) {
  return {
    title: over.title ?? 'T',
    summary: 'S',
    body: 'B',
    lang: over.lang ?? ('zh' as const),
    translations: { en: { title: (over.title ?? 'T') + '-en', summary: 'S-en', body: 'B-en' } },
    tags: over.tags ?? [],
    chunkIndices: over.chunkIndices ?? [1],
    slug: over.slug,
    heroImageBase64: over.heroImageBase64,
  }
}

describe('assertBlobSize / BlobTooLargeError', () => {
  it('accepts normal-sized utf-8 content', () => {
    expect(() => assertBlobSize({ path: 'x.json', content: 'hello', encoding: 'utf-8' })).not.toThrow()
  })

  it('accepts normal-sized base64 content', () => {
    const small = Buffer.alloc(1024).toString('base64')
    expect(() => assertBlobSize({ path: 'images/x.png', content: small, encoding: 'base64' })).not.toThrow()
  })

  it('rejects base64 blob whose decoded size exceeds limit', () => {
    const big = Buffer.alloc(95 * 1024 * 1024).toString('base64')
    let err: Error | null = null
    try { assertBlobSize({ path: 'images/huge.png', content: big, encoding: 'base64' }) } catch (e) { err = e as Error }
    expect(err).toBeInstanceOf(BlobTooLargeError)
    expect(err?.message).toContain('images/huge.png')
    expect(MAX_BLOB_BYTES).toBe(90 * 1024 * 1024)
  })

  it('rejects utf-8 blob whose byte length exceeds limit', () => {
    const big = 'a'.repeat(MAX_BLOB_BYTES + 1)
    expect(() => assertBlobSize({ path: 'x.json', content: big, encoding: 'utf-8' })).toThrow(BlobTooLargeError)
  })
})

describe('assertBilingual / BilingualRequiredError', () => {
  it('passes when zh-primary has en translation', () => {
    expect(() => assertBilingual(bilingualArticle(), 0)).not.toThrow()
  })

  it('throws when zh-primary missing en translation', () => {
    let err: Error | null = null
    try {
      assertBilingual({ title: 'T', summary: 'S', body: 'B', lang: 'zh', tags: [], chunkIndices: [1] }, 3)
    } catch (e) { err = e as Error }
    expect(err).toBeInstanceOf(BilingualRequiredError)
    expect(err?.message).toContain('Article [3]')
    expect(err?.message).toContain('missing required "en"')
  })

  it('throws when en translation has empty body', () => {
    expect(() => assertBilingual({
      title: 'T', summary: 'S', body: 'B', lang: 'zh', tags: [], chunkIndices: [1],
      translations: { en: { title: 'T', summary: 'S', body: '   ' } },
    }, 0)).toThrow(BilingualRequiredError)
  })

  it('en-primary has no mandatory counterpart', () => {
    expect(() => assertBilingual({
      title: 'T', summary: 'S', body: 'B', lang: 'en', tags: [], chunkIndices: [1],
    }, 0)).not.toThrow()
  })
})

describe('commitBatch', () => {
  const files: FileSpec[] = [
    { path: 'a.json', content: '{"a":1}', encoding: 'utf-8' },
    { path: 'b.json', content: '{"b":2}', encoding: 'utf-8' },
  ]

  it('creates blobs, tree, commit, and updates ref on happy path', async () => {
    const ok = makeOctokit()
    const out = await commitBatch(asOk(ok), files, 'msg: happy')
    expect(out.commitSha).toBe('new-commit-sha')
    expect(out.attempts).toBe(1)
    expect(ok.rest.git.createBlob).toHaveBeenCalledTimes(2)
    expect(ok.rest.git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({ base_tree: 'base-tree-sha' }),
    )
    expect(ok.rest.git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'msg: happy', tree: 'new-tree-sha', parents: ['parent-sha-1'] }),
    )
    expect(ok.rest.git.updateRef).toHaveBeenCalledOnce()
  })

  it('retries on 409 updateRef conflict and then succeeds', async () => {
    const updateRef = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('409'), { status: 409 }))
      .mockResolvedValueOnce({ data: {} })
    const ok = makeOctokit({ updateRef })
    const out = await commitBatch(asOk(ok), files, 'msg: retry')
    expect(out.attempts).toBe(2)
    expect(updateRef).toHaveBeenCalledTimes(2)
    expect(ok.rest.git.getRef).toHaveBeenCalledTimes(2)
  })

  it('throws SHAConflictError after MAX_REF_RETRIES of 409', async () => {
    const updateRef = vi.fn().mockRejectedValue(Object.assign(new Error('409'), { status: 409 }))
    const ok = makeOctokit({ updateRef })
    let err: Error | null = null
    try { await commitBatch(asOk(ok), files, 'msg: fail') } catch (e) { err = e as Error }
    expect(err).toBeInstanceOf(SHAConflictError)
    expect(err?.message).toContain('upstream index.json changed')
    expect(updateRef).toHaveBeenCalledTimes(3)
  })

  it('surfaces non-409 errors immediately without retry', async () => {
    const updateRef = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))
    const ok = makeOctokit({ updateRef })
    await expect(commitBatch(asOk(ok), files, 'msg: x')).rejects.toThrow('boom')
    expect(updateRef).toHaveBeenCalledTimes(1)
  })

  it('rejects oversize blob before any Octokit call', async () => {
    const ok = makeOctokit()
    const big: FileSpec = {
      path: 'images/huge.png',
      content: Buffer.alloc(95 * 1024 * 1024).toString('base64'),
      encoding: 'base64',
    }
    await expect(commitBatch(asOk(ok), [big], 'msg')).rejects.toThrow(BlobTooLargeError)
    expect(ok.rest.git.getRef).not.toHaveBeenCalled()
    expect(ok.rest.git.createBlob).not.toHaveBeenCalled()
  })
})

describe('fetchIndex', () => {
  it('decodes base64 content to IndexFile', async () => {
    const payload = { articles: [{ slug: 'abc' }], lastUpdated: '2026-04-20' }
    const ok = makeOctokit({
      getContent: vi.fn().mockResolvedValue({
        data: { content: Buffer.from(JSON.stringify(payload)).toString('base64'), encoding: 'base64' },
      }),
    })
    const res = await fetchIndex(asOk(ok))
    expect(res.articles).toHaveLength(1)
    expect(res.lastUpdated).toBe('2026-04-20')
  })

  it('returns empty index on 404', async () => {
    const ok = makeOctokit({
      getContent: vi.fn().mockRejectedValue(Object.assign(new Error('404'), { status: 404 })),
    })
    const res = await fetchIndex(asOk(ok))
    expect(res.articles).toEqual([])
  })

  it('returns empty shape when content missing', async () => {
    const ok = makeOctokit({
      getContent: vi.fn().mockResolvedValue({ data: {} }),
    })
    const res = await fetchIndex(asOk(ok))
    expect(res.articles).toEqual([])
  })

  it('rethrows non-404 errors', async () => {
    const ok = makeOctokit({
      getContent: vi.fn().mockRejectedValue(Object.assign(new Error('500'), { status: 500 })),
    })
    await expect(fetchIndex(asOk(ok))).rejects.toThrow('500')
  })
})

describe('publishRun', () => {
  const sessionId = 'abcdef0123456789'

  it('writes articles + index in a single commit, correct message and entry count', async () => {
    const ok = makeOctokit()
    const newArticles = [bilingualArticle({ slug: 'hello-world', chunkIndices: [1, 2] })]
    const res = await publishRun({ octokit: asOk(ok), sessionId, index: { articles: [], lastUpdated: '' }, newArticles, decisions: [{ newIndex: 0, action: 'insert' }] })
    expect(res.results).toHaveLength(1)
    expect(res.results[0].action).toBe('inserted')
    // 2 lang files (zh + en) + 1 index = 3 files
    expect(res.filesCommitted).toBe(3)
    expect(ok.rest.git.createBlob).toHaveBeenCalledTimes(3)
    expect(ok.rest.git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ message: `articles: 1 from session ${sessionId}` }),
    )
    const treeCall = ok.rest.git.createTree.mock.calls[0][0]
    expect(treeCall.tree).toHaveLength(3)
  })

  it('uploads hero image when heroImageBase64 provided', async () => {
    const ok = makeOctokit()
    const heroImageBase64 = Buffer.from('PNGDATA').toString('base64')
    const res = await publishRun({
      octokit: asOk(ok),
      sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [bilingualArticle({ slug: 'my-article', heroImageBase64 })],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    // image + 2 lang files + index = 4
    expect(res.filesCommitted).toBe(4)
    const treePaths = ok.rest.git.createTree.mock.calls[0][0].tree.map((t: { path: string }) => t.path)
    expect(treePaths.some((p: string) => p.startsWith('images/') && p.endsWith('.png'))).toBe(true)
  })

  it('propagates SHAConflictError when updateRef fails 3x', async () => {
    const ok = makeOctokit({
      updateRef: vi.fn().mockRejectedValue(Object.assign(new Error('409'), { status: 409 })),
    })
    await expect(publishRun({
      octokit: asOk(ok),
      sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [bilingualArticle({ slug: 'a' })],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })).rejects.toThrow(SHAConflictError)
  })

  it('rejects 95MB image pre-network', async () => {
    const ok = makeOctokit()
    const huge = Buffer.alloc(95 * 1024 * 1024).toString('base64')
    await expect(publishRun({
      octokit: asOk(ok),
      sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [bilingualArticle({ slug: 'a', heroImageBase64: huge })],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })).rejects.toThrow(BlobTooLargeError)
    expect(ok.rest.git.createBlob).not.toHaveBeenCalled()
  })

  it('merges i18n on update, preserving existing translations not re-emitted', async () => {
    const ok = makeOctokit()
    const existing = {
      slug: '2026-04-10-old',
      date: '2026-04-10',
      sessionId,
      chunkIndices: [1],
      tags: ['x'],
      primaryLang: 'zh' as const,
      i18n: {
        zh: { title: 'oldzh', summary: 's', path: '2026/04/10/2026-04-10-old.zh.json' },
        en: { title: 'olden', summary: 's', path: '2026/04/10/2026-04-10-old.en.json' },
      },
      heroImage: '/images/2026-04-10-old.png',
      duration: '1h',
      stats: { entries: 5 },
    }
    const res = await publishRun({
      octokit: asOk(ok),
      sessionId,
      index: { articles: [existing], lastUpdated: '2026-04-10' },
      newArticles: [bilingualArticle({ chunkIndices: [1, 2] })],
      decisions: [{ newIndex: 0, action: 'update', existingSlug: '2026-04-10-old' }],
    })
    expect(res.results[0].action).toBe('updated')
    expect(res.results[0].langs).toEqual(expect.arrayContaining(['zh', 'en']))
  })

  it('treats update with unknown slug as insert and warns', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const ok = makeOctokit()
    const res = await publishRun({
      octokit: asOk(ok),
      sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [bilingualArticle({ slug: 'a' })],
      decisions: [{ newIndex: 0, action: 'update', existingSlug: 'does-not-exist' }],
    })
    expect(res.results[0].action).toBe('inserted')
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('not found'))
    stderr.mockRestore()
  })

  it('warns and skips out-of-range newIndex', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const ok = makeOctokit()
    const res = await publishRun({
      octokit: asOk(ok),
      sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [],
      decisions: [{ newIndex: 5, action: 'insert' }],
    })
    expect(res.results).toHaveLength(0)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('out of range'))
    stderr.mockRestore()
  })

  it('rejects whole batch when any article violates bilingual invariant', async () => {
    const ok = makeOctokit()
    await expect(publishRun({
      octokit: asOk(ok),
      sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [
        bilingualArticle({ slug: 'a' }),
        { title: 'bad', summary: 's', body: 'b', lang: 'zh', tags: [], chunkIndices: [9] },
      ],
      decisions: [
        { newIndex: 0, action: 'insert' },
        { newIndex: 1, action: 'insert' },
      ],
    })).rejects.toThrow(BilingualRequiredError)
    expect(ok.rest.git.createBlob).not.toHaveBeenCalled()
  })

  it('dedupes articles by slug after insert', async () => {
    const ok = makeOctokit()
    const dup = { slug: '2026-04-20-a', date: '2026-04-20', sessionId, tags: [], chunkIndices: [1], primaryLang: 'zh' as const, i18n: {} }
    const res = await publishRun({
      octokit: asOk(ok), sessionId,
      index: { articles: [dup, dup], lastUpdated: '' },
      newArticles: [bilingualArticle({ slug: 'other', chunkIndices: [9] })],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    expect(res.totalArticles).toBe(2)
  })

  it('generates a default slug with session prefix when no slug provided', async () => {
    const ok = makeOctokit()
    const res = await publishRun({
      octokit: asOk(ok), sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [bilingualArticle()],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    expect(res.results[0].slug).toMatch(/\d{4}-\d{2}-\d{2}-abcdef01-article-1/)
  })

  it('preserves already-dated slug idempotently', async () => {
    const ok = makeOctokit()
    const res = await publishRun({
      octokit: asOk(ok), sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [bilingualArticle({ slug: '2024-01-02-preset' })],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    expect(res.results[0].slug).toBe('2024-01-02-preset')
  })

  it('prepends date to custom slug without date prefix', async () => {
    const ok = makeOctokit()
    const res = await publishRun({
      octokit: asOk(ok), sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [bilingualArticle({ slug: 'some-long-custom-slug' })],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    expect(res.results[0].slug).toMatch(/^\d{4}-\d{2}-\d{2}-some-long-custom-slug$/)
  })
})

describe('prepareMatch', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'logex-pub-')) })
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

  it('returns needsLlm=false + insert decisions when no existing session articles', async () => {
    const ok = makeOctokit()
    const articlesPath = join(tmp, 'articles.json')
    writeFileSync(articlesPath, JSON.stringify([
      { title: 'a', summary: 's', body: 'b', tags: [], chunkIndices: [1] },
    ]))
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await prepareMatch(asOk(ok), 'session-new', articlesPath)
    const out = JSON.parse((spy.mock.calls[0][0] as string).trim())
    expect(out.needsLlm).toBe(false)
    expect(out.decisions).toHaveLength(1)
    expect(out.decisions[0]).toEqual({ newIndex: 0, action: 'insert' })
    spy.mockRestore()
  })

  it('returns needsLlm=true with a matching prompt when existing articles overlap', async () => {
    const existing = {
      slug: '2026-04-10-old', sessionId: 's1', chunkIndices: [1, 2], tags: [],
      title: 'old-title',
    }
    const ok = makeOctokit({
      getContent: vi.fn().mockResolvedValue({
        data: { content: Buffer.from(JSON.stringify({ articles: [existing], lastUpdated: '' })).toString('base64'), encoding: 'base64' },
      }),
    })
    const articlesPath = join(tmp, 'articles.json')
    writeFileSync(articlesPath, JSON.stringify([
      { title: 'new-title', summary: 's', body: 'b', tags: [], chunkIndices: [1, 3] },
    ]))
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await prepareMatch(asOk(ok), 's1', articlesPath)
    const out = JSON.parse((spy.mock.calls[0][0] as string).trim())
    expect(out.needsLlm).toBe(true)
    expect(out.matchingPrompt).toContain('old-title')
    expect(out.matchingPrompt).toContain('new-title')
    spy.mockRestore()
  })

  it('derives prompt title from i18n when top-level title missing', async () => {
    const existing = {
      slug: '2026-04-10-old',
      sessionId: 's1',
      chunkIndices: [1],
      primaryLang: 'zh' as const,
      i18n: { zh: { title: 'i18n-title', summary: 's', path: 'p' } },
      tags: [],
    }
    const ok = makeOctokit({
      getContent: vi.fn().mockResolvedValue({
        data: { content: Buffer.from(JSON.stringify({ articles: [existing], lastUpdated: '' })).toString('base64'), encoding: 'base64' },
      }),
    })
    const articlesPath = join(tmp, 'articles.json')
    writeFileSync(articlesPath, JSON.stringify([
      { title: 'new', summary: 's', body: 'b', tags: [], chunkIndices: [1] },
    ]))
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await prepareMatch(asOk(ok), 's1', articlesPath)
    const out = JSON.parse((spy.mock.calls[0][0] as string).trim())
    expect(out.matchingPrompt).toContain('i18n-title')
    spy.mockRestore()
  })
})

describe('execute (integration with publishRun)', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'logex-exec-')) })
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

  it('reads local articles + decisions, invokes publishRun, prints result JSON', async () => {
    const ok = makeOctokit()
    const articlesPath = join(tmp, 'articles.json')
    const decisionsPath = join(tmp, 'decisions.json')
    writeFileSync(articlesPath, JSON.stringify([bilingualArticle({ slug: 'a' })]))
    writeFileSync(decisionsPath, JSON.stringify({ decisions: [{ newIndex: 0, action: 'insert' }] }))
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await execute(asOk(ok), 'sess-exec', articlesPath, decisionsPath)
    const out = JSON.parse((spy.mock.calls[0][0] as string).trim())
    expect(out.commitSha).toBe('new-commit-sha')
    expect(out.results[0].action).toBe('inserted')
    spy.mockRestore()
  })

  it('accepts raw array decisions (no .decisions wrapper)', async () => {
    const ok = makeOctokit()
    const articlesPath = join(tmp, 'articles.json')
    const decisionsPath = join(tmp, 'decisions.json')
    writeFileSync(articlesPath, JSON.stringify([bilingualArticle({ slug: 'a' })]))
    writeFileSync(decisionsPath, JSON.stringify([{ newIndex: 0, action: 'insert' }]))
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await execute(asOk(ok), 'sess-exec', articlesPath, decisionsPath)
    const out = JSON.parse((spy.mock.calls[0][0] as string).trim())
    expect(out.results[0].action).toBe('inserted')
    spy.mockRestore()
  })
})
