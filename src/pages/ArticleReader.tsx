import { useState, useEffect, useRef, useCallback } from 'react'
import type { SessionArticle } from '../pipeline/types'
import { loadArticle } from '../lib/data'
import { ProjectBadge } from '../components/ProjectBadge'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import { navigate, useLang } from '../lib/router'
import { useAuth } from '../lib/auth'
import { GRADIENTS, DEFAULT_GRADIENT } from '../lib/gradients'
import { safeFetch } from '../lib/safeFetch'
import { generatePassword } from '../lib/passwordGen'
import { getCanonicalOrigin } from '../lib/canonical-origin'

interface Props {
  slug: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Share Modal
// ─────────────────────────────────────────────────────────────────────────────

interface ShareModalProps {
  slug: string
  onClose: () => void
}

type ModalState =
  | { status: 'form' }
  | { status: 'submitting' }
  | { status: 'success'; url: string; expiresAt: string }
  | { status: 'error'; message: string }

type ExpiresPreset = 7 | 30 | 90 | 'custom'

function ShareModal({ slug, onClose }: ShareModalProps) {
  const [noPassword, setNoPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [expiresPreset, setExpiresPreset] = useState<ExpiresPreset>(30)
  const [customDays, setCustomDays] = useState(30)
  const [modalState, setModalState] = useState<ModalState>({ status: 'form' })
  const [copied, setCopied] = useState(false)

  const expiresInDays = expiresPreset === 'custom' ? customDays : expiresPreset

  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const firstFocusRef = useRef<HTMLInputElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // Focus trap
  useEffect(() => {
    firstFocusRef.current?.focus()

    const dialog = dialogRef.current
    if (!dialog) return

    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
  }, [onClose])

  // Prevent body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (modalState.status === 'submitting') return
    setModalState({ status: 'submitting' })

    const result = await safeFetch<{ id?: string; expiresAt?: string }>(
      '/api/share',
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          password: noPassword ? null : password,
          expiresInDays,
        }),
      },
    )

    if (!result.ok) {
      setModalState({ status: 'error', message: result.error })
      return
    }

    const json = result.data
    const shareUrl = `${getCanonicalOrigin()}/#/share/${json.id}`
    setModalState({ status: 'success', url: shareUrl, expiresAt: json.expiresAt ?? '' })
  }

  function handleGenerate() {
    setPassword(generatePassword(6))
    setShowPassword(true)
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const isSubmitting = modalState.status === 'submitting'

  return (
    <div
      ref={backdropRef}
      className="share-modal__backdrop"
      onClick={handleBackdropClick}
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        className="share-modal__content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        {/* Header */}
        <div className="share-modal__header">
          <h2 className="share-modal__title" id="share-modal-title">
            Share Article
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="share-modal__close"
            onClick={onClose}
            aria-label="Close share dialog"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="share-modal__body">
          {modalState.status === 'success' ? (
            <div className="share-modal__success">
              <div className="share-modal__success-icon" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="share-modal__success-title">Share link created!</p>
              {modalState.expiresAt && (
                <p className="share-modal__success-expires">
                  Expires {new Date(modalState.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
              <div className="share-modal__url-row">
                <input
                  type="text"
                  className="share-modal__url-input"
                  value={modalState.url}
                  readOnly
                  aria-label="Share URL"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  type="button"
                  className={`share-modal__copy-btn${copied ? ' share-modal__copy-btn--copied' : ''}`}
                  onClick={() => void handleCopy(modalState.url)}
                  aria-label={copied ? 'Copied!' : 'Copy share URL'}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <button
                type="button"
                className="share-modal__btn share-modal__btn--secondary"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          ) : (
            <form className="share-modal__form" onSubmit={(e) => void handleSubmit(e)} aria-label="Create share link">
              <p className="share-modal__form-desc">
                {noPassword ? <>Create a public link for <strong>{slug}</strong>.</> : <>Create a password-protected link for <strong>{slug}</strong>.</>}
              </p>

              {modalState.status === 'error' && (
                <p className="share-modal__form-error" role="alert">
                  {modalState.message}
                </p>
              )}

              <label className="share-modal__checkbox-row">
                <input
                  type="checkbox"
                  className="share-modal__checkbox"
                  checked={noPassword}
                  onChange={(e) => setNoPassword(e.target.checked)}
                  disabled={isSubmitting}
                />
                <span>No password (public link)</span>
              </label>

              <div className="share-modal__field">
                <label htmlFor="share-modal-password" className="share-modal__label">
                  Password {!noPassword && <span aria-hidden="true">(min 4 chars)</span>}
                </label>
                {noPassword ? (
                  <p className="share-modal__field-hint">
                    Anyone with the link can view this article.
                  </p>
                ) : (
                  <div className="share-modal__pw-row">
                    <input
                      ref={firstFocusRef}
                      id="share-modal-password"
                      type={showPassword ? 'text' : 'password'}
                      className="share-modal__input share-modal__input--pw"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Set a password"
                      minLength={4}
                      required
                      disabled={isSubmitting}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="share-modal__pw-btn"
                      onClick={() => setShowPassword((s) => !s)}
                      disabled={isSubmitting}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide' : 'Show'}
                    >
                      {showPassword ? '🙈' : '👁'}
                    </button>
                    <button
                      type="button"
                      className="share-modal__pw-btn"
                      onClick={handleGenerate}
                      disabled={isSubmitting}
                      aria-label="Generate strong password"
                      title="Generate"
                    >
                      🎲
                    </button>
                  </div>
                )}
              </div>

              <div className="share-modal__field">
                <span className="share-modal__label" id="share-modal-expiry-label">
                  Expires in
                </span>
                <div
                  className="share-modal__chips"
                  role="radiogroup"
                  aria-labelledby="share-modal-expiry-label"
                >
                  {([7, 30, 90, 'custom'] as const).map((p) => {
                    const selected = expiresPreset === p
                    const label = p === 'custom' ? 'Custom…' : `${p} days`
                    return (
                      <button
                        key={String(p)}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`share-modal__chip${selected ? ' share-modal__chip--selected' : ''}`}
                        onClick={() => setExpiresPreset(p)}
                        disabled={isSubmitting}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                {expiresPreset === 'custom' && (
                  <input
                    id="share-modal-expiry"
                    type="number"
                    className="share-modal__input share-modal__input--narrow"
                    value={customDays}
                    onChange={(e) => setCustomDays(Math.max(1, Math.min(365, Number(e.target.value))))}
                    min={1}
                    max={365}
                    required
                    disabled={isSubmitting}
                    aria-label="Custom expiry days"
                  />
                )}
                <span className="share-modal__field-hint">1–365 days</span>
              </div>

              <div className="share-modal__actions">
                <button
                  type="button"
                  className="share-modal__btn share-modal__btn--secondary"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="share-modal__btn share-modal__btn--primary"
                  disabled={isSubmitting || (!noPassword && password.length < 4)}
                >
                  {isSubmitting ? (
                    <>
                      <span className="share-modal__btn-spinner" aria-hidden="true" />
                      Creating…
                    </>
                  ) : 'Create link'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ArticleReader
// ─────────────────────────────────────────────────────────────────────────────

export function ArticleReader({ slug }: Props) {
  const [article, setArticle] = useState<SessionArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [heroImgError, setHeroImgError] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const shareButtonRef = useRef<HTMLButtonElement>(null)

  const { user } = useAuth()
  const lang = useLang()

  const handleCloseShare = useCallback(() => {
    setShareOpen(false)
    // Return focus to share button after modal closes
    setTimeout(() => shareButtonRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    loadArticle(slug, lang)
      .then((a) => {
        setArticle(a)
        window.scrollTo(0, 0)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [slug, lang])

  // Reset hero image error when article changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeroImgError(false)
  }, [slug])

  if (loading) {
    return (
      <div className="state-message" role="status" aria-live="polite">
        <div className="state-message__spinner" aria-label="Loading" />
        <p>Loading article...</p>
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="state-message state-message--error" role="alert">
        <p>Article not found</p>
        <p className="state-message__detail">{error || `No article with slug "${slug}"`}</p>
        <button className="btn btn--secondary" onClick={() => navigate('/')} type="button">
          Back to articles
        </button>
      </div>
    )
  }

  const gradient = GRADIENTS[article.project] ?? DEFAULT_GRADIENT

  return (
    <>
      <article className="reader" aria-label={article.title}>
        <div className="reader__nav" aria-label="Article navigation">
          <button
            className="reader__back"
            onClick={() => navigate('/')}
            type="button"
            aria-label="Back to articles"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back
          </button>

          {user && (
            <button
              ref={shareButtonRef}
              type="button"
              className="reader__share-btn"
              onClick={() => setShareOpen(true)}
              aria-label="Share this article"
              aria-haspopup="dialog"
              aria-expanded={shareOpen}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>
          )}
        </div>

        <div className="reader__hero">
          {article.heroImage && !heroImgError ? (
            <img
              src={article.heroImage}
              alt=""
              className="reader__hero-img"
              onError={() => setHeroImgError(true)}
            />
          ) : (
            <div className="reader__hero-gradient" style={{ background: gradient }} />
          )}
        </div>

        <header className="reader__header">
          <h1 className="reader__title">{article.title}</h1>
          <div className="reader__meta">
            <time dateTime={article.date}>{formatDate(article.date)}</time>
            <span className="reader__sep" aria-hidden="true">&middot;</span>
            <ProjectBadge project={article.project} />
            {article.duration && (
              <>
                <span className="reader__sep" aria-hidden="true">&middot;</span>
                <span>{article.duration}</span>
              </>
            )}
          </div>
          <div className="reader__stats">
            {article.stats.tokens ? (
              <>
                <span className="reader__stat-pill">{(article.stats.tokens.total / 1000).toFixed(0)}K tokens</span>
                <span className="reader__stat-pill">{article.stats.llmCalls ?? '?'} LLM calls</span>
                <span className="reader__stat-pill">{article.stats.toolCalls?.total ?? '?'} tool uses</span>
                {article.stats.subagents && article.stats.subagents.count > 0 && (
                  <span className="reader__stat-pill">{article.stats.subagents.count} subagents</span>
                )}
                {article.stats.costEstimate && (
                  <span className="reader__stat-pill reader__stat-pill--cost">${Number(article.stats.costEstimate.total_cost).toFixed(2)}</span>
                )}
              </>
            ) : (
              <>
                <span className="reader__stat-pill">{article.stats.entries} entries</span>
                <span className="reader__stat-pill">{article.stats.messages} messages</span>
                <span className="reader__stat-pill">{article.stats.chunks} chunks</span>
              </>
            )}
          </div>
          <div className="reader__session-id" title={article.sessionId}>
            session:{article.sessionId.slice(0, 8)}
          </div>
          <p className="reader__summary">{article.summary}</p>
        </header>

        <div className="reader__body">
          <MarkdownRenderer content={article.body} />
        </div>

        {article.tags.length > 0 && (
          <div className="reader__tags">
            {article.tags.map((tag) => (
              <span key={tag} className="reader__tag">{tag}</span>
            ))}
          </div>
        )}
      </article>

      {shareOpen && (
        <ShareModal slug={slug} onClose={handleCloseShare} />
      )}
    </>
  )
}
