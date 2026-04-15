import { useState, useMemo } from 'react'
import type { SessionArticle } from '../pipeline/types'
import { ArticleCard } from '../components/ArticleCard'
import { SearchBar } from '../components/SearchBar'

interface Props {
  articles: SessionArticle[]
  loading: boolean
  error: string | null
}

export function ArticlesList({ articles, loading, error }: Props) {
  const [search, setSearch] = useState('')
  const [activeProject, setActiveProject] = useState('ALL')

  const projects = useMemo(() => {
    const set = new Set(articles.map((a) => a.project))
    return ['ALL', ...Array.from(set).sort()]
  }, [articles])

  const filtered = useMemo(() => {
    let result = articles

    if (activeProject !== 'ALL') {
      result = result.filter((a) => a.project === activeProject)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }

    return result
  }, [articles, activeProject, search])

  if (loading) {
    return (
      <div className="state-message" role="status" aria-live="polite">
        <div className="state-message__spinner" aria-label="Loading" />
        <p>Loading articles...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="state-message state-message--error" role="alert">
        <p>Failed to load articles</p>
        <p className="state-message__detail">{error}</p>
      </div>
    )
  }

  return (
    <section className="articles-list" aria-label="Articles">
      <h1 className="sr-only">Session Articles</h1>
      <div className="articles-list__controls">
        <div className="articles-list__filters" role="group" aria-label="Filter by project">
          {projects.map((proj) => (
            <button
              key={proj}
              className={`filter-btn ${activeProject === proj ? 'filter-btn--active' : ''}`}
              onClick={() => setActiveProject(proj)}
              type="button"
              aria-pressed={activeProject === proj}
            >
              {proj === 'ALL' ? 'All' : proj}
            </button>
          ))}
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search articles..." />
      </div>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {filtered.length === 0
          ? 'No articles found'
          : `${filtered.length} article${filtered.length === 1 ? '' : 's'} found`}
      </div>

      {filtered.length === 0 ? (
        <div className="state-message">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="state-message__icon" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <p>No articles found</p>
          <p className="state-message__detail">
            {search ? 'Try a different search term' : 'No articles have been published yet'}
          </p>
        </div>
      ) : (
        <div className="articles-feed">
          {filtered.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      )}
    </section>
  )
}
