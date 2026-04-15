import { useState, useEffect, useMemo, useCallback } from 'react'
import type { ArticleMeta } from './lib/data'
import { loadAllArticles } from './lib/data'
import { useRoute } from './lib/router'
import { useTheme } from './lib/theme'
import { useAuth } from './lib/auth'
import { ThemeToggle } from './components/ThemeToggle'
import { Sidebar } from './components/Sidebar'
import { ArticlesList } from './pages/ArticlesList'
import { ArticleReader } from './pages/ArticleReader'
import { Timeline } from './pages/Timeline'
import { Landing } from './pages/Landing'
import { SharesPlaceholder } from './pages/SharesPlaceholder'

const SIDEBAR_COLLAPSED_KEY = 'logex-sidebar-collapsed'

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function App() {
  const route = useRoute()
  const { theme, toggle } = useTheme()
  const { user, loading: authLoading, login, logout } = useAuth()

  const [articles, setArticles] = useState<ArticleMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    loadAllArticles()
      .then(setArticles)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user])

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      } catch { /* ignore */ }
      return next
    })
  }, [])

  const handleMobileClose = useCallback(() => setMobileDrawerOpen(false), [])

  // Close mobile drawer on Escape
  useEffect(() => {
    if (!mobileDrawerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileDrawerOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mobileDrawerOpen])

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false)
  }, [route.path])

  const sessionCount = useMemo(() => {
    const set = new Set(articles.map((a) => a.sessionId).filter(Boolean))
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
        return <ArticleReader slug={route.params.slug} />
      case '/timeline':
        return <Timeline articles={articles} loading={loading} error={error} />
      case '/settings/shares':
        return <SharesPlaceholder />
      default:
        return <ArticlesList articles={articles} loading={loading} error={error} />
    }
  }

  return (
    <div className="app app--with-sidebar">
      <a href="#main-content" className="skip-link">Skip to content</a>

      {/* Top header */}
      <header className="nav" role="banner">
        <div className="nav__inner">
          {/* Hamburger (mobile only) */}
          <button
            className="nav__hamburger"
            onClick={() => setMobileDrawerOpen(true)}
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileDrawerOpen}
          >
            <HamburgerIcon />
          </button>

          {/* Logo (desktop: hidden — sidebar has it; mobile: show) */}
          <a href="#/" className="nav__logo nav__logo--mobile" aria-label="Logex home">
            <span className="nav__logo-text">Logex</span>
          </a>

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

      {/* Body: sidebar + content */}
      <div className="app__body">
        <Sidebar
          articles={articles}
          currentPath={route.path}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          mobileOpen={mobileDrawerOpen}
          onMobileClose={handleMobileClose}
        />

        <div className="app__content-area">
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
      </div>
    </div>
  )
}

export default App
