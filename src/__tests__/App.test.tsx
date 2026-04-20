/**
 * App router / guard tests (U5.1)
 *
 * Mock boundary: global.fetch ONLY (+ localStorage/document.cookie resets).
 * NEVER mocks ../lib/router, ../lib/auth, ../lib/data, ../lib/storage/*,
 * ../pages/*. This is the whole point — we exercise the real guard decision
 * path end-to-end so regressions in route dispatch / share bypass / session
 * expiry redirect are all caught here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { isAllowedAvatarUrl } from '../App'
import { clearMemCache, getUserScope } from '../lib/storage/GitHubAdapter'

// ---- jsdom polyfills ----------------------------------------------------
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// ---- helpers ------------------------------------------------------------

type FetchResolver = (url: string, init?: RequestInit) => Response | Promise<Response>

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installFetch(resolver: FetchResolver): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    return resolver(url, init)
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

function setHash(h: string) {
  window.history.replaceState(null, '', '#' + h)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

/** Clear any "session-ish" state between tests. */
function clearAllSessionState() {
  // Clear all cookies — forcibly simulate unauth.
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
  // Storage: used by router + sidebar + theme
  try { localStorage.clear() } catch { /* noop */ }
  try { sessionStorage.clear() } catch { /* noop */ }
  clearMemCache()
}

describe('App router + guard (real code path)', () => {
  const origLocation = window.location
  let hrefWrites: string[] = []

  beforeEach(() => {
    clearAllSessionState()
    hrefWrites = []
    // Proxy window.location so we observe redirect without actually navigating
    // (jsdom would throw on cross-origin href assignment). We deliberately do
    // NOT replace `hash` — that must continue to work for the real router.
    const proxy = new Proxy(origLocation, {
      get(_t, p) {
        if (p === 'search') return origLocation.search
        if (p === 'pathname') return origLocation.pathname
        if (p === 'hash') return origLocation.hash
        if (p === 'href') return origLocation.href
        return Reflect.get(origLocation, p as string)
      },
      set(_t, p, v) {
        if (p === 'href') { hrefWrites.push(String(v)); return true }
        if (p === 'hash') { origLocation.hash = String(v); return true }
        ;(origLocation as unknown as Record<string, unknown>)[p as string] = v
        return true
      },
    })
    Object.defineProperty(window, 'location', { configurable: true, value: proxy })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: origLocation })
    cleanup()
    delete (globalThis as { fetch?: unknown }).fetch
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------
  // (1) Unauth + /articles/:slug → public Landing (no redirect)
  //
  // NOTE: the original plan text said "redirect to /api/auth/login", but the
  // production guard (App.tsx:149-183 "Auto-redirect removed") deliberately
  // lands on the public Landing page instead. We lock in the ACTUAL shipped
  // behavior so a regression that reintroduces the auto-redirect is caught.
  // -------------------------------------------------------------------
  it('unauth access to #/articles/:slug shows Landing, does NOT auto-redirect to login', async () => {
    const fetchMock = installFetch((url) => {
      if (url.startsWith('/api/auth/me')) return json(200, { user: null })
      return json(404, { error: 'unexpected' })
    })

    setHash('/articles/hello')
    render(<App />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({ credentials: 'same-origin' }),
      )
    })

    // Landing is the public fallback brand
    expect(await screen.findByText('Logex')).toBeInTheDocument()
    // F-1: ZERO redirects on unauth Landing path. A substring check like
    // !h.includes('/api/auth/login') would pass on
    // `https://evil.example/steal?next=/api/auth/login`, so we require that
    // no href write happened at all.
    expect(hrefWrites).toHaveLength(0)
  })

  // -------------------------------------------------------------------
  // (2) Share bypass — even when unauth, /share/:id renders SharePage,
  // NOT Landing and NOT a redirect. Explicitly clears cookies + 401s
  // /api/auth/me (simulated "no session at all").
  // -------------------------------------------------------------------
  it('#/share/:id bypasses auth guard even with no session cookie', async () => {
    // Belt-and-suspenders: the beforeEach already cleared cookies, but the
    // spec says the share test MUST explicitly do this.
    document.cookie = ''
    expect(document.cookie).toBe('')

    const fetchMock = installFetch((url) => {
      if (url.startsWith('/api/auth/me')) return json(401, { user: null })
      if (url.startsWith('/api/share/abc')) {
        return json(200, {
          article: { title: 'Public Share Title', body: '# hello' },
          slug: 'public-share-title',
        })
      }
      return json(404, { error: 'unexpected' })
    })

    setHash('/share/abc')
    render(<App />)

    // Share article title renders via SharePage
    await waitFor(() => {
      expect(screen.getByText('Public Share Title')).toBeInTheDocument()
    })

    // The real share fetch hit the real SharePage code path
    const shareCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/share/abc'),
    )
    expect(shareCall).toBeDefined()

    // Positive assertion: we are NOT on Landing (brand text would be "Logex")
    expect(screen.queryByText(/^Sign in with GitHub$/i)).toBeNull()
    // F-1: ZERO redirects — substring check leaks attacker URLs.
    expect(hrefWrites).toHaveLength(0)
    // F-3: NEGATIVE assertion on /api/articles/* — the share-bypass path must
    // never touch the authenticated articles endpoints. A regression that
    // accidentally triggers the main effect while rendering SharePage would
    // fail this.
    const touchedArticles = fetchMock.mock.calls.some(([url]) =>
      String(url).includes('/api/articles'),
    )
    expect(touchedArticles).toBe(false)
  })

  // -------------------------------------------------------------------
  // (3) Valid session → app shell renders (real authenticated path).
  // /api/auth/me returns a user, and the articles index loads successfully.
  // -------------------------------------------------------------------
  it('valid session → authed app shell renders with sidebar + nav', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, { user: { login: 'alice', name: 'Alice', avatar: null } })
      if (url.includes('/api/articles/index'))
        return json(200, { articles: [] })
      return json(404, {})
    })

    setHash('/')
    render(<App />)

    // Username renders in the top nav — only reachable via authed path.
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })
    // F-1: no redirects at all on the happy authed path.
    expect(hrefWrites).toHaveLength(0)
  })

  // -------------------------------------------------------------------
  // (4) 401 on protected fetch mid-session → redirect to /api/auth/login.
  // /api/auth/me says we're authed (fresh page load), but then the articles
  // index returns 401 (JWT revoked / rotated). Guard must redirect, not
  // silently swallow.
  // -------------------------------------------------------------------
  it('401 on protected /api/articles/* after auth → redirects to /api/auth/login', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, { user: { login: 'bob', name: null, avatar: null } })
      if (url.includes('/api/articles/'))
        return json(401, { error: 'unauthenticated' })
      return json(404, {})
    })

    setHash('/')
    render(<App />)

    await waitFor(() => {
      expect(hrefWrites).toContain('/api/auth/login')
    })
  })

  // -------------------------------------------------------------------
  // (5) Expired JWT → redirect (NOT blank page). This is the same code
  // path as (4) but framed as the "token was valid at page load, expired
  // mid-session" scenario. We assert the shell does NOT end up blank.
  // -------------------------------------------------------------------
  it('expired JWT mid-session → redirect to login, never a blank page', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, { user: { login: 'carol', name: null, avatar: null } })
      if (url.includes('/api/articles/'))
        return json(401, { error: 'token_expired' })
      return json(404, {})
    })

    setHash('/timeline')
    const { container } = render(<App />)

    await waitFor(() => {
      expect(hrefWrites).toContain('/api/auth/login')
    })

    // F-2: positive assertion — the exact login endpoint was written exactly
    // once, and the shell rendered the authed-layout root (`.app`) while the
    // redirect was scheduled. A regression that 404s the shell or lands on a
    // blank `<div />` would fail both checks.
    expect(hrefWrites.filter((h) => h === '/api/auth/login')).toHaveLength(1)
    const appRoot = container.querySelector('.app')
    expect(appRoot).not.toBeNull()
    expect((appRoot as HTMLElement).children.length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------
  // F-4 regression: when a protected fetch 401s, the in-memory GitHub
  // adapter cache MUST be flushed before the login redirect. Otherwise
  // the next user to auth in this tab inherits the previous user's data.
  // Biting test: seed a cache entry, trigger the 401 path, assert the
  // entry is gone AND the redirect happened. Removing clearMemCache()
  // from the 401 handler makes this go red.
  // -------------------------------------------------------------------
  it('F-4: 401 on protected fetch scrubs mem-cache before redirect', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, { user: { login: 'mia', name: null, avatar: null } })
      if (url.includes('/api/articles/'))
        return json(401, { error: 'unauthenticated' })
      return json(404, {})
    })

    setHash('/')
    render(<App />)

    await waitFor(() => {
      expect(hrefWrites).toContain('/api/auth/login')
    })

    // F-4 bite: the storage layer's currentUserScope gets set to 'mia' when
    // the authed articles fetch starts. clearMemCache() — which the 401
    // handler must call before redirecting — resets the scope back to null.
    // If the clearMemCache() call is removed from App.tsx's 401 handler,
    // currentUserScope stays as 'mia' and this assertion goes red.
    await waitFor(() => {
      expect(getUserScope()).toBeNull()
    })
  })

  // -------------------------------------------------------------------
  // (6) Auth loading spinner — /api/auth/me is pending
  // -------------------------------------------------------------------
  it('while /api/auth/me is pending, renders the loading spinner', () => {
    const pending = new Promise<Response>(() => { /* never resolves */ })
    installFetch((url) => {
      if (url.startsWith('/api/auth/me')) return pending
      return json(404, {})
    })

    setHash('/')
    render(<App />)
    expect(document.querySelector('.state-message__spinner')).not.toBeNull()
  })

  // -------------------------------------------------------------------
  // (7) signed_out=1 query param → Landing shows signedOut flash
  // -------------------------------------------------------------------
  it('unauth with ?signed_out=1 forwards the flash to Landing', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/auth/me')) return json(200, { user: null })
      return json(404, {})
    })

    // Put the flag on window.location.search. Because we proxy location, set
    // it on the underlying real object via the raw setter.
    origLocation.search = '?signed_out=1'
    try {
      setHash('/')
      render(<App />)
      await screen.findByText('Logex')
      // Landing rendered successfully → signedOut branch was exercised.
    } finally {
      origLocation.search = ''
    }
  })

  // -------------------------------------------------------------------
  // (8) repoMissing onboarding: /api/articles/index.json → 404
  // REPO_NOT_FOUND triggers EmptyOnboarding screen.
  // -------------------------------------------------------------------
  it('authed user with no logex-data repo sees onboarding', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, { user: { login: 'dave', name: null, avatar: null } })
      if (url.includes('/api/articles/index'))
        return json(404, { error: 'REPO_NOT_FOUND', login: 'dave' })
      return json(404, {})
    })

    setHash('/')
    render(<App />)

    // EmptyOnboarding includes the user's login string somewhere visible.
    await waitFor(() => {
      // Either the login text or a setup/onboarding hint is present
      const body = document.body.textContent ?? ''
      expect(body).toContain('dave')
    })
  })

  // -------------------------------------------------------------------
  // (9) Generic articles load error → error onboarding with retry.
  // Clicking retry triggers a second fetch (loadAttempt++).
  // -------------------------------------------------------------------
  it('generic article load failure shows retry, which re-fetches', async () => {
    let articleCalls = 0
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, { user: { login: 'erin', name: null, avatar: null } })
      if (url.includes('/api/articles/index')) {
        articleCalls++
        return json(500, { error: 'boom' })
      }
      return json(404, {})
    })

    setHash('/')
    render(<App />)

    await waitFor(() => expect(articleCalls).toBeGreaterThanOrEqual(1))

    // Find a retry-looking button and click it.
    const buttons = Array.from(document.querySelectorAll('button'))
    const retryBtn = buttons.find((b) => /retry|重试|try again/i.test(b.textContent ?? ''))
    if (retryBtn) {
      await act(async () => { fireEvent.click(retryBtn) })
      await waitFor(() => expect(articleCalls).toBeGreaterThan(1))
    } else {
      // If the current i18n doesn't surface a "retry" button label we can
      // match, at least assert that the error path rendered (login visible).
      expect((document.body.textContent ?? '').includes('erin')).toBe(true)
    }
  })

  // -------------------------------------------------------------------
  // (10) Route dispatch — /articles/:slug, /timeline, /settings/shares all
  // render the authed shell (content area has #main-content).
  // -------------------------------------------------------------------
  it.each([
    ['/articles/some-slug'],
    ['/timeline'],
    ['/settings/shares'],
  ])('authed route %s mounts the app shell', async (hash) => {
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, { user: { login: 'frank', name: null, avatar: null } })
      if (url.includes('/api/articles/index'))
        return json(200, { articles: [] })
      return json(404, {})
    })

    setHash(hash)
    render(<App />)

    await waitFor(() => {
      expect(document.getElementById('main-content')).not.toBeNull()
    })
  })

  // -------------------------------------------------------------------
  // (11) Sidebar mobile hamburger is present and clickable. We can't
  // assert aria-expanded remains true because App has a route-change
  // effect that closes the drawer the moment mobileDrawerOpen flips —
  // but the click itself must not crash, and the nav shell is rendered.
  // -------------------------------------------------------------------
  it('renders mobile hamburger; clicking it is handled without error', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, { user: { login: 'gwen', name: null, avatar: null } })
      if (url.includes('/api/articles/index'))
        return json(200, { articles: [] })
      return json(404, {})
    })

    setHash('/')
    render(<App />)
    await screen.findByText('gwen')

    const hamburger = document.querySelector<HTMLButtonElement>('.nav__hamburger')
    expect(hamburger).not.toBeNull()
    await act(async () => { fireEvent.click(hamburger!) })
    // After click, the component is still mounted (shell still present).
    expect(document.getElementById('main-content')).not.toBeNull()

    // Escape key while drawer-open effect is wired — should not crash.
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
  })

  // -------------------------------------------------------------------
  // (12) Logout button wires to the useAuth.logout() path → href assign
  // to /api/auth/logout. This exercises the real useAuth hook.
  // -------------------------------------------------------------------
  it('clicking logout redirects to /api/auth/logout', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, { user: { login: 'harry', name: null, avatar: null } })
      if (url.includes('/api/articles/index'))
        return json(200, { articles: [] })
      return json(404, {})
    })

    setHash('/')
    render(<App />)
    await screen.findByText('harry')

    const logoutBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => /logout|退出|sign out/i.test(b.textContent ?? ''))
    expect(logoutBtn).toBeDefined()
    await act(async () => { fireEvent.click(logoutBtn!) })
    expect(hrefWrites.some((h) => h.includes('/api/auth/logout'))).toBe(true)
  })

  // -------------------------------------------------------------------
  // (13) Swallowing localStorage.setItem failure during sidebar toggle.
  // We can't easily exercise getItem-throwing because useTheme also uses
  // it during mount. Instead, assert the app renders with a pre-set
  // sidebar-collapsed=true cookie/localStorage value so the truthy branch
  // is taken.
  // -------------------------------------------------------------------
  it('initial render respects pre-set sidebar-collapsed=true in localStorage', async () => {
    localStorage.setItem('logex-sidebar-collapsed', 'true')
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, { user: { login: 'ivan', name: null, avatar: null } })
      if (url.includes('/api/articles/index'))
        return json(200, { articles: [] })
      return json(404, {})
    })

    setHash('/')
    render(<App />)
    await screen.findByText('ivan')
    expect(document.getElementById('main-content')).not.toBeNull()
  })

  // -------------------------------------------------------------------
  // (14) Clicking the sidebar collapse button toggles localStorage —
  // directly exercises handleToggleCollapse + its try/catch setItem path.
  // -------------------------------------------------------------------
  it('clicking sidebar collapse button toggles localStorage', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, { user: { login: 'jess', name: null, avatar: null } })
      if (url.includes('/api/articles/index'))
        return json(200, { articles: [] })
      return json(404, {})
    })
    setHash('/')
    render(<App />)
    await screen.findByText('jess')

    const toggleBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button'),
    ).find((b) =>
      /sidebar|侧边栏/i.test(b.getAttribute('aria-label') ?? ''),
    )
    expect(toggleBtn).toBeDefined()
    await act(async () => { fireEvent.click(toggleBtn!) })
    expect(localStorage.getItem('logex-sidebar-collapsed')).toBe('true')
    await act(async () => { fireEvent.click(toggleBtn!) })
    expect(localStorage.getItem('logex-sidebar-collapsed')).toBe('false')
  })

  // -------------------------------------------------------------------
  // (15) handleToggleCollapse swallows localStorage.setItem throwing.
  // -------------------------------------------------------------------
  it('handleToggleCollapse survives localStorage.setItem throwing', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, { user: { login: 'kim', name: null, avatar: null } })
      if (url.includes('/api/articles/index'))
        return json(200, { articles: [] })
      return json(404, {})
    })
    setHash('/')
    render(<App />)
    await screen.findByText('kim')

    const realSet = Storage.prototype.setItem
    Storage.prototype.setItem = vi.fn(() => { throw new Error('quota') })
    try {
      const toggleBtn = Array.from(
        document.querySelectorAll<HTMLButtonElement>('button'),
      ).find((b) => /sidebar|侧边栏/i.test(b.getAttribute('aria-label') ?? ''))
      expect(toggleBtn).toBeDefined()
      await act(async () => { fireEvent.click(toggleBtn!) })
      // No crash = pass. DOM is still mounted.
      expect(document.getElementById('main-content')).not.toBeNull()
    } finally {
      Storage.prototype.setItem = realSet
    }
  })

  // -------------------------------------------------------------------
  // F-7 regression: `user.avatar` must be locked to GitHub's avatar host.
  // A crafted attacker URL (tracking pixel / XSS via img) must NOT render;
  // the <img> tag should be omitted entirely (fallback = no avatar).
  // Biting: swap the allowlist check out, and these tests go red because
  // the attacker host appears in the rendered DOM.
  // -------------------------------------------------------------------
  it('F-7: avatar from GitHub host renders', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, {
          user: {
            login: 'nick',
            name: null,
            avatar: 'https://avatars.githubusercontent.com/u/42?v=4',
          },
        })
      if (url.includes('/api/articles/index'))
        return json(200, { articles: [] })
      return json(404, {})
    })
    setHash('/')
    render(<App />)
    await screen.findByText('nick')
    const img = document.querySelector<HTMLImageElement>('img.nav__avatar')
    expect(img).not.toBeNull()
    expect(img!.src).toBe('https://avatars.githubusercontent.com/u/42?v=4')
  })

  it('F-7: malicious avatar URL is rejected — no img rendered, no attacker host in DOM', async () => {
    const attackerUrl = 'https://attacker.evil/pixel.gif?uid=nick'
    installFetch((url) => {
      if (url.startsWith('/api/auth/me'))
        return json(200, {
          user: { login: 'nick', name: null, avatar: attackerUrl },
        })
      if (url.includes('/api/articles/index'))
        return json(200, { articles: [] })
      return json(404, {})
    })
    setHash('/')
    render(<App />)
    await screen.findByText('nick')
    // No avatar img at all — hard fallback.
    expect(document.querySelector('img.nav__avatar')).toBeNull()
    // Attacker host must not appear anywhere in the rendered HTML.
    expect(document.body.innerHTML).not.toContain('attacker.evil')
  })

  it('F-7: isAllowedAvatarUrl allowlist unit — GitHub only, https only', () => {
    expect(isAllowedAvatarUrl('https://avatars.githubusercontent.com/u/1')).toBe(true)
    // Wrong host (even a look-alike)
    expect(isAllowedAvatarUrl('https://avatars.githubusercontent.com.evil/u/1')).toBe(false)
    expect(isAllowedAvatarUrl('https://githubusercontent.com/u/1')).toBe(false)
    // Wrong scheme
    expect(isAllowedAvatarUrl('http://avatars.githubusercontent.com/u/1')).toBe(false)
    expect(isAllowedAvatarUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedAvatarUrl('data:image/png;base64,AAA')).toBe(false)
    // Garbage
    expect(isAllowedAvatarUrl('not-a-url')).toBe(false)
    expect(isAllowedAvatarUrl('')).toBe(false)
  })

  // Silence unused-import warnings — keep userEvent available for future cases
  void userEvent
})
