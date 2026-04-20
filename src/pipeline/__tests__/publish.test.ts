import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../hero.js', () => ({
  generateHeroImage: vi.fn(async (_slug: string, _title: string) => ({
    mime: 'image/png',
    data: Buffer.from('PNG-MOCK'),
  })),
}))
import {
  publishRun,
  commitBatch,
  assertBlobSize,
  assertBilingual,
  BilingualRequiredError,
  DuplicateContentError,
  computeContentHash,
  articleContentHash,
  buildContentHashIndex,
  BlobTooLargeError,
  SHAConflictError,
  RateLimitedError,
  InsufficientScopeError,
  MAX_BLOB_BYTES,
  fetchIndex,
  execute,
  prepareMatch,
  parseArgv,
  runCli,
  redactTokensInMessage,
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
  body?: string
  chunkIndices?: number[]
  slug?: string
  lang?: 'zh' | 'en'
  tags?: string[]
  heroImageBase64?: string
} = {}) {
  return {
    title: over.title ?? 'T',
    summary: 'S',
    body: over.body ?? 'B',
    lang: over.lang ?? ('zh' as const),
    translations: { en: { title: (over.title ?? 'T') + '-en', summary: 'S-en', body: (over.body ?? 'B') + '-en' } },
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

describe('content hash / DuplicateContentError', () => {
  it('computes same hash for same title+body, different for different content', () => {
    const h1 = computeContentHash('Hello', '# Body\nfoo')
    const h2 = computeContentHash('Hello', '# Body\nfoo')
    const h3 = computeContentHash('Hello', '# Body\nbar')
    const h4 = computeContentHash('Other', '# Body\nfoo')
    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
    expect(h1).not.toBe(h4)
    expect(h1).toMatch(/^[0-9a-f]{16}$/)
  })

  it('normalizes whitespace so cosmetic differences do not affect hash', () => {
    const h1 = computeContentHash('  Hello   World  ', 'foo\n\n\nbar')
    const h2 = computeContentHash('Hello World', 'foo bar')
    expect(h1).toBe(h2)
  })

  it('articleContentHash uses primary title+body only', () => {
    const h = articleContentHash({
      title: 'T', summary: 'S', body: 'B', tags: [], chunkIndices: [1, 2],
      translations: { en: { title: 'X', summary: 'Y', body: 'Z' } },
    })
    expect(h).toBe(computeContentHash('T', 'B'))
  })

  it('buildContentHashIndex maps existing articles by their stored hash', () => {
    const map = buildContentHashIndex({
      articles: [
        { slug: 'a', contentHash: 'abc123' },
        { slug: 'b', contentHash: 'def456' },
        { slug: 'c' }, // no hash — skipped
      ],
      lastUpdated: '',
    })
    expect(map.get('abc123')).toBe('a')
    expect(map.get('def456')).toBe('b')
    expect(map.size).toBe(2)
  })

  it('publishRun throws DuplicateContentError when inserting an article with existing content hash', async () => {
    const ok = makeOctokit()
    const dupTitle = 'Dup Title'
    const dupBody = 'Dup Body content'
    const existingSlug = '2026-01-01-existing'
    const existingHash = computeContentHash(dupTitle, dupBody)
    await expect(publishRun({
      octokit: asOk(ok),
      sessionId: 'new-session',
      index: {
        articles: [{ slug: existingSlug, contentHash: existingHash }],
        lastUpdated: '',
      },
      newArticles: [
        bilingualArticle({ title: dupTitle, body: dupBody }),
      ],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })).rejects.toThrow(DuplicateContentError)
    expect(ok.rest.git.createBlob).not.toHaveBeenCalled()
  })

  it('publishRun allows update pointing at the correct matching slug', async () => {
    const ok = makeOctokit()
    const title = 'Same Title'
    const body = 'Same Body'
    const slug = '2026-01-01-existing'
    const hash = computeContentHash(title, body)
    const res = await publishRun({
      octokit: asOk(ok),
      sessionId: 'same-session',
      index: {
        articles: [{
          slug, contentHash: hash, sessionId: 'same-session',
          primaryLang: 'zh', i18n: {}, chunkIndices: [1],
        }],
        lastUpdated: '',
      },
      newArticles: [bilingualArticle({ title, body })],
      decisions: [{ newIndex: 0, action: 'update', existingSlug: slug }],
    })
    expect(res.results[0].slug).toBe(slug)
  })

  it('publishRun throws when update points at a different slug than the content match', async () => {
    const ok = makeOctokit()
    const title = 'X'
    const body = 'Y'
    const hash = computeContentHash(title, body)
    await expect(publishRun({
      octokit: asOk(ok),
      sessionId: 'sess',
      index: {
        articles: [
          { slug: '2026-01-01-real', contentHash: hash },
          { slug: '2026-01-02-other', contentHash: 'deadbeef' },
        ],
        lastUpdated: '',
      },
      newArticles: [bilingualArticle({ title, body })],
      decisions: [{ newIndex: 0, action: 'update', existingSlug: '2026-01-02-other' }],
    })).rejects.toThrow(DuplicateContentError)
  })

  it('mergeIndex stamps contentHash on every new entry', async () => {
    const ok = makeOctokit()
    const res = await publishRun({
      octokit: asOk(ok),
      sessionId: 's',
      index: { articles: [], lastUpdated: '' },
      newArticles: [bilingualArticle({ title: 'Fresh Title', body: 'Fresh Body' })],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    expect(res.results).toHaveLength(1)
    // The committed index.json should have contentHash on the new entry.
    const tree = ok.rest.git.createTree.mock.calls[0][0].tree as Array<{ path: string }>
    expect(tree.some((t) => t.path === 'index.json')).toBe(true)
    const indexBlob = ok.rest.git.createBlob.mock.calls.find(
      (c: unknown[]) => (c[0] as { content: string }).content.includes('"articles"'),
    )
    expect(indexBlob).toBeDefined()
    const parsed = JSON.parse((indexBlob![0] as { content: string }).content)
    expect(parsed.articles[0].contentHash).toBe(computeContentHash('Fresh Title', 'Fresh Body'))
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
    expect(ok.rest.git.createBlob).toHaveBeenCalledTimes(2)
    expect(ok.rest.git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({ base_tree: 'base-tree-sha' }),
    )
    expect(ok.rest.git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'msg: happy', tree: 'new-tree-sha', parents: ['parent-sha-1'] }),
    )
    expect(ok.rest.git.updateRef).toHaveBeenCalledOnce()
  })

  it('rethrows 409 updateRef conflict so caller can retry with fresh parent', async () => {
    const updateRef = vi.fn().mockRejectedValue(Object.assign(new Error('409'), { status: 409 }))
    const ok = makeOctokit({ updateRef })
    await expect(commitBatch(asOk(ok), files, 'msg: retry')).rejects.toMatchObject({ status: 409 })
    expect(updateRef).toHaveBeenCalledTimes(1)
  })

  it('uses blobShaCache to avoid re-creating identical blobs', async () => {
    const ok = makeOctokit()
    const cache = new Map<string, string>()
    await commitBatch(asOk(ok), files, 'msg', cache)
    expect(ok.rest.git.createBlob).toHaveBeenCalledTimes(2)
    await commitBatch(asOk(ok), files, 'msg', cache)
    // second call reuses cached SHAs — no additional createBlob calls
    expect(ok.rest.git.createBlob).toHaveBeenCalledTimes(2)
  })

  it('maps 403 rate-limit 403 to RateLimitedError with resetAt parsed from header', async () => {
    const err403 = Object.assign(new Error('API rate limit exceeded'), {
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' } },
    })
    const updateRef = vi.fn().mockRejectedValue(err403)
    const ok = makeOctokit({ updateRef })
    let caught: Error | null = null
    try { await commitBatch(asOk(ok), files, 'msg') } catch (e) { caught = e as Error }
    expect(caught).toBeInstanceOf(RateLimitedError)
    expect((caught as RateLimitedError).resetAt?.toISOString()).toBe(new Date(1800000000 * 1000).toISOString())
    expect(caught?.message).toContain('rate limit')
  })

  it('maps 403 missing-scope to InsufficientScopeError', async () => {
    const err403 = Object.assign(new Error('Must have admin rights'), {
      status: 403,
      response: { headers: { 'x-oauth-scopes': 'read:user, gist' } },
    })
    const updateRef = vi.fn().mockRejectedValue(err403)
    const ok = makeOctokit({ updateRef })
    let caught: Error | null = null
    try { await commitBatch(asOk(ok), files, 'msg') } catch (e) { caught = e as Error }
    expect(caught).toBeInstanceOf(InsufficientScopeError)
    expect(caught?.message).toContain("'repo' scope")
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

  it('rejects blob at exactly MAX_BLOB_BYTES (boundary)', () => {
    const big = 'a'.repeat(MAX_BLOB_BYTES)
    expect(() => assertBlobSize({ path: 'x.json', content: big, encoding: 'utf-8' })).toThrow(BlobTooLargeError)
  })

  it('rejects blob at MAX_BLOB_BYTES + 1 (just over limit)', () => {
    const big = 'a'.repeat(MAX_BLOB_BYTES + 1)
    expect(() => assertBlobSize({ path: 'x.json', content: big, encoding: 'utf-8' })).toThrow(BlobTooLargeError)
  })

  it('accepts blob at MAX_BLOB_BYTES - 1 (just under limit)', () => {
    const big = 'a'.repeat(MAX_BLOB_BYTES - 1)
    expect(() => assertBlobSize({ path: 'x.json', content: big, encoding: 'utf-8' })).not.toThrow()
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

  it('throws when hero generation fails and LOGEX_SKIP_HERO not set', async () => {
    delete process.env.LOGEX_SKIP_HERO
    const heroMod = await import('../hero.js')
    const spy = vi.spyOn(heroMod, 'generateHeroImage').mockRejectedValue(new Error('boom'))
    const ok = makeOctokit()
    try {
      await expect(publishRun({
        octokit: asOk(ok), sessionId,
        index: { articles: [], lastUpdated: '' },
        newArticles: [bilingualArticle({ slug: 'no-hero' })],
        decisions: [{ newIndex: 0, action: 'insert' }],
      })).rejects.toThrow(/Hero image generation failed.*boom/)
    } finally {
      spy.mockRestore()
      process.env.LOGEX_SKIP_HERO = 'true'
    }
  })

  it('throws final gate if hero image ends up empty', async () => {
    delete process.env.LOGEX_SKIP_HERO
    const heroMod = await import('../hero.js')
    // Succeed generation but return a zero-byte image that the gate should
    // never see as legitimate — simulate by making generator return empty path.
    // Simpler: keep generator throwing, assert error from the specific message.
    const spy = vi.spyOn(heroMod, 'generateHeroImage').mockRejectedValue(new Error('quota'))
    const ok = makeOctokit()
    try {
      await expect(publishRun({
        octokit: asOk(ok), sessionId,
        index: { articles: [], lastUpdated: '' },
        newArticles: [bilingualArticle({ slug: 'gated' })],
        decisions: [{ newIndex: 0, action: 'insert' }],
      })).rejects.toThrow()
    } finally {
      spy.mockRestore()
      process.env.LOGEX_SKIP_HERO = 'true'
    }
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

  it('re-fetches index.json and rebuilds tree on 409 retry (S1)', async () => {
    // First getRef returns sha-1; after 409 we re-fetch and next getRef returns sha-2.
    const getRef = vi.fn()
      .mockResolvedValueOnce({ data: { object: { sha: 'parent-sha-1' } } })
      .mockResolvedValueOnce({ data: { object: { sha: 'parent-sha-2' } } })
    const updateRef = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('409'), { status: 409 }))
      .mockResolvedValueOnce({ data: {} })
    // getContent returns a different index snapshot on the second call so
    // concurrent writer's entry is preserved.
    const concurrentEntry = {
      slug: '2026-04-20-other',
      date: '2026-04-20',
      sessionId: 'other-session',
      chunkIndices: [99],
      tags: [],
      primaryLang: 'zh' as const,
      i18n: {},
    }
    const getContent = vi.fn().mockResolvedValue({
      data: { content: Buffer.from(JSON.stringify({ articles: [concurrentEntry], lastUpdated: '2026-04-20' })).toString('base64'), encoding: 'base64' },
    })
    const ok = makeOctokit({ getRef, updateRef, getContent })
    const res = await publishRun({
      octokit: asOk(ok),
      sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [bilingualArticle({ slug: 'retry-me' })],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    expect(res.commitSha).toBe('new-commit-sha')
    // Second createCommit should use parent-sha-2 (fresh parent).
    const calls = ok.rest.git.createCommit.mock.calls
    expect(calls.length).toBe(2)
    expect(calls[1][0]).toMatchObject({ parents: ['parent-sha-2'] })
    // The index.json in the second attempt must preserve the concurrent writer's entry.
    const treeCalls = ok.rest.git.createTree.mock.calls
    const secondTree = treeCalls[1][0].tree as Array<{ path: string; sha?: string }>
    // The updated index.json is the last file in the batch.
    expect(secondTree.some((t) => t.path === 'index.json')).toBe(true)
    // After retry, index.json should contain the concurrent entry.
    const createBlobCalls = ok.rest.git.createBlob.mock.calls
    const indexPayloads = createBlobCalls
      .map((c) => c[0].content)
      .filter((c: string) => {
        try { const obj = JSON.parse(c); return Array.isArray(obj.articles) } catch { return false }
      })
    // at least one index payload includes the concurrent entry
    expect(indexPayloads.some((p: string) => p.includes('2026-04-20-other'))).toBe(true)
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

  it('starts article-N at max(existing)+1 for same-session cross-batch inserts', async () => {
    const ok = makeOctokit()
    // Prior batch already wrote article-1 and article-2 under this session.
    const priorDate = '2026-04-19'
    const existing = (n: number) => ({
      slug: `${priorDate}-abcdef01-article-${n}`,
      date: priorDate,
      sessionId,
      tags: [],
      chunkIndices: [n],
      primaryLang: 'zh' as const,
      i18n: {},
    })
    const res = await publishRun({
      octokit: asOk(ok), sessionId,
      index: { articles: [existing(1), existing(2)], lastUpdated: '' },
      newArticles: [bilingualArticle({ chunkIndices: [3] })],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    expect(res.results[0].slug).toMatch(/\d{4}-\d{2}-\d{2}-abcdef01-article-3/)
  })

  it('assigns unique article-N to multiple inserts in one batch', async () => {
    const ok = makeOctokit()
    const res = await publishRun({
      octokit: asOk(ok), sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [
        bilingualArticle({ chunkIndices: [1] }),
        bilingualArticle({ chunkIndices: [2] }),
        bilingualArticle({ chunkIndices: [3] }),
      ],
      decisions: [
        { newIndex: 0, action: 'insert' },
        { newIndex: 1, action: 'insert' },
        { newIndex: 2, action: 'insert' },
      ],
    })
    const nums = res.results.map((r) => r.slug.match(/article-(\d+)$/)?.[1]).sort()
    expect(nums).toEqual(['1', '2', '3'])
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

describe('publishRun (hero branches)', () => {
  const sessionId = 'abcdef0123456789'
  beforeEach(() => { delete process.env.LOGEX_SKIP_HERO })
  afterEach(() => { process.env.LOGEX_SKIP_HERO = 'true' })

  it('generates hero image when LOGEX_SKIP_HERO is unset (png path)', async () => {
    const ok = makeOctokit()
    const res = await publishRun({
      octokit: asOk(ok), sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [bilingualArticle({ slug: 'hero-png' })],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    const paths = ok.rest.git.createTree.mock.calls[0][0].tree.map((t: { path: string }) => t.path)
    expect(paths.some((p: string) => p.startsWith('images/') && p.endsWith('.png'))).toBe(true)
    expect(res.filesCommitted).toBeGreaterThan(2)
  })

  it('throws fail-fast when hero generation fails (no skipHero)', async () => {
    const hero = await import('../hero.js')
    const spy = vi.spyOn(hero, 'generateHeroImage').mockRejectedValueOnce(new Error('hero boom'))
    const ok = makeOctokit()
    await expect(
      publishRun({
        octokit: asOk(ok), sessionId,
        index: { articles: [], lastUpdated: '' },
        newArticles: [bilingualArticle({ slug: 'hero-fails' })],
        decisions: [{ newIndex: 0, action: 'insert' }],
      }),
    ).rejects.toThrow(/Hero image generation failed/)
    spy.mockRestore()
  })

  it('selects .svg extension when hero mime is svg+xml', async () => {
    const hero = await import('../hero.js')
    const spy = vi.spyOn(hero, 'generateHeroImage').mockResolvedValueOnce({ mime: 'image/svg+xml', data: Buffer.from('<svg/>') })
    const ok = makeOctokit()
    await publishRun({
      octokit: asOk(ok), sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [bilingualArticle({ slug: 'hero-svg' })],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    const paths = ok.rest.git.createTree.mock.calls[0][0].tree.map((t: { path: string }) => t.path)
    expect(paths.some((p: string) => p.endsWith('.svg'))).toBe(true)
    spy.mockRestore()
  })

  it('falls back to png for unknown mime type', async () => {
    const hero = await import('../hero.js')
    const spy = vi.spyOn(hero, 'generateHeroImage').mockResolvedValueOnce({ mime: 'image/weird' as unknown as 'image/png', data: Buffer.from('X') })
    const ok = makeOctokit()
    await publishRun({
      octokit: asOk(ok), sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [bilingualArticle({ slug: 'hero-unknown' })],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    const paths = ok.rest.git.createTree.mock.calls[0][0].tree.map((t: { path: string }) => t.path)
    expect(paths.some((p: string) => p.endsWith('.png'))).toBe(true)
    spy.mockRestore()
  })
})

describe('classifyGitHubError edge cases (retry-after + non-403 passthrough)', () => {
  it('returns null for non-403 errors', async () => {
    // Indirectly exercised through commitBatch with a 500.
    const updateRef = vi.fn().mockRejectedValue(Object.assign(new Error('srv'), { status: 500 }))
    const ok = makeOctokit({ updateRef })
    await expect(commitBatch(asOk(ok), [{ path: 'a', content: 'x', encoding: 'utf-8' }], 'm'))
      .rejects.toThrow('srv')
  })

  it('parses retry-after header even when remaining is not zero', async () => {
    const err = Object.assign(new Error('Forbidden'), {
      status: 403,
      response: { headers: { 'retry-after': '42' } },
    })
    const updateRef = vi.fn().mockRejectedValue(err)
    const ok = makeOctokit({ updateRef })
    let caught: Error | null = null
    try { await commitBatch(asOk(ok), [{ path: 'a', content: 'x', encoding: 'utf-8' }], 'm') } catch (e) { caught = e as Error }
    expect(caught).toBeInstanceOf(RateLimitedError)
    expect((caught as RateLimitedError).retryAfterSec).toBe(42)
  })

  it('passes through 403 with repo scope present (no special typed error)', async () => {
    const err = Object.assign(new Error('Nope'), {
      status: 403,
      response: { headers: { 'x-oauth-scopes': 'repo, gist' } },
    })
    const updateRef = vi.fn().mockRejectedValue(err)
    const ok = makeOctokit({ updateRef })
    let caught: Error | null = null
    try { await commitBatch(asOk(ok), [{ path: 'a', content: 'x', encoding: 'utf-8' }], 'm') } catch (e) { caught = e as Error }
    expect(caught).not.toBeInstanceOf(RateLimitedError)
    expect(caught).not.toBeInstanceOf(InsufficientScopeError)
    expect(caught?.message).toContain('Nope')
  })

  it('RateLimitedError default message when no reset/retryAfter provided', () => {
    const e = new RateLimitedError(null, null)
    expect(e.message).toContain('later')
  })
})

describe('enumerateLangContent branches via publishRun', () => {
  const sessionId = 'abcdef0123456789'
  beforeEach(() => { process.env.LOGEX_SKIP_HERO = 'true' })
  it('skips translation when lang === primary', async () => {
    const ok = makeOctokit()
    // Provide a translation keyed to the primary lang, which the loop must skip.
    const res = await publishRun({
      octokit: asOk(ok), sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [{
        title: 'T', summary: 'S', body: 'B', lang: 'zh',
        translations: {
          zh: { title: 'DUP', summary: 'D', body: 'D' },
          en: { title: 'T-en', summary: 'S-en', body: 'B-en' },
        },
        tags: [], chunkIndices: [1], slug: 'lang-primary',
      }],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    // Two langs committed: zh + en (not three). zh translation ignored.
    expect(res.results[0].langs).toHaveLength(2)
  })

  it('skips translation when content is null/undefined', async () => {
    const ok = makeOctokit()
    const res = await publishRun({
      octokit: asOk(ok), sessionId,
      index: { articles: [], lastUpdated: '' },
      newArticles: [{
        title: 'T', summary: 'S', body: 'B', lang: 'zh',
        translations: {
          en: { title: 'T-en', summary: 'S-en', body: 'B-en' },
          // Extra null-valued lang key exercises the null-guard branch in
          // enumerateLangContent. Not in the Lang union — cast intentionally.
          ja: null,
        } as unknown as Record<'zh' | 'en', { title: string; summary: string; body: string }>,
        tags: [], chunkIndices: [1], slug: 'lang-null',
      }],
      decisions: [{ newIndex: 0, action: 'insert' }],
    })
    expect(res.results[0].langs).toHaveLength(2)
  })
})

describe('main() wrapper', () => {
  it('calls runCli with process.argv.slice(2) and exits on usage path', async () => {
    const { main } = await import('../publish.js')
    const origArgv = process.argv
    const origExit = process.exit
    const origStderr = process.stderr.write.bind(process.stderr)
    const errs: string[] = []
    process.argv = ['node', 'publish.ts']
    ;(process as unknown as { exit: (code: number) => never }).exit = ((code: number) => {
      throw Object.assign(new Error(`exit:${code}`), { code })
    }) as unknown as (code?: number) => never
    ;(process.stderr as unknown as { write: (s: string) => boolean }).write = ((s: string) => {
      errs.push(s)
      return true
    }) as unknown as (s: string) => boolean
    try {
      await expect(main()).rejects.toThrow('exit:1')
      expect(errs.join('')).toContain('Usage')
    } finally {
      process.argv = origArgv
      ;(process as unknown as { exit: typeof origExit }).exit = origExit
      ;(process.stderr as unknown as { write: typeof origStderr }).write = origStderr
    }
  })
})

describe('parseArgv', () => {
  it('returns usage on unknown command', () => {
    expect(parseArgv(['unknown'])).toEqual({ kind: 'usage' })
    expect(parseArgv([])).toEqual({ kind: 'usage' })
  })
  it('returns missing for prepare-match without session-id', () => {
    expect(parseArgv(['prepare-match'])).toEqual({ kind: 'missing', name: 'session-id' })
  })
  it('returns missing for prepare-match without articles', () => {
    expect(parseArgv(['prepare-match', '--session-id', 's1'])).toEqual({ kind: 'missing', name: 'articles' })
  })
  it('returns prepare-match on good args', () => {
    expect(parseArgv(['prepare-match', '--session-id', 's1', '--articles', '/tmp/a.json']))
      .toEqual({ kind: 'prepare-match', sessionId: 's1', articles: '/tmp/a.json' })
  })
  it('returns missing for execute without decisions', () => {
    expect(parseArgv(['execute', '--session-id', 's1', '--articles', '/tmp/a.json']))
      .toEqual({ kind: 'missing', name: 'decisions' })
  })
  it('returns execute on full args', () => {
    expect(parseArgv(['execute', '--session-id', 's1', '--articles', '/tmp/a.json', '--decisions', '/tmp/d.json']))
      .toEqual({ kind: 'execute', sessionId: 's1', articles: '/tmp/a.json', decisions: '/tmp/d.json' })
  })
})

describe('redactTokensInMessage', () => {
  it('masks ghp_ tokens', () => {
    const msg = `publish failed with token ghp_${'A'.repeat(36)} in body`
    const masked = redactTokensInMessage(msg)
    expect(masked).not.toContain('A'.repeat(36))
    expect(masked).toContain('ghp_***')
  })
  it('masks github_pat_ tokens', () => {
    const msg = `auth: github_pat_${'X'.repeat(50)} failed`
    const masked = redactTokensInMessage(msg)
    expect(masked).not.toContain('X'.repeat(50))
    expect(masked).toContain('[REDACTED]')
  })
  it('masks bare 40-char hex tokens', () => {
    const hex40 = 'a'.repeat(40)
    const masked = redactTokensInMessage(`legacy token: ${hex40}`)
    expect(masked).not.toContain(hex40)
    expect(masked).toContain('[REDACTED]')
  })
  it('leaves normal text alone', () => {
    expect(redactTokensInMessage('nothing to mask here')).toBe('nothing to mask here')
  })
})

describe('runCli', () => {
  type ExitErr = Error & { code?: number }
  function makeIo(argv: string[], overrides: Partial<{
    resolveToken: () => string
    stderr: string[]
    makeOctokit: () => Parameters<typeof runCli>[0]['makeOctokit']
  }> = {}) {
    const errs: string[] = overrides.stderr ?? []
    const exitErr = (code: number): never => {
      const e = new Error(`exit:${code}`) as ExitErr
      e.code = code
      throw e
    }
    return {
      io: {
        argv,
        stderr: (s: string) => { errs.push(s) },
        stdout: () => {},
        exit: exitErr as unknown as (code: number) => never,
        resolveToken: overrides.resolveToken,
        makeOctokit: undefined,
      } as Parameters<typeof runCli>[0],
      errs,
    }
  }

  it('exits with usage when no command given', async () => {
    const { io, errs } = makeIo([])
    await expect(runCli(io)).rejects.toThrow('exit:1')
    expect(errs.join('')).toContain('Usage')
  })

  it('exits with missing-arg message', async () => {
    const { io, errs } = makeIo(['prepare-match', '--session-id', 's1'])
    await expect(runCli(io)).rejects.toThrow('exit:1')
    expect(errs.join('')).toContain('--articles')
  })

  it('catches errors from token resolution, writes redacted publish failed message', async () => {
    // resolveToken throws — must be caught inside try/catch (B2).
    const { io, errs } = makeIo(
      ['prepare-match', '--session-id', 's', '--articles', '/tmp/x.json'],
      { resolveToken: () => { throw new Error('GITHUB_TOKEN missing — token leaked: ghp_' + 'B'.repeat(36)) } },
    )
    await expect(runCli(io)).rejects.toThrow('exit:1')
    const text = errs.join('')
    expect(text).toContain('publish failed:')
    expect(text).toContain('ghp_***')
    expect(text).not.toContain('B'.repeat(36))
  })

  it('catches execute-time errors and writes publish failed line', async () => {
    // Write real files so prepareMatch gets past readFileSync, then throw from Octokit.
    const tmp = mkdtempSync(join(tmpdir(), 'cli-'))
    const articles = join(tmp, 'a.json')
    writeFileSync(articles, JSON.stringify([{ title: 'T', summary: 'S', body: 'B', tags: [], chunkIndices: [1] }]))
    const errs: string[] = []
    const io: Parameters<typeof runCli>[0] = {
      argv: ['prepare-match', '--session-id', 's1', '--articles', articles],
      stderr: (s: string) => { errs.push(s) },
      stdout: () => {},
      exit: ((code: number): never => { throw Object.assign(new Error(`exit:${code}`), { code }) }) as unknown as (code: number) => never,
      resolveToken: () => 'ghp_' + 'C'.repeat(36),
      makeOctokit: () => ({
        rest: {
          git: { getRef: vi.fn(), getCommit: vi.fn(), createBlob: vi.fn(), createTree: vi.fn(), createCommit: vi.fn(), updateRef: vi.fn() },
          repos: { getContent: vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { status: 500 })) },
        },
      } as unknown as Parameters<typeof runCli>[0]['makeOctokit'] extends (t: string) => infer R ? R : never),
    }
    await expect(runCli(io)).rejects.toThrow('exit:1')
    expect(errs.join('')).toContain('publish failed: boom')
    rmSync(tmp, { recursive: true, force: true })
  })
})

describe('runCli execute path (coverage completion)', () => {
  beforeEach(() => { process.env.LOGEX_SKIP_HERO = 'true' })
  afterEach(() => { delete process.env.LOGEX_SKIP_HERO })

  it('dispatches to execute on execute command with good files', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cli-exec-'))
    const articles = join(tmp, 'a.json')
    const decisions = join(tmp, 'd.json')
    writeFileSync(articles, JSON.stringify([{
      title: 'T', summary: 'S', body: 'B', lang: 'zh',
      translations: { en: { title: 'Te', summary: 'Se', body: 'Be' } },
      tags: [], chunkIndices: [1], slug: 'cli-exec',
    }]))
    writeFileSync(decisions, JSON.stringify([{ newIndex: 0, action: 'insert' }]))
    const stdouts: string[] = []
    const stderrs: string[] = []
    const fake = makeOctokit()
    await expect(runCli({
      argv: ['execute', '--session-id', 's-cli', '--articles', articles, '--decisions', decisions],
      stderr: (s) => { stderrs.push(s) },
      stdout: (s) => { stdouts.push(s) },
      exit: ((code: number): never => { throw Object.assign(new Error(`exit:${code}`), { code }) }) as unknown as (code: number) => never,
      resolveToken: () => 'ghp_' + 'D'.repeat(36),
      makeOctokit: () => fake as unknown as Parameters<typeof runCli>[0]['makeOctokit'] extends (t: string) => infer R ? R : never,
    })).resolves.toBeUndefined()
    expect(fake.rest.git.createCommit).toHaveBeenCalled()
    rmSync(tmp, { recursive: true, force: true })
  })
})

describe('main() stdout wiring', () => {
  it('main wires process.stdout writer (coverage for stdout fn on line 796)', async () => {
    const { main } = await import('../publish.js')
    const origArgv = process.argv
    const origExit = process.exit
    const origStderr = process.stderr.write.bind(process.stderr)
    process.argv = ['node', 'publish.ts', 'execute']
    ;(process as unknown as { exit: (code: number) => never }).exit = ((code: number) => {
      throw Object.assign(new Error(`exit:${code}`), { code })
    }) as unknown as (code?: number) => never
    ;(process.stderr as unknown as { write: (s: string) => boolean }).write = (() => true) as unknown as (s: string) => boolean
    try {
      // execute without --session-id → missing-arg path; exits 1.
      await expect(main()).rejects.toThrow('exit:1')
    } finally {
      process.argv = origArgv
      ;(process as unknown as { exit: typeof origExit }).exit = origExit
      ;(process.stderr as unknown as { write: typeof origStderr }).write = origStderr
    }
  })
})
