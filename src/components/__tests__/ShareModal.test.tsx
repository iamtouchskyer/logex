/**
 * ShareModal component tests — UX behavior of the rewritten modal.
 * Covers the 3 features: 🎲 generate, no-password toggle, expires chips.
 *
 * The component lives inside ArticleReader.tsx; we re-export it here via the
 * pages module path. To keep the test isolated, we test the modal in a
 * standalone harness — extracted via a thin re-export shim is overkill, so we
 * mount the page and pre-mock the article fetch + auth.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArticleReader } from '../../pages/ArticleReader'

// Mock the data + auth + router modules
vi.mock('../../lib/canonical-origin', () => ({
  getCanonicalOrigin: () => 'https://logex-io.vercel.app',
}))
vi.mock('../../lib/data', () => ({
  loadArticle: vi.fn(async () => ({
    slug: 'demo-slug',
    title: 'Demo',
    summary: 'Test',
    body: '# Body',
    project: 'logex',
    date: '2026-04-18',
    duration: '1h',
    sessionId: 'abc12345',
    tags: [],
    stats: { entries: 1, messages: 1, chunks: 1 },
  })),
}))
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ user: { login: 'octo', avatar: '' }, loading: false, login: vi.fn(), logout: vi.fn() }),
}))
vi.mock('../../lib/router', () => ({
  navigate: vi.fn(),
  useLang: () => 'en',
}))
vi.mock('../../components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}))
vi.mock('../../components/ProjectBadge', () => ({
  ProjectBadge: () => <span>badge</span>,
}))

async function openModal() {
  render(<ArticleReader slug="demo-slug" />)
  await screen.findByRole('button', { name: /Share this article/i })
  await userEvent.click(screen.getByRole('button', { name: /Share this article/i }))
  return screen.getByRole('dialog')
}

describe('ShareModal — rewrite', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')

  beforeEach(() => {
    fetchSpy.mockReset()
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'abcDEF123', expiresAt: new Date(Date.now() + 86400_000).toISOString() }), {
      status: 201, headers: { 'content-type': 'application/json' },
    }))
  })
  afterEach(() => { cleanup(); fetchSpy.mockReset() })

  it('🎲 button fills password input with 6 readable chars', async () => {
    await openModal()
    const pwInput = screen.getByPlaceholderText(/Set a password/i) as HTMLInputElement
    await userEvent.click(screen.getByRole('button', { name: /Generate strong password/i }))
    expect(pwInput.value).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })

  it('No-password toggle hides the input and submits password: null', async () => {
    await openModal()
    const checkbox = screen.getByLabelText(/No password/i)
    await userEvent.click(checkbox)
    expect(screen.queryByPlaceholderText(/Set a password/i)).not.toBeInTheDocument()

    const createBtn = screen.getByRole('button', { name: /Create link/i })
    expect(createBtn).not.toBeDisabled()
    await userEvent.click(createBtn)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const [, init] = fetchSpy.mock.calls[0] as [unknown, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.password).toBeNull()
    expect(body.slug).toBe('demo-slug')
  })

  it('Expires chips switch the value sent to the API (90 days)', async () => {
    await openModal()
    const pwInput = screen.getByPlaceholderText(/Set a password/i)
    fireEvent.change(pwInput, { target: { value: 'abcd' } })
    await userEvent.click(screen.getByRole('radio', { name: /90 days/i }))
    await userEvent.click(screen.getByRole('button', { name: /Create link/i }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.expiresInDays).toBe(90)
  })

  it('Custom… expands a number input', async () => {
    await openModal()
    await userEvent.click(screen.getByRole('radio', { name: /Custom/i }))
    expect(screen.getByLabelText(/Custom expiry days/i)).toBeInTheDocument()
  })

  it('success modal displays canonical origin URL (Bug 7 regression)', async () => {
    await openModal()
    const checkbox = screen.getByLabelText(/No password/i)
    await userEvent.click(checkbox)
    await userEvent.click(screen.getByRole('button', { name: /Create link/i }))
    const urlInput = await screen.findByDisplayValue(/logex-io\.vercel\.app/)
    expect((urlInput as HTMLInputElement).value).toBe('https://logex-io.vercel.app/#/share/abcDEF123')
  })

  it('5xx HTML response shows human banner (not "Unexpected token")', async () => {
    fetchSpy.mockReset()
    fetchSpy.mockResolvedValueOnce(new Response('<html>500</html>', {
      status: 500, headers: { 'content-type': 'text/html' },
    }))
    await openModal()
    const pwInput = screen.getByPlaceholderText(/Set a password/i)
    fireEvent.change(pwInput, { target: { value: 'abcd' } })
    await userEvent.click(screen.getByRole('button', { name: /Create link/i }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/temporarily unavailable/i)
    expect(alert.textContent).not.toMatch(/Unexpected token/)
  })
})
