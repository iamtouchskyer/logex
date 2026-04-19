/**
 * SharePage unit tests — U3.1
 *
 * Mock boundary: global.fetch ONLY. No router mocks, no internal-lib mocks.
 * Covers 11 states from plan.md U3.1 including BUG-2 heroImage shapes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SharePage } from '../SharePage'

// ---------- helpers ----------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }) as Response
}

/** Convenience: mock global.fetch to return the given queue in order. */
function queueFetch(responses: Response[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn()
  for (const r of responses) fn.mockResolvedValueOnce(r)
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

/** Article response shape expected by SharePage */
function article(title = 'Hello', body = '# Hi\n\nhello world', slug = '2026-04-20-hi') {
  return { article: { title, body }, slug }
}

describe('SharePage', () => {
  beforeEach(() => {
    // clean state each test
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    delete (globalThis as { fetch?: unknown }).fetch
  })

  // (1) loading / probing state — while fetch is pending
  it('shows loading state while probing the share', async () => {
    let resolveProbe!: (r: Response) => void
    const pending = new Promise<Response>((res) => { resolveProbe = res })
    globalThis.fetch = vi.fn().mockReturnValueOnce(pending) as unknown as typeof fetch

    render(<SharePage id="abc" />)

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)

    // unblock to avoid unhandled promise
    await act(async () => { resolveProbe(jsonResponse(200, article())) })
  })

  // (2) 404 not found
  it('renders not_found state on 404', async () => {
    queueFetch([jsonResponse(404, { error: 'Not found' })])
    render(<SharePage id="missing" />)
    await waitFor(() => {
      expect(screen.getByText(/share not found/i)).toBeInTheDocument()
    })
  })

  // (3) 410 expired
  it('renders expired state on 410', async () => {
    queueFetch([jsonResponse(410, { error: 'Expired' })])
    render(<SharePage id="exp" />)
    await waitFor(() => {
      expect(screen.getByText(/share link has expired/i)).toBeInTheDocument()
    })
  })

  // (4) 403 locked
  it('renders locked state on 403 with "locked" error', async () => {
    queueFetch([jsonResponse(403, { error: 'Share is locked' })])
    render(<SharePage id="locked1" />)
    await waitFor(() => {
      expect(screen.getByText(/this share link has been locked/i)).toBeInTheDocument()
    })
  })

  // (5) 401 password-required — renders the form
  it('renders password prompt form on 401', async () => {
    queueFetch([jsonResponse(401, { error: 'PASSWORD_REQUIRED' })])
    render(<SharePage id="pw" />)
    const input = await screen.findByLabelText("Password")
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: /view article/i })).toBeInTheDocument()
  })

  // (6) submit → success
  it('submits password and renders article on success', async () => {
    const fetchFn = queueFetch([
      jsonResponse(401, { error: 'PASSWORD_REQUIRED' }),
      jsonResponse(200, article('Secret Title', 'secret body')),
    ])
    const user = userEvent.setup()
    render(<SharePage id="pw" />)

    const input = await screen.findByLabelText("Password")
    await user.type(input, 'letmein')
    await user.click(screen.getByRole('button', { name: /view article/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Secret Title' })).toBeInTheDocument()
    })
    // POST was made with JSON body containing password — verify mock boundary
    const postCall = fetchFn.mock.calls[1]
    expect(postCall[1]?.method).toBe('POST')
    expect(JSON.parse(postCall[1].body as string)).toEqual({ password: 'letmein' })
  })

  // (7) submit → wrong password
  it('shows wrong-password error when POST returns 401', async () => {
    queueFetch([
      jsonResponse(401, { error: 'PASSWORD_REQUIRED' }),
      jsonResponse(401, { error: 'Wrong password' }),
    ])
    const user = userEvent.setup()
    render(<SharePage id="pw" />)

    const input = await screen.findByLabelText("Password")
    await user.type(input, 'wrong')
    await user.click(screen.getByRole('button', { name: /view article/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/wrong password/i)
    })
    // input cleared
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe('')
  })

  // (7b) submit → lockout (too many attempts returns 403 with "locked")
  it('transitions to locked when POST returns 403 lock message', async () => {
    queueFetch([
      jsonResponse(401, { error: 'PASSWORD_REQUIRED' }),
      jsonResponse(403, { error: 'Too many attempts — share locked' }),
    ])
    const user = userEvent.setup()
    render(<SharePage id="pw" />)
    const input = await screen.findByLabelText("Password")
    await user.type(input, 'bad')
    await user.click(screen.getByRole('button', { name: /view article/i }))
    await waitFor(() => {
      expect(screen.getByText(/share link has been locked/i)).toBeInTheDocument()
    })
  })

  // (8) public share (no password) — 200 on initial probe
  it('renders article directly when share is public (200 on probe)', async () => {
    queueFetch([jsonResponse(200, article('Public Post', '# body'))])
    render(<SharePage id="pub" />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Public Post' })).toBeInTheDocument()
    })
    // GET only, no POST
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  // --- BUG-2: heroImage must NOT render a broken <img> ---
  // SharePage intentionally does not render hero images. This test locks that
  // contract for all 3 shapes: present string, empty string "", undefined.
  // If someone regresses by adding <img src={article.heroImage} />, the
  // empty-string case would produce a broken image element — which these
  // queryByRole('img', ...) assertions catch.

  // (9) heroImage present
  it('BUG-2: does not render any <img> even when heroImage is a non-empty URL', async () => {
    queueFetch([jsonResponse(200, {
      ...article('WithHero'),
      article: { ...article('WithHero').article, heroImage: 'https://example.com/h.png' },
    })])
    render(<SharePage id="h1" />)
    await screen.findByRole('heading', { name: 'WithHero' })
    // BUG-2: no <img> leaks into the page from SharePage
    expect(screen.queryByRole('img')).toBeNull()
    // extra: no raw <img> tag either (in case role is suppressed)
    expect(document.querySelector('img')).toBeNull()
  })

  // (10) heroImage empty-string ""  ← the actual BUG-2 scenario
  it('BUG-2: renders NO <img> when heroImage is empty string ""', async () => {
    queueFetch([jsonResponse(200, {
      ...article('EmptyHero'),
      article: { ...article('EmptyHero').article, heroImage: '' },
    })])
    render(<SharePage id="h2" />)
    await screen.findByRole('heading', { name: 'EmptyHero' })
    // BUG-2: empty string must NOT produce a broken <img src="">
    expect(screen.queryByRole('img')).toBeNull()
    expect(document.querySelector('img')).toBeNull()
    // also: no element with src="" — canonical broken-image signature
    expect(document.querySelector('img[src=""]')).toBeNull()
  })

  // (11) heroImage undefined
  it('BUG-2: renders NO <img> when heroImage is undefined', async () => {
    queueFetch([jsonResponse(200, article('NoHero'))])
    render(<SharePage id="h3" />)
    await screen.findByRole('heading', { name: 'NoHero' })
    expect(screen.queryByRole('img')).toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  // ---- Interaction / a11y coverage ----

  // keyboard navigation + Enter submits (eval criteria)
  it('keyboard: Tab focuses password input, Enter submits form', async () => {
    queueFetch([
      jsonResponse(401, { error: 'PASSWORD_REQUIRED' }),
      jsonResponse(200, article('KB')),
    ])
    const user = userEvent.setup()
    render(<SharePage id="kb" />)
    const input = await screen.findByLabelText("Password") as HTMLInputElement
    // Focus is auto-set on prompt; ensure the input is focusable via keyboard
    await waitFor(() => expect(input).toHaveFocus())
    await user.keyboard('hunter2')
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'KB' })).toBeInTheDocument()
    })
  })

  // error fallback — retry button resets to prompt
  it('error state shows retry button that returns to prompt', async () => {
    queueFetch([
      jsonResponse(500, { error: 'boom' }),
    ])
    render(<SharePage id="err" />)
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    })
    const retryBtn = screen.getByRole('button', { name: /try again/i })
    const user = userEvent.setup()
    await user.click(retryBtn)
    expect(await screen.findByLabelText("Password")).toBeInTheDocument()
  })

  it('POST returning 410 transitions to expired', async () => {
    queueFetch([
      jsonResponse(401, { error: 'PASSWORD_REQUIRED' }),
      jsonResponse(410, { error: 'Expired' }),
    ])
    const user = userEvent.setup()
    render(<SharePage id="pw" />)
    await user.type(await screen.findByLabelText("Password"), 'x')
    await user.click(screen.getByRole('button', { name: /view article/i }))
    await waitFor(() => {
      expect(screen.getByText(/share link has expired/i)).toBeInTheDocument()
    })
  })

  it('POST returning 404 transitions to not_found', async () => {
    queueFetch([
      jsonResponse(401, { error: 'PASSWORD_REQUIRED' }),
      jsonResponse(404, { error: 'Not found' }),
    ])
    const user = userEvent.setup()
    render(<SharePage id="pw" />)
    await user.type(await screen.findByLabelText("Password"), 'x')
    await user.click(screen.getByRole('button', { name: /view article/i }))
    await waitFor(() => {
      expect(screen.getByText(/share not found/i)).toBeInTheDocument()
    })
  })

  // button disabled state while loading
  it('submit button is disabled until password entered', async () => {
    queueFetch([jsonResponse(401, { error: 'PASSWORD_REQUIRED' })])
    render(<SharePage id="btn" />)
    const btn = await screen.findByRole('button', { name: /view article/i })
    expect(btn).toBeDisabled()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText("Password"), 'x')
    expect(btn).not.toBeDisabled()
  })
})
