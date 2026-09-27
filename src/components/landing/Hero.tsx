import { useMouseParallax } from '../../hooks/useMouseParallax'
import { useParallax } from '../../hooks/useParallax'
import { useTilt } from '../../hooks/useTilt'
import { SilhouetteMark } from './SilhouetteMark'

export function Hero() {
  const tilt = useTilt<HTMLDivElement>(5)
  const scrollLayer = useParallax<HTMLDivElement>(0.12, 0.1)
  const mouse = useMouseParallax<HTMLDivElement>(18)

  return (
    <section
      className="relative flex min-h-svh items-center overflow-hidden"
      onMouseMove={mouse.handleMouseMove}
      onMouseLeave={mouse.handleMouseLeave}
    >
      <div
        ref={scrollLayer}
        aria-hidden="true"
        className="absolute inset-[-8%] will-change-transform"
      >
        <div
          ref={mouse.ref}
          className="hero-parallax-image h-full w-full transition-transform duration-300 ease-out"
        >
          <img
            src="/images/hero-fitting-room.jpg"
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      </div>
      <div className="absolute inset-0 bg-bone/40 dark:bg-ink/60" />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-16 px-6 py-24 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h1 className="hero-rise display text-[clamp(2.75rem,6.5vw,5.5rem)] text-ink drop-shadow-sm dark:text-bone">
            Try the fit.
            <br />
            Before it ships.
          </h1>
          <p
            className="hero-rise mt-6 max-w-xl text-lg leading-relaxed text-ink/80 drop-shadow-sm dark:text-bone/85"
            style={{ animationDelay: '90ms' }}
          >
            Preview how a garment sits on your own body, right in the
            browser. No headset, no kiosk, just the camera you already have.
          </p>
          <div
            className="hero-rise mt-10 flex flex-wrap items-center gap-4"
            style={{ animationDelay: '180ms' }}
          >
            <a
              href="/#ar-fitting"
              className="btn-lift font-ui rounded-full border-2 border-ink bg-ink px-6 py-3 text-sm font-semibold text-bone hover:border-bronze hover:bg-bronze dark:border-bone dark:bg-bone dark:text-ink dark:hover:border-bronze-light dark:hover:bg-bronze-light"
            >
              See the AR fitting flow
            </a>
            <a
              href="/#boutiques"
              className="btn-lift glass glass-btn font-ui rounded-full px-6 py-3 text-sm font-semibold text-ink hover:text-bronze dark:text-bone dark:hover:text-bronze-light"
            >
              For boutique owners
            </a>
          </div>
          <p
            className="hero-rise mt-8 max-w-xl text-sm text-ink/70 drop-shadow-sm dark:text-bone/70"
            style={{ animationDelay: '260ms' }}
          >
            Built as a Bachelor of Science in Information Technology capstone
            project. Currently a working prototype, not a live storefront.
          </p>
        </div>

        <div
          className="hero-rise relative mx-auto w-full max-w-sm justify-self-center [perspective:1000px] lg:justify-self-end"
          style={{ animationDelay: '200ms' }}
          onMouseMove={tilt.handleMouseMove}
          onMouseLeave={tilt.handleMouseLeave}
        >
          <div
            ref={tilt.ref}
            className="glass glass-float rounded-2xl p-6 transition-transform duration-300 ease-out"
          >
            <div className="flex items-center justify-between border-b border-ink/10 pb-4 dark:border-white/10">
              <span className="font-ui text-sm font-semibold text-ink dark:text-bone">
                Fitting preview
              </span>
              <span className="glass-chip font-ui rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-medium text-ink/70 dark:border-white/20 dark:bg-white/5 dark:text-bone/70">
                Camera on
              </span>
            </div>
            <SilhouetteMark className="mx-auto mt-4 h-56 w-44 text-ink/70 dark:text-bone/70" />
            <div className="mt-4 flex gap-3">
              <span className="glass-chip font-ui rounded-full border border-ink/15 bg-ink/5 px-3 py-1.5 text-sm font-medium text-ink/80 dark:border-white/15 dark:bg-white/5 dark:text-bone/80">
                Size M
              </span>
              <span className="glass-chip font-ui rounded-full border border-ink/15 bg-ink/5 px-3 py-1.5 text-sm font-medium text-ink/80 dark:border-white/15 dark:bg-white/5 dark:text-bone/80">
                Regular fit
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
