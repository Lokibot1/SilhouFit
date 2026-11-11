import { Link } from 'react-router-dom'
import { useCookieConsent } from '../contexts/CookieConsentContext'
import { useOnboarding } from '../hooks/useOnboarding'

export function CookieConsentBanner() {
  const { status, accept, reject } = useCookieConsent()
  const { phase } = useOnboarding()

  // Held back while the tour is open so the two never overlap; it returns afterwards if still unanswered.
  if (status !== null || phase !== null) return null

  return (
    <div
      // Publishes its height so a toast sits above it instead of over its text.
      ref={(el) => {
        if (!el) return
        const publish = () => document.documentElement.style.setProperty('--cookie-banner-h', `${el.offsetHeight}px`)
        publish()
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
        resize?.observe(el)
        return () => {
          resize?.disconnect()
          document.documentElement.style.removeProperty('--cookie-banner-h')
        }
      }}
      className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]"
    >
      <div
        role="region"
        aria-label="Cookie notice"
        className="mx-auto flex max-w-3xl flex-col gap-4 border border-kral-rule bg-kral-bg px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5"
      >
        <p className="font-kral-mono max-w-xl text-base leading-relaxed text-kral-muted md:text-sm">
          We store your theme and cookie choice in your browser. No
          analytics or advertising cookies are set. See the{' '}
          <Link
            to="/cookie-policy"
            className="kral-focus text-kral-fg underline decoration-kral-red-ink decoration-2 underline-offset-2 hover:decoration-kral-fg"
          >
            cookie policy
          </Link>{' '}
          for details.
        </p>
        <div className="flex shrink-0 gap-3 max-sm:*:flex-1">
          <button
            type="button"
            onClick={reject}
            className="tap kral-focus font-kral-mono min-h-11 justify-center border border-kral-fg px-4 py-2 text-base font-medium tracking-[0.08em] text-kral-fg uppercase transition-colors duration-150 ease-out hover:bg-kral-fg hover:text-kral-bg motion-reduce:transition-none md:text-sm"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={accept}
            className="tap kral-focus font-kral-mono min-h-11 justify-center border border-kral-red bg-kral-red px-4 py-2 text-base font-medium tracking-[0.08em] text-kral-paper uppercase transition-colors duration-150 ease-out hover:border-kral-red-press hover:bg-kral-red-press motion-reduce:transition-none md:text-sm"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
