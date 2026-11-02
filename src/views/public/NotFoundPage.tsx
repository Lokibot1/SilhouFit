import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'This SilhouFit page could not be found. It may have moved or sold out, so head back to the shop or the main floor to keep browsing the full catalogue.'

export function NotFoundPage() {
  useDocumentTitle('404: Out of stock, out of orbit — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  return (
    <>
      <section className="relative flex h-svh flex-col overflow-hidden">
        <div className="relative z-10 flex min-h-0 flex-1 items-center px-6">
          <div className="mx-auto w-full max-w-6xl">
            <div className="max-w-3xl">
              <p className="font-mono text-xs tracking-[0.2em] text-chrome-strong uppercase sm:text-sm">
                Error <span className="tabular-nums">404</span> · Size not found
              </p>
              <h1 className="display mt-[min(1rem,2svh)] text-[clamp(2rem,min(7vw,9svh),5.5rem)] text-fg">
                404: Out of stock, out of&nbsp;orbit.
              </h1>
              <p className="mt-[min(1.5rem,3svh)] max-w-md text-sm leading-relaxed text-fg-muted sm:text-base">
                This page slid off the rail somewhere past the last fitting room.
                Check the link, or head back to the main floor.
              </p>
              <Link
                to="/"
                className="btn-lift font-ui mt-[min(2.5rem,4svh)] inline-block min-h-11 rounded-full border-2 border-fg bg-fg px-8 py-3 text-sm font-semibold text-canvas hover:border-chrome-strong hover:bg-chrome-strong"
              >
                Back to the main floor
              </Link>
            </div>
          </div>
        </div>

      </section>
    </>
  )
}
