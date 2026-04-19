import { useT } from '../lib/i18n'
import { LangToggle } from '../components/LangToggle'

interface Props {
  onLogin: () => void
  theme: string
  toggleTheme: () => void
  signedOut?: boolean
}

export function Landing({ onLogin, theme, toggleTheme, signedOut }: Props) {
  const t = useT()
  return (
    <div className="landing">
      <div className="landing__bg" />
      <header className="landing__header">
        <span className="landing__brand">Logex</span>
        <div className="landing__header-actions">
          <LangToggle />
          <button
            className="landing__theme-toggle"
            onClick={toggleTheme}
            type="button"
            aria-label={theme === 'dark' ? t('landing.themeToLight') : t('landing.themeToDark')}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      {signedOut && (
        <div className="landing__flash" role="status" aria-live="polite">
          {t('landing.signedOut')}
        </div>
      )}

      <main className="landing__hero">
        <h1 className="landing__title">
          {t('landing.title1')}<br />
          {t('landing.title2')}
        </h1>
        <p className="landing__subtitle">
          {t('landing.subtitle')}
        </p>

        <div className="landing__stats">
          <div className="landing__stat">
            <span className="landing__stat-number">{t('landing.stat.tokensNumber')}</span>
            <span className="landing__stat-label">{t('landing.stat.tokensLabel')}</span>
          </div>
          <div className="landing__stat">
            <span className="landing__stat-number">{t('landing.stat.computeNumber')}</span>
            <span className="landing__stat-label">{t('landing.stat.computeLabel')}</span>
          </div>
          <div className="landing__stat">
            <span className="landing__stat-number">{t('landing.stat.toolsNumber')}</span>
            <span className="landing__stat-label">{t('landing.stat.toolsLabel')}</span>
          </div>
        </div>

        <button className="landing__cta" onClick={onLogin} type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          {t('landing.login')}
        </button>

        <a
          className="landing__sample-link"
          href="https://logex.vercel.app/articles/2026-04-15-opc-spec-to-code"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('landing.sample')}
        </a>

        <p className="landing__note">
          {t('landing.note')}
        </p>
      </main>

      <footer className="landing__footer">
        <div className="landing__features">
          <div className="landing__feature">
            <h2>{t('landing.feature1.title')}</h2>
            <p>{t('landing.feature1.body')}</p>
          </div>
          <div className="landing__feature">
            <h2>{t('landing.feature2.title')}</h2>
            <p>{t('landing.feature2.body')}</p>
          </div>
          <div className="landing__feature">
            <h2>{t('landing.feature3.title')}</h2>
            <p>{t('landing.feature3.body')}</p>
          </div>
        </div>
        <div className="landing__meta">
          <a
            className="landing__meta-link"
            href="https://github.com/iamtouchskyer/logex"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <span className="landing__meta-sep">·</span>
          <a
            className="landing__meta-link"
            href="https://www.npmjs.com/package/@touchskyer/logex"
            target="_blank"
            rel="noopener noreferrer"
          >
            npm
          </a>
          <span className="landing__meta-sep">·</span>
          <span className="landing__meta-text">MIT · made by touchskyer</span>
        </div>
      </footer>
    </div>
  )
}
