interface Props {
  onLogin: () => void
  theme: string
  toggleTheme: () => void
}

export function Landing({ onLogin, theme, toggleTheme }: Props) {
  return (
    <div className="landing">
      <div className="landing__bg" />
      <header className="landing__header">
        <span className="landing__brand">Logex</span>
        <button
          className="landing__theme-toggle"
          onClick={toggleTheme}
          type="button"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      <main className="landing__hero">
        <h1 className="landing__title">
          Every AI session<br />
          deserves to be remembered.
        </h1>
        <p className="landing__subtitle">
          Logex turns Claude Code transcripts into blog-quality articles —
          automatically. Your sessions, your insights, your narrative.
        </p>

        <div className="landing__stats">
          <div className="landing__stat">
            <span className="landing__stat-number">780M+</span>
            <span className="landing__stat-label">tokens processed</span>
          </div>
          <div className="landing__stat">
            <span className="landing__stat-number">$800+</span>
            <span className="landing__stat-label">compute invested</span>
          </div>
          <div className="landing__stat">
            <span className="landing__stat-number">4,000+</span>
            <span className="landing__stat-label">tool calls captured</span>
          </div>
        </div>

        <button className="landing__cta" onClick={onLogin} type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Sign in with GitHub
        </button>

        <a
          className="landing__sample-link"
          href="https://session-brain.vercel.app/articles/2026-04-15-opc-spec-to-code"
          target="_blank"
          rel="noopener noreferrer"
        >
          Read a sample article →
        </a>

        <p className="landing__note">
          Personal &amp; private. Only you can see your session articles.
        </p>
      </main>

      <footer className="landing__footer">
        <div className="landing__features">
          <div className="landing__feature">
            <h3>Auto-generated narratives</h3>
            <p>Not bullet lists. Real articles with opinions, trade-offs, and honest reflection.</p>
          </div>
          <div className="landing__feature">
            <h3>Rich session metadata</h3>
            <p>Token counts, cost, tool usage, subagent activity — every session tells a quantitative story.</p>
          </div>
          <div className="landing__feature">
            <h3>Your coding memory</h3>
            <p>Three months from now, you'll remember exactly what happened in that 27-hour debugging session.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
