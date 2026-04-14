import { useState, useEffect, useMemo } from 'react'
import type { SessionArticle } from './pipeline/types'
import { loadAllArticles } from './lib/data'
import { useRoute, navigate } from './lib/router'
import { useTheme } from './lib/theme'
import { ThemeToggle } from './components/ThemeToggle'
import { SearchBar } from './components/SearchBar'
import { ArticlesList } from './pages/ArticlesList'
import { ArticleReader } from './pages/ArticleReader'
import { Timeline } from './pages/Timeline'

function App() {
  const route = useRoute()
  const { theme, toggle } = useTheme()

  const [articles, setArticles] = useState<SessionArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [navSearch, setNavSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    loadAllArticles()
      .then(setArticles)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (navSearch && route.path !== '/') {
      navigate('/')
    }
  }, [navSearch])

  const sessionCount = useMemo(() => {
    const set = new Set(articles.map((a) => a.sessionId))
    return set.size
  }, [articles])

  const renderPage = () => {
    switch (route.path) {
      case '/articles/:slug':
        return <ArticleReader slug={route.params.slug} allArticles={articles} />
      case '/timeline':
        return <Timeline articles={articles} loading={loading} error={error} />
      default:
        return <ArticlesList articles={articles} loading={loading} error={error} />
    }
  }

  return (
    <div className="app">
      <header className="nav" role="banner">
        <div className="nav__inner">
          <a
            href="#/"
            className="nav__logo"
            aria-label="Session Brain home"
          >
            <span className="nav__logo-text">Session Brain</span>
          </a>

          <nav className="nav__links" aria-label="Main navigation">
            <a
              href="#/"
              className={`nav__link ${route.path === '/' ? 'nav__link--active' : ''}`}
            >
              Articles
            </a>
            <a
              href="#/timeline"
              className={`nav__link ${route.path === '/timeline' ? 'nav__link--active' : ''}`}
            >
              Timeline
            </a>
          </nav>

          <div className="nav__actions">
            <div className="nav__search">
              <SearchBar value={navSearch} onChange={setNavSearch} placeholder="Search..." />
            </div>
            <ThemeToggle theme={theme} toggle={toggle} />
          </div>
        </div>
      </header>

      <main className="main" id="main-content">
        {renderPage()}
      </main>

      <footer className="footer" role="contentinfo">
        <p className="footer__text">
          {loading
            ? 'Loading...'
            : `${articles.length} article${articles.length !== 1 ? 's' : ''} from ${sessionCount} session${sessionCount !== 1 ? 's' : ''}`}
        </p>
      </footer>
    </div>
  )
}

export default App
