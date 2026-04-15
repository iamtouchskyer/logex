import { useMemo } from 'react'
import type { RefObject } from 'react'
import type { ArticleMeta } from '../lib/storage/types'

interface SidebarProps {
  articles: ArticleMeta[]
  currentPath: string
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onMobileClose: () => void
  /** Ref forwarded to mobile drawer div — used for focus trap */
  drawerRef?: RefObject<HTMLDivElement | null>
  /** Called when user clicks a project filter */
  onProjectClick?: (project: string) => void
  /** Called when user clicks a tag filter */
  onTagClick?: (tag: string) => void
}

// Simple SVG icons (inline, no dep)
function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function IconShare() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
}

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function IconLogex() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  )
}

export function Sidebar({
  articles,
  currentPath,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
  drawerRef,
  onProjectClick,
  onTagClick,
}: SidebarProps) {
  // Projects with article counts
  const projects = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of articles) {
      if (a.project) {
        map.set(a.project, (map.get(a.project) ?? 0) + 1)
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [articles])

  // Top 10 tags by count
  const tags = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of articles) {
      for (const t of a.tags ?? []) {
        map.set(t, (map.get(t) ?? 0) + 1)
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  }, [articles])

  // Stats
  const stats = useMemo(() => {
    let tokens = 0
    let cost = 0
    for (const a of articles) {
      tokens += a.stats?.tokens?.total ?? 0
      cost += Number(a.stats?.costEstimate?.total_cost ?? 0)
    }
    return { articles: articles.length, tokens, cost }
  }, [articles])

  const navLinks = [
    { label: 'Articles', href: '#/', path: '/', icon: <IconGrid /> },
    { label: 'Timeline', href: '#/timeline', path: '/timeline', icon: <IconClock /> },
    { label: 'Shares', href: '#/settings/shares', path: '/settings/shares', icon: <IconShare /> },
  ]

  const isActive = (path: string) => {
    if (path === '/') return currentPath === '/'
    return currentPath === path
  }

  const sidebarContent = (
    <aside
      className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}
      aria-label="Main sidebar"
    >
      {/* Header: logo + collapse toggle */}
      <div className="sidebar__header">
        <a href="#/" className="sidebar__brand" aria-label="Logex home">
          <span className="sidebar__brand-icon"><IconLogex /></span>
          {!collapsed && <span className="sidebar__brand-text">Logex</span>}
        </a>
        <button
          className="sidebar__toggle"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          type="button"
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>

      {/* Main nav */}
      <nav className="sidebar__nav" aria-label="Sidebar navigation">
        {navLinks.map((link) => (
          <a
            key={link.path}
            href={link.href}
            className={`sidebar__link${isActive(link.path) ? ' sidebar__link--active' : ''}`}
            aria-current={isActive(link.path) ? 'page' : undefined}
            aria-label={collapsed ? link.label : undefined}
          >
            <span className="sidebar__link-icon">{link.icon}</span>
            {!collapsed && <span className="sidebar__link-text">{link.label}</span>}
          </a>
        ))}
      </nav>

      {/* Scrollable sections below */}
      <div className="sidebar__body">
        {/* Projects */}
        {projects.length > 0 && (
          <div className="sidebar__section">
            {!collapsed && (
              <p className="sidebar__section-heading">Projects</p>
            )}
            <ul className="sidebar__list">
              {projects.map(([name, count]) => (
                <li key={name}>
                  <button
                    className="sidebar__item-btn"
                    onClick={() => onProjectClick?.(name)}
                    type="button"
                    aria-label={`Filter by project ${name}, ${count} articles`}
                  >
                    <span className="sidebar__item-dot" aria-hidden="true" />
                    {!collapsed && (
                      <>
                        <span className="sidebar__item-label">{name}</span>
                        <span className="sidebar__item-count">{count}</span>
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="sidebar__section">
            {!collapsed && (
              <p className="sidebar__section-heading">Tags</p>
            )}
            <ul className="sidebar__list">
              {tags.map(([tag, count]) => (
                <li key={tag}>
                  <button
                    className="sidebar__item-btn"
                    onClick={() => onTagClick?.(tag)}
                    type="button"
                    aria-label={`Filter by tag ${tag}, ${count} articles`}
                  >
                    <span className="sidebar__item-hash" aria-hidden="true">#</span>
                    {!collapsed && (
                      <>
                        <span className="sidebar__item-label">{tag}</span>
                        <span className="sidebar__item-count">{count}</span>
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Stats */}
        {!collapsed && (
          <div className="sidebar__section sidebar__section--stats">
            <p className="sidebar__section-heading">Stats</p>
            <div className="sidebar__stats">
              <div className="sidebar__stat-chip">
                <span className="sidebar__stat-value">{stats.articles}</span>
                <span className="sidebar__stat-label">articles</span>
              </div>
              <div className="sidebar__stat-chip">
                <span className="sidebar__stat-value">
                  {stats.tokens >= 1000
                    ? `${(stats.tokens / 1000).toFixed(1)}k`
                    : stats.tokens}
                </span>
                <span className="sidebar__stat-label">tokens</span>
              </div>
              <div className="sidebar__stat-chip sidebar__stat-chip--cost">
                <span className="sidebar__stat-value">${stats.cost.toFixed(2)}</span>
                <span className="sidebar__stat-label">cost</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div className="sidebar-wrapper sidebar-wrapper--desktop">
        {sidebarContent}
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="sidebar__drawer-overlay"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      <div ref={drawerRef} className={`sidebar-wrapper sidebar-wrapper--mobile${mobileOpen ? ' sidebar-wrapper--mobile-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        {/* Mobile close button */}
        <div className="sidebar__mobile-close">
          <button
            className="sidebar__close-btn"
            onClick={onMobileClose}
            type="button"
            aria-label="Close navigation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {/* Mobile sidebar — never collapsed */}
        <aside className="sidebar" aria-label="Mobile navigation">
          <div className="sidebar__header">
            <a href="#/" className="sidebar__brand" aria-label="Logex home" onClick={onMobileClose}>
              <span className="sidebar__brand-icon"><IconLogex /></span>
              <span className="sidebar__brand-text">Logex</span>
            </a>
          </div>

          <nav className="sidebar__nav" aria-label="Mobile navigation links">
            {navLinks.map((link) => (
              <a
                key={link.path}
                href={link.href}
                className={`sidebar__link${isActive(link.path) ? ' sidebar__link--active' : ''}`}
                aria-current={isActive(link.path) ? 'page' : undefined}
                onClick={onMobileClose}
              >
                <span className="sidebar__link-icon">{link.icon}</span>
                <span className="sidebar__link-text">{link.label}</span>
              </a>
            ))}
          </nav>

          <div className="sidebar__body">
            {projects.length > 0 && (
              <div className="sidebar__section">
                <p className="sidebar__section-heading">Projects</p>
                <ul className="sidebar__list">
                  {projects.map(([name, count]) => (
                    <li key={name}>
                      <button
                        className="sidebar__item-btn"
                        onClick={() => { onProjectClick?.(name); onMobileClose() }}
                        type="button"
                      >
                        <span className="sidebar__item-dot" aria-hidden="true" />
                        <span className="sidebar__item-label">{name}</span>
                        <span className="sidebar__item-count">{count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tags.length > 0 && (
              <div className="sidebar__section">
                <p className="sidebar__section-heading">Tags</p>
                <ul className="sidebar__list">
                  {tags.map(([tag, count]) => (
                    <li key={tag}>
                      <button
                        className="sidebar__item-btn"
                        onClick={() => { onTagClick?.(tag); onMobileClose() }}
                        type="button"
                      >
                        <span className="sidebar__item-hash" aria-hidden="true">#</span>
                        <span className="sidebar__item-label">{tag}</span>
                        <span className="sidebar__item-count">{count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="sidebar__section sidebar__section--stats">
              <p className="sidebar__section-heading">Stats</p>
              <div className="sidebar__stats">
                <div className="sidebar__stat-chip">
                  <span className="sidebar__stat-value">{stats.articles}</span>
                  <span className="sidebar__stat-label">articles</span>
                </div>
                <div className="sidebar__stat-chip">
                  <span className="sidebar__stat-value">
                    {stats.tokens >= 1000
                      ? `${(stats.tokens / 1000).toFixed(1)}k`
                      : stats.tokens}
                  </span>
                  <span className="sidebar__stat-label">tokens</span>
                </div>
                <div className="sidebar__stat-chip sidebar__stat-chip--cost">
                  <span className="sidebar__stat-value">${stats.cost.toFixed(2)}</span>
                  <span className="sidebar__stat-label">cost</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
