import { useState, useEffect, useMemo } from 'react'
import type { SessionArticle } from './pipeline/types'
import { loadAllArticles } from './lib/data'
import { useRoute } from './lib/router'
import { useTheme } from './lib/theme'
import { useAuth } from './lib/auth'
import { ThemeToggle } from './components/ThemeToggle'
import { ArticlesList } from './pages/ArticlesList'
import { ArticleReader } from './pages/ArticleReader'
import { Timeline } from './pages/Timeline'
import { Landing } from './pages/Landing'

function App() {
  const route = useRoute()
  const { theme, toggle } = useTheme()
  const { user, loading: authLoading, login, logout } = useAuth()

  const [articles, setArticles] = useState<SessionArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!user) return
    setLoading(true)
    loadAllArticles()
      .then(setArticles)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user])

  const sessionCount = useMemo(() => {
    const set = new Set(articles.map((a) => a.sessionId))
    return set.size
  }, [articles])

  // Auth loading state
  if (authLoading) {
    return (
      <div className="app">
        <div className="state-message">
          <div className="state-message__spinner" aria-label="Loading" />
        </div>
      </div>
    )
  }

  // Not authenticated — show landing page
  if (!user) {
    return <Landing onLogin={login} theme={theme} toggleTheme={toggle} />
  }

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
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="nav" role="banner">
        <div className="nav__inner">
          <a
            href="#/"
            className="nav__logo"
            aria-label="Logex home"
          >
            <span className="nav__logo-text">Logex</span>
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
            <div className="nav__user">
              {user.avatar && <img src={user.avatar} alt="" className="nav__avatar" />}
              <span className="nav__username">{user.login}</span>
              <button className="nav__logout" onClick={logout} type="button">Logout</button>
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
