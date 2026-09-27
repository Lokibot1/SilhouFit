import { Link } from 'react-router-dom'
import { useCookieConsent } from '../contexts/CookieConsentContext'

export function CookieConsentBanner() {
  const { status, accept, reject } = useCookieConsent()

  if (status !== null) return null

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="glass fixed inset-x-0 bottom-0 z-50 border-t"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm leading-relaxed text-ink/80 dark:text-bone/80">
          We store your theme and cookie choice in your browser. No
          analytics or advertising cookies are set. See the{' '}
          <Link
            to="/cookie-policy"
            className="underline decoration-garnet decoration-2 underline-offset-2 hover:text-garnet dark:hover:text-garnet-light"
          >
            cookie policy
          </Link>{' '}
          for details.
        </p>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={reject}
            className="rounded-sm border-2 border-ink px-4 py-2 text-sm font-semibold text-ink hover:border-garnet hover:text-garnet dark:border-bone dark:text-bone dark:hover:border-garnet-light dark:hover:text-garnet-light"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={accept}
            className="rounded-sm border-2 border-ink bg-ink px-4 py-2 text-sm font-semibold text-bone hover:border-garnet hover:bg-garnet dark:border-bone dark:bg-bone dark:text-ink dark:hover:border-garnet-light dark:hover:bg-garnet-light"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
