import { lazy, Suspense } from 'react'
import { Reveal } from '../../motion/Reveal'
import { NearViewport } from '../NearViewport'

// The hero's figure, fetched with three.js only when this section renders.
const ChromeBust = lazy(() =>
  import('./ChromeBust').then((m) => ({ default: m.ChromeBust })),
)

export function Contact() {
  return (
    <section id="contact" className="relative scroll-mt-28">
      <div className="relative mx-auto max-w-6xl px-6 py-24 lg:pt-60">
        <div className="relative">
          <div className="glass-card glass-elevated rounded-2xl px-8 py-12 sm:px-12">
            <div className="max-w-xl">
              <Reveal>
                <h2 className="display text-[clamp(2rem,4.5vw,3.75rem)] text-fg">
                  Reach out
                </h2>
              </Reveal>
              <p className="mt-6 text-base leading-relaxed text-fg-muted">
                This project is being built as a capstone for a Bachelor of
                Science in Information Technology program at Quezon City
                University. If you run a local apparel boutique and want to
                see a walkthrough, or you have feedback on the AR fitting
                flow, send a message.
              </p>
              <a
                href="mailto:team@silhoufit.dev"
                className="btn-lift font-ui mt-8 inline-block rounded-full border-2 border-fg bg-fg px-6 py-3 text-sm font-semibold text-canvas hover:border-chrome-strong hover:bg-chrome-strong"
              >
                Email the team
              </a>
            </div>
          </div>
          {/* Paints above the card (later in the markup), fading out onto the glass. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-52 right-[3%] hidden h-[27.5rem] w-[30rem] lg:block"
          >
            <NearViewport className="h-full w-full">
              <Suspense fallback={null}>
                <ChromeBust className="h-full w-full mask-[radial-gradient(ellipse_50%_62%_at_50%_34%,black_62%,transparent_100%)]" />
              </Suspense>
            </NearViewport>
          </div>
        </div>
      </div>
    </section>
  )
}
