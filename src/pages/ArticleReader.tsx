import { useState, useEffect } from 'react'
import type { SessionArticle } from '../pipeline/types'
import { loadArticle } from '../lib/data'
import { ProjectBadge } from '../components/ProjectBadge'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import { navigate } from '../lib/router'

interface Props {
  slug: string
  allArticles: SessionArticle[]
}

const GRADIENTS: Record<string, string> = {
  'session-brain': 'linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)',
  mitsein: 'linear-gradient(135deg, #06b6d4 0%, #10b981 100%)',
  opc: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  jingxia: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
  memex: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
}

const DEFAULT_GRADIENT = 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)'

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

  if (loading) {
    return (
      <div className="state-message">
        <div className="state-message__spinner" aria-label="Loading" />
        <p>Loading article...</p>
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="state-message state-message--error">
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
      <nav className="reader__nav" aria-label="Breadcrumb">
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
      </nav>

      <div className="reader__hero">
        {article.heroImage ? (
          <img src={article.heroImage} alt="" className="reader__hero-img" />
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
          <span className="reader__sep" aria-hidden="true">&middot;</span>
          <span>{article.duration}</span>
        </div>
        <div className="reader__stats">
          <span>{article.stats.entries} entries</span>
          <span className="reader__sep" aria-hidden="true">&middot;</span>
          <span>{article.stats.messages} messages</span>
          <span className="reader__sep" aria-hidden="true">&middot;</span>
          <span>{article.stats.chunks} chunks</span>
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
