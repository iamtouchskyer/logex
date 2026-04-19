import { useState, useEffect, useCallback } from 'react'
import { getCanonicalOrigin } from '../lib/canonical-origin'

interface ShareItem {
  id: string
  slug: string
  title?: string
  createdAt: string
  expiresAt: string
  locked: boolean
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; shares: ShareItem[] }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getShareStatus(share: ShareItem): 'locked' | 'expired' | 'active' {
  if (share.locked) return 'locked'
  if (new Date(share.expiresAt) < new Date()) return 'expired'
  return 'active'
}

/** Prefer snapshot title, fallback to slug with leading YYYY-MM-DD- stripped. */
function displayTitle(share: ShareItem): string {
  if (share.title) return share.title
  return share.slug.replace(/^\d{4}-\d{2}-\d{2}-/, '')
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

interface CopyButtonProps {
  text: string
  label: string
}

function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for HTTP contexts or older browsers
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } finally {
        document.body.removeChild(ta)
      }
    }
  }

  return (
    <button
      type="button"
      className={`shares-manager__copy-btn${copied ? ' shares-manager__copy-btn--copied' : ''}`}
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : label}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      <CopyIcon />
      <span>{copied ? 'Copied!' : 'Copy'}</span>
    </button>
  )
}

export function SharesManager() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadShares = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const res = await fetch('/api/share', { credentials: 'same-origin' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Failed to load shares' })) as { error?: string }
        setState({ status: 'error', message: json.error ?? 'Failed to load shares' })
        return
      }
      const data = await res.json() as { shares: ShareItem[] }
      setState({ status: 'loaded', shares: data.shares })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Network error' })
    }
  }, [])

  useEffect(() => {
    void loadShares()
  }, [loadShares])

  async function handleDelete(id: string, title: string) {
    if (deletingId) return
    if (!window.confirm(`Delete share link for "${title}"? This cannot be undone.`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (res.ok) {
        setState((prev) =>
          prev.status === 'loaded'
            ? { status: 'loaded', shares: prev.shares.filter((s) => s.id !== id) }
            : prev
        )
      } else {
        const json = await res.json().catch(() => ({ error: 'Failed to delete' })) as { error?: string }
        alert(json.error ?? 'Failed to delete share')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Network error')
    } finally {
      setDeletingId(null)
    }
  }

  function getShareUrl(id: string): string {
    return `${getCanonicalOrigin()}/#/share/${id}`
  }

  if (state.status === 'loading') {
    return (
      <div className="state-message" role="status" aria-live="polite">
        <div className="state-message__spinner" aria-label="Loading" />
        <p>Loading shares…</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="state-message state-message--error" role="alert">
        <p>Failed to load shares</p>
        <p className="state-message__detail">{state.message}</p>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => void loadShares()}
        >
          Retry
        </button>
      </div>
    )
  }

  const { shares } = state

  return (
    <div className="shares-manager">
      <div className="shares-manager__header">
        <h1 className="shares-manager__title">Share Links</h1>
        <p className="shares-manager__desc">
          Manage your password-protected share links. Each link grants access to a single article.
        </p>
      </div>

      {shares.length === 0 ? (
        <div className="shares-manager__empty" role="status">
          <div className="shares-manager__empty-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </div>
          <p className="shares-manager__empty-title">No share links yet</p>
          <p className="shares-manager__empty-sub">
            Open any article and click the <strong>Share</strong> button to create a link.
          </p>
        </div>
      ) : (
        <div className="shares-manager__table-wrapper" role="region" aria-label="Share links list">
          <table className="shares-manager__table">
            <thead>
              <tr>
                <th scope="col">Article</th>
                <th scope="col">Share URL</th>
                <th scope="col">Created</th>
                <th scope="col">Expires</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shares.map((share) => {
                const status = getShareStatus(share)
                const url = getShareUrl(share.id)
                return (
                  <tr key={share.id} className={`shares-manager__row shares-manager__row--${status}`}>
                    <td className="shares-manager__cell shares-manager__cell--slug">
                      <a href={`#/articles/${share.slug}`} className="shares-manager__slug-link">
                        {displayTitle(share)}
                      </a>
                    </td>
                    <td className="shares-manager__cell shares-manager__cell--url">
                      <div className="shares-manager__url-wrap">
                        <span className="shares-manager__url-text" title={url}>{url}</span>
                        <CopyButton text={url} label={`Copy share URL for ${displayTitle(share)}`} />
                      </div>
                    </td>
                    <td className="shares-manager__cell">
                      <time dateTime={share.createdAt}>{formatDate(share.createdAt)}</time>
                    </td>
                    <td className="shares-manager__cell">
                      <time dateTime={share.expiresAt}>{formatDate(share.expiresAt)}</time>
                    </td>
                    <td className="shares-manager__cell">
                      <span className={`shares-manager__status shares-manager__status--${status}`}>
                        {status === 'active' && 'Active'}
                        {status === 'expired' && 'Expired'}
                        {status === 'locked' && 'Locked'}
                      </span>
                    </td>
                    <td className="shares-manager__cell shares-manager__cell--actions">
                      <button
                        type="button"
                        className="shares-manager__delete-btn"
                        onClick={() => void handleDelete(share.id, displayTitle(share))}
                        disabled={deletingId === share.id}
                        aria-label={`Delete share link for ${displayTitle(share)}`}
                        title="Delete share link"
                      >
                        {deletingId === share.id ? (
                          <span className="shares-manager__delete-spinner" aria-hidden="true" />
                        ) : (
                          <TrashIcon />
                        )}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
