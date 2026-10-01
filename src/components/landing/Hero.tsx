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
      className="relative flex min-h-svh flex-col overflow-hidden lg:flex-row lg:items-center"
    >
      {/* The figure spans the whole hero behind the copy, crown near the top
          and body running off the bottom edge, its arms free to pass under
          the text. Below lg it drops under the copy instead, where a phone's
          narrow column would leave the text sitting on chrome. */}
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.96 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: DURATION.entrance, ease: EASE_OUT, delay: 0.3 }}
        // In flow below lg, lifting the canvas would open a gap under it; on
        // desktop it runs 160px past the hero's bottom (clipped by the section)
        // so the full 150px lift never exposes its edge.
        style={{ y: reduced || !isDesktop ? undefined : figureY }}
        className="relative order-last h-[70svh] w-full lg:absolute lg:inset-x-0 lg:top-0 lg:-bottom-40 lg:order-none lg:h-auto"
      >
        {/* three.js is only fetched for this figure, so it is split out of
            the main bundle; the box above holds the space while it loads. */}
        {/* Sits behind the head and travels with the figure. */}
        <div
          aria-hidden="true"
          className="hero-halo absolute top-[30%] left-1/2 size-[min(90vw,680px)] -translate-x-1/2 -translate-y-1/2 lg:left-[65%]"
        />
        <NearViewport className="relative h-full w-full">
          <Suspense fallback={null}>
            {/* The hero ends mid-chest on the same sky the next section
                continues on, so the figure fades out before that edge rather
                than being sliced by it. */}
            <ChromeBust className="relative h-full w-full mask-[linear-gradient(to_bottom,black_62%,transparent_84%)]" />
          </Suspense>
        </NearViewport>
      </motion.div>

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-16 px-6 py-24 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div style={{ y: copyY, opacity: copyOpacity }}>
          {/* The untyped remainder stays in the flow, invisible, so the block
              is its full height and wraps the same from the first character:
              nothing below the headline shifts while it types. The cursor is
              zero-width for the same reason. */}
          <h1
            aria-label={HEADLINE.replace('\n', ' ')}
            className="display whitespace-pre-line text-[clamp(2.75rem,6.5vw,5.5rem)] text-fg drop-shadow-sm"
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
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg drop-shadow-sm">
              Preview how a garment sits on your own body, right in the
              browser. No headset, no kiosk, just the camera you already have.
            </p>
          </Reveal>
          <Reveal delay={0.44}>
            <p className="mt-8 max-w-xl text-sm text-fg-muted drop-shadow-sm">
              Built as a Bachelor of Science in Information Technology capstone
              project. Currently a working prototype, not a live storefront.
            </p>
          </Reveal>
        </motion.div>
      </div>
    </section>
  )
}
