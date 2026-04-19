import type { ReactNode } from 'react'

interface EmptyOnboardingProps {
  login?: string
  /** Optional error message + retry callback for 4xx/5xx states other than REPO_NOT_FOUND. */
  error?: string
  onRetry?: () => void
}

interface Step { title: string; code: string }

/**
 * Rendered when `/api/articles/index` returns 404 REPO_NOT_FOUND, or any
 * other unrecoverable error. Shows copy-paste CLI steps to create the
 * user's `<login>/logex-data` repo and start writing.
 */
export function EmptyOnboarding({ login, error, onRetry }: EmptyOnboardingProps): ReactNode {
  const who = login ?? '<login>'
  const steps: Step[] = [
    { title: '1. Install the logex CLI', code: 'npm install -g @touchskyer/logex' },
    {
      title: '2. Create your public data repo',
      code: `mkdir ${who}/logex-data && cd logex-data && git init && echo '{"articles":[]}' > index.json && gh repo create ${who}/logex-data --public --source=. --push`,
    },
    { title: '3. Write your first session paper', code: 'logex write' },
  ]

  return (
    <div className="onboarding" role="region" aria-labelledby="onboarding-title">
      <h1 id="onboarding-title" className="onboarding__title">Get started with logex</h1>
      {error ? (
        <div className="onboarding__error" role="alert">
          <p>{error}</p>
          {onRetry ? (
            <button type="button" className="onboarding__retry" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        <p className="onboarding__intro">
          Your <code>{who}/logex-data</code> repo isn’t created yet. Run these
          three commands and refresh — that’s all logex needs.
        </p>
      )}
      <ol className="onboarding__steps">
        {steps.map((s) => (
          <li key={s.title} className="onboarding__step">
            <h2 className="onboarding__step-title">{s.title}</h2>
            <pre className="onboarding__code" tabIndex={0} aria-label={s.title}>
              <code>{s.code}</code>
            </pre>
          </li>
        ))}
      </ol>
    </div>
  )
}
