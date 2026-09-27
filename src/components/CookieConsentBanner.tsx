import { Link } from 'react-router-dom'
import { useCookieConsent } from '../contexts/CookieConsentContext'

export function CookieConsentBanner() {
  const { status, accept, reject } = useCookieConsent()

  if (status !== null) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 px-4">
      <div
        role="region"
        aria-label="Cookie notice"
        className="glass glass-float mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="max-w-xl text-sm leading-relaxed text-ink/80 dark:text-bone/80">
          We store your theme and cookie choice in your browser. No
          analytics or advertising cookies are set. See the{' '}
          <Link
            to="/cookie-policy"
            className="underline decoration-bronze decoration-2 underline-offset-2 hover:text-bronze dark:hover:text-bronze-light"
          >
            cookie policy
          </Link>{' '}
          for details.
        </p>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={reject}
            className="btn-lift glass glass-btn font-ui rounded-full px-4 py-2 text-sm font-semibold text-ink hover:text-bronze dark:text-bone dark:hover:text-bronze-light"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={accept}
            className="btn-lift font-ui rounded-full border-2 border-ink bg-ink px-4 py-2 text-sm font-semibold text-bone hover:border-bronze hover:bg-bronze dark:border-bone dark:bg-bone dark:text-ink dark:hover:border-bronze-light dark:hover:bg-bronze-light"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
