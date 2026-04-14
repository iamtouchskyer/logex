import { useMemo } from 'react'
import type { SessionArticle } from '../pipeline/types'
import { ProjectBadge } from '../components/ProjectBadge'
import { navigate } from '../lib/router'

interface Props {
  articles: SessionArticle[]
  loading: boolean
  error: string | null
}

function formatDayHeader(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function groupByDay(articles: SessionArticle[]): Map<string, SessionArticle[]> {
  const sorted = [...articles].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
  const groups = new Map<string, SessionArticle[]>()
  for (const article of sorted) {
    const day = article.date.slice(0, 10)
    const group = groups.get(day)
    if (group) {
      group.push(article)
    } else {
      groups.set(day, [article])
    }
  }
  return groups
}

export function Timeline({ articles, loading, error }: Props) {
  const grouped = useMemo(() => groupByDay(articles), [articles])

  if (loading) {
    return (
      <div className="state-message">
        <div className="state-message__spinner" aria-label="Loading" />
        <p>Loading timeline...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="state-message state-message--error">
        <p>Failed to load timeline</p>
        <p className="state-message__detail">{error}</p>
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className="state-message">
        <p>No articles to display</p>
        <p className="state-message__detail">Publish some session articles first</p>
      </div>
    )
  }

  return (
    <section className="timeline" aria-label="Timeline">
      <h2 className="timeline__heading">Timeline</h2>
      {Array.from(grouped.entries()).map(([day, dayArticles]) => (
        <div key={day} className="timeline__group">
          <h3 className="timeline__date">{formatDayHeader(dayArticles[0].date)}</h3>
          <div className="timeline__track">
            {dayArticles.map((article) => (
              <article
                key={article.slug}
                className="timeline__entry"
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
                <div className="timeline__marker" aria-hidden="true" />
                <div className="timeline__content">
                  <div className="timeline__entry-header">
                    <ProjectBadge project={article.project} />
                    <span className="timeline__duration">{article.duration}</span>
                  </div>
                  <h4 className="timeline__title">{article.title}</h4>
                  <p className="timeline__body">{article.summary}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
