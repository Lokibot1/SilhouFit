import { useState } from 'react'
import { BagIcon, RestoreIcon } from '../../components/form/icons'
import { KralErrorScreen } from '../../components/KralErrorScreen'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { checkHealth } from '../../service/checkHealth'

const META_DESCRIPTION =
  'Something went wrong on our side while loading this SilhouFit page. Try again in a moment, or go back to the home page to keep shopping with us today.'

// Self-contained on purpose: this also renders when the app has crashed, so it uses plain anchors and
// the shared screen's own background and logo instead of the router, the site header or the Layout.
export function ServerErrorPage({ onRetry = () => window.location.reload() }: { onRetry?: () => void }) {
  useDocumentTitle('Something broke — SilhouFit')
  useMetaDescription(META_DESCRIPTION)
  const [status, setStatus] = useState<'idle' | 'checking' | 'up' | 'down'>('idle')

  async function check() {
    setStatus('checking')
    setStatus((await checkHealth()) ? 'up' : 'down')
  }

  return (
    <>
      <KralErrorScreen code="500" status="Something broke" heading="Our side. Not yours." alert>
        <p className="mt-3 max-w-md text-base leading-relaxed text-kral-muted">
          This page failed to load. Try again in a moment, or go back to the home page.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={onRetry} className={KRAL_PRIMARY}>
            <RestoreIcon size={16} />
            Try again
          </button>
          <a href="/" className={KRAL_SECONDARY}>
            <BagIcon size={16} />
            Go home
          </a>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void check()}
            disabled={status === 'checking'}
            className="kral-focus min-h-11 cursor-pointer text-base text-kral-muted underline decoration-kral-rule decoration-2 underline-offset-4 hover:text-kral-fg disabled:cursor-wait disabled:opacity-60 md:text-sm"
          >
            {status === 'checking' ? 'Checking…' : status === 'down' ? 'Check again' : 'Check service status'}
          </button>
          <p role="status" className="text-base text-kral-muted md:text-sm">
            {status === 'up' && 'The service is reachable. Try the page again.'}
            {status === 'down' && "The service can't be reached right now. Wait a moment, then check again."}
          </p>
        </div>
      </KralErrorScreen>
    </>
  )
}
