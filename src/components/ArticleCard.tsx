import type { SessionArticle } from '../pipeline/types'
import { ProjectBadge } from './ProjectBadge'
import { navigate } from '../lib/router'

interface Props {
  article: SessionArticle
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
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function ArticleCard({ article }: Props) {
  const gradient = GRADIENTS[article.project] ?? DEFAULT_GRADIENT

  return (
    <article
      className="article-card"
      onClick={() => navigate(`/articles/${article.slug}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate(`/articles/${article.slug}`)
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`Read: ${article.title}`}
    >
      <div className="article-card__hero">
        {article.heroImage ? (
          <img src={article.heroImage} alt="" className="article-card__hero-img" />
        ) : (
          <div className="article-card__hero-gradient" style={{ background: gradient }} />
        )}
      </div>
      <div className="article-card__content">
        <div className="article-card__meta">
          <time dateTime={article.date}>{formatDate(article.date)}</time>
          <span className="article-card__sep" aria-hidden="true">&middot;</span>
          <span>{article.duration}</span>
          <span className="article-card__sep" aria-hidden="true">&middot;</span>
          <ProjectBadge project={article.project} />
        </div>
        <h2 className="article-card__title">{article.title}</h2>
        <p className="article-card__summary">{article.summary}</p>
        {article.tags.length > 0 && (
          <div className="article-card__tags">
            {article.tags.map((tag) => (
              <span key={tag} className="article-card__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
