import { useState, useEffect, useRef } from 'react'
import { MarkdownRenderer } from '../components/MarkdownRenderer'

interface Props {
  id: string
}

type PageState =
  | { status: 'prompt' }
  | { status: 'loading' }
  | { status: 'success'; title: string; body: string; slug: string }
  | { status: 'wrong_password' }
  | { status: 'locked' }
  | { status: 'expired' }
  | { status: 'not_found' }
  | { status: 'error'; message: string }

export function SharePage({ id }: Props) {
  const [state, setState] = useState<PageState>({ status: 'prompt' })
  const [password, setPassword] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when showing prompt
  useEffect(() => {
    if (state.status === 'prompt' || state.status === 'wrong_password') {
      inputRef.current?.focus()
    }
  }, [state.status])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password.trim()) return
    setState({ status: 'loading' })

    try {
      const params = new URLSearchParams({ password })
      const res = await fetch(`/api/share/${encodeURIComponent(id)}?${params}`)

      if (res.ok) {
        const data = await res.json() as { article: { title: string; body: string }; slug: string }
        setState({ status: 'success', title: data.article.title, body: data.article.body, slug: data.slug })
        return
      }

      if (res.status === 401 || res.status === 403) {
        let json: { error?: string } = {}
        try { json = await res.json() } catch { /* ignore */ }
        if (json.error?.toLowerCase().includes('locked') || json.error?.toLowerCase().includes('too many')) {
          setState({ status: 'locked' })
          return
        }
        setState({ status: 'wrong_password' })
        setPassword('')
        return
      }

      if (res.status === 410) {
        setState({ status: 'expired' })
        return
      }

      if (res.status === 404) {
        setState({ status: 'not_found' })
        return
      }

      const json = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string }
      setState({ status: 'error', message: json.error ?? 'Unknown error' })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Network error' })
    }
  }

  function retry() {
    setState({ status: 'prompt' })
    setPassword('')
  }

  if (state.status === 'success') {
    return (
      <div className="share-page">
        <div className="share-page__header">
          <a href="#/" className="share-page__home-link" aria-label="Go to home">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </a>
          <span className="share-page__brand">Logex</span>
          <span className="share-page__badge">Shared article</span>
        </div>
        <article className="share-page__article" aria-label={state.title}>
          <header className="share-page__article-header">
            <h1 className="share-page__title">{state.title}</h1>
          </header>
          <div className="share-page__body">
            <MarkdownRenderer content={state.body} />
          </div>
        </article>
      </div>
    )
  }

  return (
    <div className="share-page share-page--gate">
      <div className="share-page__gate-card">
        <div className="share-page__gate-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </div>

        <h1 className="share-page__gate-title">Shared Article</h1>

        {(state.status === 'prompt' || state.status === 'loading' || state.status === 'wrong_password') && (
          <>
            <p className="share-page__gate-desc">
              This article is password protected. Enter the password to view it.
            </p>
            {state.status === 'wrong_password' && (
              <p id="share-pw-error" className="share-page__gate-error" role="alert">
                Wrong password. Please try again.
              </p>
            )}
            <form className="share-page__gate-form" onSubmit={handleSubmit} aria-label="Enter share password">
              <div className="share-page__gate-field">
                <label htmlFor="share-password" className="share-page__gate-label">
                  Password
                </label>
                <input
                  ref={inputRef}
                  id="share-password"
                  type="password"
                  className="share-page__gate-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  aria-describedby={state.status === 'wrong_password' ? 'share-pw-error' : undefined}
                  disabled={state.status === 'loading'}
                  required
                />
              </div>
              <button
                type="submit"
                className="share-page__gate-btn"
                disabled={state.status === 'loading' || !password.trim()}
              >
                {state.status === 'loading' ? (
                  <>
                    <span className="share-page__btn-spinner" aria-hidden="true" />
                    Verifying…
                  </>
                ) : 'View Article'}
              </button>
            </form>
          </>
        )}

        {state.status === 'locked' && (
          <div role="alert" className="share-page__gate-status share-page__gate-status--locked">
            <p>Too many failed attempts. This share link has been locked.</p>
            <p className="share-page__gate-sub">Contact the article owner to request a new link.</p>
          </div>
        )}

        {state.status === 'expired' && (
          <div role="alert" className="share-page__gate-status share-page__gate-status--expired">
            <p>This share link has expired.</p>
            <p className="share-page__gate-sub">Contact the article owner to request a new link.</p>
          </div>
        )}

        {state.status === 'not_found' && (
          <div role="alert" className="share-page__gate-status share-page__gate-status--notfound">
            <p>Share not found.</p>
            <p className="share-page__gate-sub">The link may have been deleted or never existed.</p>
          </div>
        )}

        {state.status === 'error' && (
          <div role="alert" className="share-page__gate-status share-page__gate-status--error">
            <p>Something went wrong.</p>
            <p className="share-page__gate-sub">{state.message}</p>
            <button type="button" className="share-page__gate-btn share-page__gate-btn--secondary" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        <p className="share-page__gate-footer">
          Powered by <a href="#/" className="share-page__gate-footer-link">Logex</a>
        </p>
      </div>
    </div>
  )
}
