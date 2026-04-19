import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { ArticleMeta } from './lib/data'
import { loadAllArticles } from './lib/data'
import { useRoute } from './lib/router'
import { useTheme } from './lib/theme'
import { useAuth } from './lib/auth'
import { ThemeToggle } from './components/ThemeToggle'
import { LangToggle } from './components/LangToggle'
import { Sidebar } from './components/Sidebar'
import { ArticlesList } from './pages/ArticlesList'
import { ArticleReader } from './pages/ArticleReader'
import { Timeline } from './pages/Timeline'
import { Landing } from './pages/Landing'
import { SharesManager } from './pages/SharesManager'
import { SharePage } from './pages/SharePage'
import { useT } from './lib/i18n'

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
  const t = useT()

  const [articles, setArticles] = useState<ArticleMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sidebar state
  const hamburgerRef = useRef<HTMLButtonElement>(null)
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
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    loadAllArticles(route.lang)
      .then((data) => { if (!cancelled) setArticles(data) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, route.lang])

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      } catch { /* ignore */ }
      return next
    })
  }, [])

  const handleMobileClose = useCallback(() => {
    setMobileDrawerOpen(false)
    // Return focus to hamburger button (WCAG 2.4.3)
    setTimeout(() => hamburgerRef.current?.focus(), 0)
  }, [])

  // Focus trap for mobile drawer (WCAG 2.4.3)
  const drawerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!mobileDrawerOpen) return
    // Move focus into drawer
    const drawer = drawerRef.current
    if (!drawer) return
    const focusable = drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (focusable.length > 0) focusable[0].focus()

    // Trap focus within drawer
    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const els = drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [mobileDrawerOpen])

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mobileDrawerOpen) setMobileDrawerOpen(false)
  }, [route.path, mobileDrawerOpen])

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

  // Public share route — no auth required, render before auth gate
  if (route.path === '/share/:id') {
    return <SharePage id={route.params.id} />
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
        return <SharesManager />
      default:
        return <ArticlesList articles={articles} loading={loading} error={error} />
    }
  }

  return (
    <div className="app app--with-sidebar">
      <a href="#main-content" className="skip-link">{t('auth.skipToContent')}</a>

      {/* Top header */}
      <header className="nav" role="banner">
        <div className="nav__inner">
          {/* Hamburger (mobile only) */}
          <button
            ref={hamburgerRef}
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
              <button className="nav__logout" onClick={logout} type="button">{t('auth.logout')}</button>
            </div>
            <LangToggle />
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
          drawerRef={drawerRef}
        />

        <div className="app__content-area">
          <main className="main" id="main-content">
            {renderPage()}
          </main>

          <footer className="footer" role="contentinfo">
            <p className="footer__text">
              {loading
                ? t('footer.loading')
                : `${articles.length} ${articles.length !== 1 ? t('footer.articlePlural') : t('footer.articleSingular')} ${t('footer.from')} ${sessionCount} ${sessionCount !== 1 ? t('footer.sessionPlural') : t('footer.sessionSingular')}`}
            </p>
          </footer>
        </div>
      </div>
    </div>
  )
}

export default App
