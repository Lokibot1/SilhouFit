import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { checkHealth } from '../../service/checkHealth'

const META_DESCRIPTION =
  'Something went wrong on our side while loading this SilhouFit page. Try again in a moment, or head back to the main floor to keep shopping.'

export function ServerErrorPage({ onRetry = () => window.location.reload() }: { onRetry?: () => void }) {
  useDocumentTitle('500: Torn at the seams — SilhouFit')
  useMetaDescription(META_DESCRIPTION)
  const [status, setStatus] = useState<'idle' | 'checking' | 'up' | 'down'>('idle')

  async function check() {
    setStatus('checking')
    setStatus((await checkHealth()) ? 'up' : 'down')
  }

  return (
    <>
      <section className="relative flex h-svh flex-col overflow-hidden">
        <div className="relative z-10 flex min-h-0 flex-1 items-center px-6">
          <div className="mx-auto w-full max-w-6xl">
            <div className="max-w-3xl">
              <p className="font-mono text-xs tracking-[0.2em] text-chrome-strong uppercase sm:text-sm">
                Error <span className="tabular-nums">500</span> · Seam split
              </p>
              <h1 className="display mt-[min(1rem,2svh)] text-[clamp(2rem,min(7vw,9svh),5.5rem)] text-fg">
                500: Torn at the&nbsp;seams.
              </h1>
              <p className="mt-[min(1.5rem,3svh)] max-w-md text-sm leading-relaxed text-fg-muted sm:text-base">
                Something broke on our side while pinning this page together. It
                wasn&apos;t you. Try again, or head back to the main floor.
              </p>
              <div className="mt-[min(2.5rem,4svh)] flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onRetry}
                  className="btn-lift font-ui inline-block min-h-11 cursor-pointer rounded-full border-2 border-fg bg-fg px-8 py-3 text-sm font-semibold text-canvas hover:border-chrome-strong hover:bg-chrome-strong"
                >
                  Try again
                </button>
                <Link
                  to="/"
                  className="btn-lift font-ui inline-block min-h-11 rounded-full border-2 border-fg px-8 py-3 text-sm font-semibold text-fg hover:border-chrome-strong hover:text-chrome-strong"
                >
                  Back to the main floor
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void check()}
                  disabled={status === 'checking'}
                  className="font-ui min-h-11 cursor-pointer rounded-full border-2 border-fg-muted px-6 py-2 text-sm font-semibold text-fg-muted hover:border-fg hover:text-fg disabled:cursor-wait disabled:opacity-60"
                >
                  {status === 'checking' ? 'Checking…' : status === 'down' ? 'Check again' : 'Check service status'}
                </button>
                <p role="status" className="text-sm text-fg-muted">
                  {status === 'up' && 'The service is reachable. Try the page again.'}
                  {status === 'down' && "The service can't be reached right now. Wait a moment, then check again."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
