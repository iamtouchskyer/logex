import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('getCanonicalOrigin', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function load() {
    const mod = await import('../canonical-origin')
    return mod.getCanonicalOrigin
  }

  it('returns VITE_PUBLIC_ORIGIN when set', async () => {
    vi.stubEnv('VITE_PUBLIC_ORIGIN', 'https://logex-io.vercel.app')
    const fn = await load()
    expect(fn()).toBe('https://logex-io.vercel.app')
  })

  it('strips trailing slash from env value', async () => {
    vi.stubEnv('VITE_PUBLIC_ORIGIN', 'https://logex-io.vercel.app/')
    const fn = await load()
    expect(fn()).toBe('https://logex-io.vercel.app')
  })

  it('falls back to window.location.origin when env unset', async () => {
    vi.stubEnv('VITE_PUBLIC_ORIGIN', '')
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })
    const fn = await load()
    expect(fn()).toBe('http://localhost:5173')
  })

  it('ignores non-https env values', async () => {
    vi.stubEnv('VITE_PUBLIC_ORIGIN', 'http://insecure.example.com')
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })
    const fn = await load()
    expect(fn()).toBe('http://localhost:5173')
  })
})
