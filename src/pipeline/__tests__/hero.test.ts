import { describe, it, expect, vi } from 'vitest'
import {
  generateHeroImage,
  generateGradientHero,
  detectImageX,
  pickGradient,
} from '../hero'

describe('pickGradient', () => {
  it('returns exact match when slug is a known key', () => {
    expect(pickGradient('logex')).toContain('linear-gradient')
  })
  it('returns prefix match for slugs starting with a known key', () => {
    expect(pickGradient('logex-my-article')).toContain('#7c3aed')
  })
  it('falls back to default when no match', () => {
    expect(pickGradient('totally-unknown-slug')).toContain('linear-gradient')
  })
})

describe('detectImageX', () => {
  it('returns false when LOGEX_IMAGE_X=false', async () => {
    const ok = await detectImageX({ LOGEX_IMAGE_X: 'false' } as NodeJS.ProcessEnv)
    expect(ok).toBe(false)
  })
  it('returns false when fs.access throws', async () => {
    const accessMock = vi.fn().mockRejectedValue(new Error('ENOENT'))
    const ok = await detectImageX({} as NodeJS.ProcessEnv, accessMock)
    expect(ok).toBe(false)
    expect(accessMock).toHaveBeenCalledOnce()
  })
  it('returns true when fs.access resolves', async () => {
    const accessMock = vi.fn().mockResolvedValue(undefined)
    const ok = await detectImageX({} as NodeJS.ProcessEnv, accessMock)
    expect(ok).toBe(true)
  })
})

describe('generateGradientHero', () => {
  it('produces a non-empty SVG buffer with correct mime', async () => {
    const hero = await generateGradientHero('logex', 'Hello World')
    expect(hero.mime).toBe('image/svg+xml')
    expect(hero.data.length).toBeGreaterThan(1024)
    expect(hero.data.toString('utf-8')).toContain('Hello World')
  })
  it('escapes HTML-dangerous characters in the title', async () => {
    const hero = await generateGradientHero('x', '<script>&"bad"')
    const s = hero.data.toString('utf-8')
    expect(s).not.toContain('<script>')
    expect(s).toContain('&lt;script&gt;')
    expect(s).toContain('&amp;')
  })
  it('uses the default gradient for unknown slugs', async () => {
    const hero = await generateGradientHero('nope', 'T')
    expect(hero.data.toString('utf-8')).toContain('<linearGradient')
  })
})

describe('generateHeroImage', () => {
  it('forces gradient path when LOGEX_IMAGE_X=false', async () => {
    const prev = process.env.LOGEX_IMAGE_X
    process.env.LOGEX_IMAGE_X = 'false'
    try {
      const viaImageX = vi.fn()
      const hero = await generateHeroImage('logex', 'A title', { viaImageX })
      expect(viaImageX).not.toHaveBeenCalled()
      expect(hero.mime).toBe('image/svg+xml')
      expect(hero.data.length).toBeGreaterThan(1024)
    } finally {
      if (prev === undefined) delete process.env.LOGEX_IMAGE_X
      else process.env.LOGEX_IMAGE_X = prev
    }
  })

  it('falls back to gradient when detect returns false', async () => {
    const detect = vi.fn().mockResolvedValue(false)
    const viaImageX = vi.fn()
    const hero = await generateHeroImage('memex', 'Hi', { detect, viaImageX })
    expect(viaImageX).not.toHaveBeenCalled()
    expect(hero.mime).toBe('image/svg+xml')
  })

  it('falls back to gradient when image-x throws', async () => {
    const detect = vi.fn().mockResolvedValue(true)
    const viaImageX = vi.fn().mockRejectedValue(new Error('boom'))
    const hero = await generateHeroImage('mitsein', 'Hi', { detect, viaImageX })
    expect(viaImageX).toHaveBeenCalledOnce()
    expect(hero.mime).toBe('image/svg+xml')
    expect(hero.data.length).toBeGreaterThan(1024)
  })

  it('returns image-x output when detect succeeds and viaImageX resolves', async () => {
    const detect = vi.fn().mockResolvedValue(true)
    const fake = { data: Buffer.from('PNGDATA'), mime: 'image/png' as const }
    const viaImageX = vi.fn().mockResolvedValue(fake)
    const hero = await generateHeroImage('opc', 'Hi', { detect, viaImageX })
    expect(hero).toBe(fake)
  })
})
