/**
 * SupabaseAdapter contract tests — U4.1
 *
 * The adapter is currently a stub (not implemented yet). These tests lock the
 * contract: both methods must throw `Error('SupabaseAdapter not implemented yet')`
 * until real implementation lands. When implementation arrives, these tests
 * should be updated rather than deleted.
 *
 * Mock boundary: none — pure unit tests against the stub class.
 */
import { describe, it, expect } from 'vitest'
import { SupabaseAdapter } from '../SupabaseAdapter'
import type { StorageAdapter } from '../types'

describe('SupabaseAdapter (stub)', () => {
  it('is constructible without arguments', () => {
    const adapter = new SupabaseAdapter()
    expect(adapter).toBeInstanceOf(SupabaseAdapter)
  })

  it('conforms to StorageAdapter interface shape', () => {
    const adapter: StorageAdapter = new SupabaseAdapter()
    expect(typeof adapter.loadIndex).toBe('function')
    expect(typeof adapter.loadArticle).toBe('function')
  })

  it('loadIndex() rejects with "not implemented yet"', async () => {
    const adapter = new SupabaseAdapter()
    await expect(adapter.loadIndex()).rejects.toThrow(
      'SupabaseAdapter not implemented yet',
    )
  })

  it('loadIndex() rejection is an Error instance', async () => {
    const adapter = new SupabaseAdapter()
    await expect(adapter.loadIndex()).rejects.toBeInstanceOf(Error)
  })

  it('loadArticle() rejects with "not implemented yet" for any slug/lang', async () => {
    const adapter = new SupabaseAdapter()
    await expect(adapter.loadArticle('any-slug', 'en')).rejects.toThrow(
      'SupabaseAdapter not implemented yet',
    )
    await expect(adapter.loadArticle('another', 'zh')).rejects.toThrow(
      'SupabaseAdapter not implemented yet',
    )
  })

  it('loadArticle() rejection is an Error instance', async () => {
    const adapter = new SupabaseAdapter()
    await expect(adapter.loadArticle('x', 'en')).rejects.toBeInstanceOf(Error)
  })

  it('multiple instances are independent', async () => {
    const a = new SupabaseAdapter()
    const b = new SupabaseAdapter()
    expect(a).not.toBe(b)
    await expect(a.loadIndex()).rejects.toThrow()
    await expect(b.loadIndex()).rejects.toThrow()
  })
})
