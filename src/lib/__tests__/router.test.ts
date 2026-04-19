import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { splitLangPrefix, detectInitialLang, parseHash, navigate, setLang } from '../router'

// Mock window.location.hash + localStorage + navigator for a jsdom env.
function setHash(h: string) {
  window.location.hash = h
}

function setPathname(p: string) {
  window.history.replaceState(null, '', p + window.location.hash)
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  window.location.hash = ''
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('splitLangPrefix', () => {
  it('strips /zh prefix', () => {
    expect(splitLangPrefix('/zh/articles/x')).toEqual({ lang: 'zh', rest: '/articles/x' })
  })
  it('strips /en prefix', () => {
    expect(splitLangPrefix('/en/')).toEqual({ lang: 'en', rest: '/' })
  })
  it('returns null lang when prefix absent', () => {
    expect(splitLangPrefix('/articles/x')).toEqual({ lang: null, rest: '/articles/x' })
  })
  it('handles bare /zh with no trailing slash', () => {
    expect(splitLangPrefix('/zh')).toEqual({ lang: 'zh', rest: '/' })
  })
  it('does not match unsupported langs', () => {
    expect(splitLangPrefix('/fr/articles/x')).toEqual({ lang: null, rest: '/fr/articles/x' })
  })
})

describe('detectInitialLang', () => {
  it('reads from localStorage first', () => {
    localStorage.setItem('logex.lang', 'zh')
    expect(detectInitialLang()).toBe('zh')
    localStorage.setItem('logex.lang', 'en')
    expect(detectInitialLang()).toBe('en')
  })

  it('falls back to navigator.language when no storage', () => {
    localStorage.clear()
    const nav = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('zh-CN')
    expect(detectInitialLang()).toBe('zh')
    nav.mockReturnValue('en-US')
    expect(detectInitialLang()).toBe('en')
  })

  it('defaults to en when everything unknown', () => {
    localStorage.clear()
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('fr-FR')
    expect(detectInitialLang()).toBe('en')
  })
})

describe('parseHash', () => {
  it('parses /zh/articles/:slug', () => {
    setHash('#/zh/articles/my-slug')
    const r = parseHash()
    expect(r).toEqual({ path: '/articles/:slug', params: { slug: 'my-slug' }, lang: 'zh' })
  })

  it('parses /en/timeline', () => {
    setHash('#/en/timeline')
    const r = parseHash()
    expect(r.path).toBe('/timeline')
    expect(r.lang).toBe('en')
  })

  it('parses /en/ as home', () => {
    setHash('#/en/')
    const r = parseHash()
    expect(r.path).toBe('/')
    expect(r.lang).toBe('en')
  })

  it('bare / falls back to detected lang', () => {
    localStorage.setItem('logex.lang', 'zh')
    setHash('#/')
    const r = parseHash()
    expect(r.lang).toBe('zh')
    expect(r.path).toBe('/')
  })

  it('/share/:id is lang-independent', () => {
    setHash('#/share/abc123')
    const r = parseHash()
    expect(r.path).toBe('/share/:id')
    expect(r.params.id).toBe('abc123')
  })

  it('bare-path /share/:id (no hash) resolves to share route', () => {
    setPathname('/share/abc')
    const r = parseHash()
    expect(r.path).toBe('/share/:id')
    expect(r.params.id).toBe('abc')
  })

  it('bare-path /share/:id/extra does NOT match share route', () => {
    setPathname('/share/abc/extra')
    const r = parseHash()
    expect(r.path).not.toBe('/share/:id')
  })

  it('hash wins over pathname when both point at share-like URLs', () => {
    setPathname('/share/bar')
    setHash('#/zh/articles/foo')
    const r = parseHash()
    expect(r.path).toBe('/articles/:slug')
    expect(r.params.slug).toBe('foo')
    expect(r.lang).toBe('zh')
  })

  it('persists lang to localStorage', () => {
    setHash('#/en/articles/x')
    parseHash()
    expect(localStorage.getItem('logex.lang')).toBe('en')
  })
})

describe('navigate', () => {
  it('injects current lang when given a bare path', () => {
    localStorage.setItem('logex.lang', 'zh')
    setHash('#/zh/')
    navigate('/articles/foo')
    expect(window.location.hash).toBe('#/zh/articles/foo')
  })

  it('respects lang argument override', () => {
    setHash('#/zh/')
    navigate('/articles/foo', 'en')
    expect(window.location.hash).toBe('#/en/articles/foo')
  })

  it('keeps lang prefix when path already has one', () => {
    setHash('#/zh/')
    navigate('/en/articles/foo')
    expect(window.location.hash).toBe('#/en/articles/foo')
  })

  it('never injects lang into /share/ paths', () => {
    navigate('/share/xyz')
    expect(window.location.hash).toBe('#/share/xyz')
  })
})

describe('setLang', () => {
  it('swaps lang segment, preserving path', () => {
    setHash('#/zh/articles/abc')
    setLang('en')
    expect(window.location.hash).toBe('#/en/articles/abc')
    expect(localStorage.getItem('logex.lang')).toBe('en')
  })

  it('works from bare /', () => {
    setHash('#/')
    setLang('zh')
    expect(window.location.hash).toBe('#/zh/')
  })

  it('leaves share pages alone', () => {
    setHash('#/share/abc')
    setLang('en')
    expect(window.location.hash).toBe('#/share/abc')
  })
})
