import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { lazy, Suspense, useRef } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useTypewriter } from '../../hooks/useTypewriter'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { Reveal } from '../../motion/Reveal'
import { NearViewport } from '../NearViewport'

const ChromeBust = lazy(() =>
  import('./ChromeBust').then((m) => ({ default: m.ChromeBust })),
)

const HEADLINE = 'Try the fit.\nBefore it ships.'

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { displayed, done } = useTypewriter(HEADLINE, { instant: !!reduced })

  // Progress across the hero's own exit, not the whole page: 0 while it fills
  // the viewport, 1 once it has scrolled entirely past the top.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  })

  // Two layers leaving at two speeds over the fixed sky: the copy lifts out,
  // and the chrome figure -- the nearest object -- travels furthest, which is
  // what sells the depth.
  const depth = reduced ? 0 : isDesktop ? 1 : 0.45
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -70 * depth])
  const figureY = useTransform(scrollYProgress, [0, 1], [0, -150 * depth])
  const copyOpacity = useTransform(scrollYProgress, [0, 0.72], [1, reduced ? 1 : 0])

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-svh flex-col justify-center overflow-hidden"
    >
      {/* Below lg the copy and the figure share two columns, so the figure is
          sized to its column and never sits under the text. Only below 340px,
          where a column would be unreadably narrow, do they stack. From lg up
          the figure spans the whole hero behind the copy, crown near the top
          and body running off the bottom edge, its arms free to pass under
          the text. */}
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-2 px-4 pt-24 pb-12 max-[339px]:grid-cols-1 max-[339px]:gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-6 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:py-24">
        <motion.div
          style={{ y: copyY, opacity: copyOpacity }}
          className="relative z-10"
        >
          {/* The untyped remainder stays in the flow, invisible, so the block
              is its full height and wraps the same from the first character:
              nothing below the headline shifts while it types. The cursor is
              zero-width for the same reason. */}
          <h1
            aria-label={HEADLINE.replace('\n', ' ')}
            className="display whitespace-pre-line text-[clamp(1.375rem,5.5vw,3.5rem)] text-fg drop-shadow-sm lg:text-[clamp(2.75rem,6.5vw,5.5rem)]"
          >
            <span aria-hidden="true">
              {displayed}
              {!done && (
                <span className="relative inline-block h-[0.9em] w-0 align-middle">
                  <span className="animate-blink absolute inset-y-0 left-[2px] w-[3px] bg-fg" />
                </span>
              )}
              <span className="invisible">{HEADLINE.slice(displayed.length)}</span>
            </span>
          </h1>
          <Reveal delay={0.26}>
            <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-fg drop-shadow-sm sm:mt-6 sm:text-base lg:text-lg">
              Preview how a garment sits on your own body, right in the
              browser. No headset, no kiosk, just the camera you already have.
            </p>
          </Reveal>
          <Reveal delay={0.44}>
            <p className="mt-4 max-w-xl text-[11px] text-fg-muted drop-shadow-sm sm:mt-8 sm:text-xs lg:text-sm">
              Built as a Bachelor of Science in Information Technology capstone
              project. Currently a working prototype, not a live storefront.
            </p>
          </Reveal>
        </motion.div>

        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.96 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: DURATION.entrance, ease: EASE_OUT, delay: 0.3 }}
          // On desktop it runs 160px past the hero's bottom (clipped by the
          // section) so the full 150px lift never exposes its edge.
          style={{ y: reduced ? undefined : figureY }}
          className="relative h-[clamp(20rem,58svh,34rem)] w-full sm:h-[clamp(24rem,64svh,40rem)] lg:absolute lg:inset-x-0 lg:top-0 lg:-bottom-40 lg:h-auto"
        >
          {/* Sits behind the head and travels with the figure. */}
          <div
            aria-hidden="true"
            className="hero-halo absolute top-[30%] left-1/2 size-[min(90vw,680px)] -translate-x-1/2 -translate-y-1/2 lg:left-[65%]"
          />
          {/* three.js is only fetched for this figure, so it is split out of
              the main bundle; the box above holds the space while it loads. */}
          <NearViewport className="relative h-full w-full">
            <Suspense fallback={null}>
              {/* The hero ends mid-chest on the same sky the next section
                  continues on, so the figure fades out before that edge rather
                  than being sliced by it. */}
              <ChromeBust className="relative h-full w-full mask-[linear-gradient(to_bottom,black_62%,transparent_84%)]" />
            </Suspense>
          </NearViewport>
        </motion.div>
      </div>
    </section>
  )
}
