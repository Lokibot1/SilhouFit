import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// three.js is fetched for the rack only on this page.
const ClothingRack = lazy(() =>
  import('../components/ClothingRack').then((m) => ({ default: m.ClothingRack })),
)

export function NotFoundPage() {
  useDocumentTitle('404: Out of stock, out of orbit — SilhouFit')

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

        {/* The rail runs wider than the screen, drifting like it was cut loose.
            --w is the rail's width and --h its box, capped to a share of the
            viewport height so the whole scene fits one screen. The canvas is
            shifted up so the rail sits near the top of the box and the
            garments fill the rest. It sways when the cursor brushes it, so
            say so. */}
        <div
          aria-hidden="true"
          className="pointer-events-none relative h-(--h) shrink-0 overflow-hidden [--w:250vw] [--h:min(calc(var(--w)*0.15),38svh)] mask-[linear-gradient(to_bottom,black_65%,transparent_100%)] sm:[--w:140vw] lg:[--w:130vw] [@media(max-height:480px)]:[--h:18svh]"
        >
          <div className="rack-drift absolute top-[calc(var(--h)*0.2-var(--w)*0.0933)] left-1/2 w-(--w) -translate-x-1/2">
            <Suspense fallback={null}>
              <ClothingRack className="aspect-[4.5/1] w-full" />
            </Suspense>
          </div>
        </div>
        <p className="font-ui absolute right-6 bottom-6 z-10 hidden text-xs tracking-[0.16em] text-fg-muted uppercase [@media(pointer:fine)]:block">
          Psst. Give the rack a nudge.
        </p>
      </section>
    </>
  )
}
