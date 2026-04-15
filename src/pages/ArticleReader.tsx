import { useState, useEffect } from 'react'
import type { SessionArticle } from '../pipeline/types'
import { loadArticle } from '../lib/data'
import { ProjectBadge } from '../components/ProjectBadge'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import { navigate } from '../lib/router'
import { GRADIENTS, DEFAULT_GRADIENT } from '../lib/gradients'

interface Props {
  slug: string
  allArticles: SessionArticle[]
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

export function ArticleReader({ slug, allArticles }: Props) {
  const [article, setArticle] = useState<SessionArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [heroImgError, setHeroImgError] = useState(false)

  useEffect(() => {
    const cached = allArticles.find((a) => a.slug === slug)
    if (cached) {
      setArticle(cached)
      setLoading(false)
      window.scrollTo(0, 0)
      return
    }

    setLoading(true)
    setError(null)
    loadArticle(slug)
      .then((a) => {
        setArticle(a)
        window.scrollTo(0, 0)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [slug, allArticles])

  // Reset hero image error when article changes
  useEffect(() => { setHeroImgError(false) }, [slug])

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
  )
}
