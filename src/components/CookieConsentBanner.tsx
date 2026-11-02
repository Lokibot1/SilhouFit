import { Link } from 'react-router-dom'
import { useCookieConsent } from '../contexts/CookieConsentContext'
import { useOnboarding } from '../hooks/useOnboarding'

export function CookieConsentBanner() {
  const { status, accept, reject } = useCookieConsent()
  const { phase } = useOnboarding()

  // Held back while the tour is open so the two never overlap; it returns afterwards if still unanswered.
  if (status !== null || phase !== null) return null

  return (
    <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 px-4">
      <div
        role="region"
        aria-label="Cookie notice"
        className="glass-card glass-floating [--g-fill:0.72] mx-auto flex max-w-3xl flex-col gap-4 rounded-xl px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="max-w-xl text-sm leading-relaxed text-fg-muted">
          We store your theme and cookie choice in your browser. No
          analytics or advertising cookies are set. See the{' '}
          <Link
            to="/cookie-policy"
            className="underline decoration-chrome-strong decoration-2 underline-offset-2 hover:text-chrome-strong"
          >
            cookie policy
          </Link>{' '}
          for details.
        </p>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={reject}
            className="tap btn-lift justify-center bg-fg/5 hover:bg-fg/10 glass-btn font-ui rounded-full px-4 py-2 text-sm font-semibold text-fg hover:text-chrome-strong"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={accept}
            className="tap btn-lift justify-center font-ui rounded-full border-2 border-fg bg-fg px-4 py-2 text-sm font-semibold text-canvas hover:border-chrome-strong hover:bg-chrome-strong"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
