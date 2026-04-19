import { useEffect, useRef } from 'react'

/**
 * Public landing shown after a successful logout. Intentionally NOT gated by
 * auth — the router lists `/logged-out` alongside `/share/:id` as a public
 * route. Without this landing, a logged-out user would be instantly bounced
 * to `/api/auth/login`, and GitHub — still holding an authorization — would
 * silently round-trip a new OAuth code, making logout a no-op from the user's
 * perspective.
 */
export function LoggedOutPage() {
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Focus the primary action for keyboard users (WCAG 2.4.3).
    btnRef.current?.focus()
  }, [])

  const onLogin = () => {
    window.location.href = '/api/auth/login'
  }

  return (
    <div className="app">
      <main
        className="main"
        id="main-content"
        role="main"
        aria-labelledby="logged-out-title"
      >
        <div className="state-message">
          <h1 id="logged-out-title" className="state-message__title">
            你已登出 / Signed out
          </h1>
          <p className="state-message__subtitle">
            Your session on logex-io has ended.
          </p>
          <button
            ref={btnRef}
            type="button"
            className="state-message__action"
            onClick={onLogin}
          >
            Log in with GitHub
          </button>
        </div>
      </main>
    </div>
  )
}

export default LoggedOutPage
