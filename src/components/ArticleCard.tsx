import { useState } from 'react'
import type { SessionArticle } from '../pipeline/types'
import { ProjectBadge } from './ProjectBadge'
import { navigate } from '../lib/router'
import { GRADIENTS, DEFAULT_GRADIENT } from '../lib/gradients'

interface Props {
  article: SessionArticle
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  // Older than 30 days — show absolute date
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ArticleCard({ article }: Props) {
  const [imgError, setImgError] = useState(false)
  const gradient = GRADIENTS[article.project] ?? DEFAULT_GRADIENT
  const showGradient = !article.heroImage || imgError

  const stats = article.stats
  const hasRichStats = stats && 'tokens' in stats && stats.tokens

  return (
    <div
      className="article-card"
      onClick={() => navigate(`/articles/${article.slug}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate(`/articles/${article.slug}`)
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Read: ${article.title}`}
    >
      <div className="article-card__hero">
        {showGradient ? (
          <div
            className="article-card__hero-gradient"
            style={{ background: gradient }}
            aria-hidden="true"
          >
            <span className="article-card__hero-project">{article.project}</span>
          </div>
        ) : (
          <img
            src={article.heroImage ?? undefined}
            alt=""
            loading="lazy"
            className="article-card__hero-img"
            onError={() => setImgError(true)}
          />
        )}
      </div>

      <div className="article-card__content">
        <div className="article-card__meta">
          <time dateTime={article.date}>{formatDate(article.date)}</time>
          <span className="article-card__sep" aria-hidden="true">&middot;</span>
          <ProjectBadge project={article.project} />
          {article.duration && (
            <>
              <span className="article-card__sep" aria-hidden="true">&middot;</span>
              <span>{article.duration}</span>
            </>
          )}
        </div>

        <h2 className="article-card__title">{article.title}</h2>
        <p className="article-card__summary">{article.summary}</p>

        <div className="article-card__footer">
          {(article.tags ?? []).length > 0 && (
            <div className="article-card__tags">
              {(article.tags ?? []).map((tag) => (
                <span key={tag} className="article-card__tag">{tag}</span>
              ))}
            </div>
          )}

          {hasRichStats && (
            <div className="article-card__stats">
              <span className="article-card__stat-pill">
                {(stats.tokens!.total / 1000).toFixed(0)}K tokens
              </span>
              {stats.costEstimate && (
                <span className="article-card__stat-pill article-card__stat-pill--cost">
                  ${Number(stats.costEstimate.total_cost).toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
