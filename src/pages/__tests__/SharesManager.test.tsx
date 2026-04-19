import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SharesManager } from '../SharesManager'

vi.mock('../../lib/canonical-origin', () => ({
  getCanonicalOrigin: () => 'https://logex.example.com',
}))

function mockFetch(shares: unknown[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ shares }),
  })
}

const SHARE_WITH_TITLE = {
  id: 'abc123456789',
  slug: '2026-04-19-opc-loop-fixes',
  title: 'OPC Loop Fixes',
  createdAt: '2026-04-19T00:00:00Z',
  expiresAt: '2026-05-19T00:00:00Z',
  locked: false,
}

const SHARE_WITHOUT_TITLE = {
  id: 'def123456789',
  slug: '2026-04-18-extension-capability',
  createdAt: '2026-04-18T00:00:00Z',
  expiresAt: '2026-05-18T00:00:00Z',
  locked: false,
}

describe('SharesManager', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders title from articleSnapshot when present', async () => {
    globalThis.fetch = mockFetch([SHARE_WITH_TITLE]) as unknown as typeof fetch
    render(<SharesManager />)
    await waitFor(() => {
      expect(screen.getByText('OPC Loop Fixes')).toBeTruthy()
    })
    expect(screen.queryByText('2026-04-19-opc-loop-fixes')).toBeNull()
  })

  it('falls back to slug with date prefix stripped when title absent', async () => {
    globalThis.fetch = mockFetch([SHARE_WITHOUT_TITLE]) as unknown as typeof fetch
    render(<SharesManager />)
    await waitFor(() => {
      expect(screen.getByText('extension-capability')).toBeTruthy()
    })
    expect(screen.queryByText('2026-04-18-extension-capability')).toBeNull()
  })

  it('clicking Unshare fires DELETE and removes row', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ shares: [SHARE_WITH_TITLE] }) })
      .mockResolvedValueOnce({ ok: true, status: 204 })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    render(<SharesManager />)
    await waitFor(() => expect(screen.getByText('OPC Loop Fixes')).toBeTruthy())

    const deleteBtn = screen.getByLabelText('Delete share link for OPC Loop Fixes')
    await user.click(deleteBtn)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/share/abc123456789',
      expect.objectContaining({ method: 'DELETE' }),
    )
    await waitFor(() => {
      expect(screen.queryByText('OPC Loop Fixes')).toBeNull()
    })
  })

  it('shows error when DELETE fails, row remains', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ shares: [SHARE_WITH_TITLE] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Server error' }) })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    vi.spyOn(globalThis, 'alert').mockImplementation(() => {})

    render(<SharesManager />)
    await waitFor(() => expect(screen.getByText('OPC Loop Fixes')).toBeTruthy())

    const deleteBtn = screen.getByLabelText('Delete share link for OPC Loop Fixes')
    await user.click(deleteBtn)

    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalledWith('Server error')
    })
    expect(screen.getByText('OPC Loop Fixes')).toBeTruthy()
  })
})
