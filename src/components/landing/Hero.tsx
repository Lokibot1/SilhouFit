import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useRef } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useMouseParallax } from '../../hooks/useMouseParallax'
import { useTilt } from '../../hooks/useTilt'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { Reveal } from '../../motion/Reveal'
import { SilhouetteMark } from './SilhouetteMark'

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null)
  const tilt = useTilt<HTMLDivElement>(5)
  const mouse = useMouseParallax<HTMLDivElement>(18)
  const reduced = useReducedMotion()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // Progress across the hero's own exit, not the whole page: 0 while it fills
  // the viewport, 1 once it has scrolled entirely past the top.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  })

  // Three layers leaving at three speeds. The room pushes in, the copy lifts
  // out ahead of it, and the fitting card -- the nearest object -- travels
  // furthest, which is what sells the depth.
  const depth = reduced ? 0 : isDesktop ? 1 : 0.45
  const roomScale = useTransform(scrollYProgress, [0, 1], [1, 1 + 0.14 * depth])
  // Not the scrim's own opacity -- that is already at 1 and CSS clamps it. A
  // separate veil in the *next* section's surface colour fades up instead, so
  // the hero dissolves into Capabilities rather than sliding off it.
  const veilOpacity = useTransform(scrollYProgress, [0.25, 1], [0, reduced ? 0 : 0.6])
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -70 * depth])
  const cardY = useTransform(scrollYProgress, [0, 1], [0, -150 * depth])
  const copyOpacity = useTransform(scrollYProgress, [0, 0.72], [1, reduced ? 1 : 0])

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-svh items-center overflow-hidden"
      onMouseMove={mouse.handleMouseMove}
      onMouseLeave={mouse.handleMouseLeave}
    >
      <motion.div
        aria-hidden="true"
        style={{ scale: roomScale }}
        className="absolute inset-[-8%] will-change-transform"
      >
        <div
          ref={mouse.ref}
          className="hero-parallax-image h-full w-full transition-transform duration-300 ease-out"
        >
          <img
            src="/images/hero-fitting-room.jpg"
            alt=""
            className="photo-mono h-full w-full object-cover"
          />
        </div>
      </motion.div>
      <div
        aria-hidden="true"
        className="absolute inset-0 veil"
      />
      <motion.div
        aria-hidden="true"
        style={{ opacity: veilOpacity }}
        className="absolute inset-0 bg-canvas-sub"
      />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-16 px-6 py-24 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div style={{ y: copyY, opacity: copyOpacity }}>
          <h1 className="display text-[clamp(2.75rem,6.5vw,5.5rem)] text-fg drop-shadow-sm">
            {/* Line by line, so the measure passes over the claim twice rather
                than lifting both lines as one block. */}
            <Reveal as="span">Try the fit.</Reveal>
            <Reveal as="span" delay={0.12}>
              Before it ships.
            </Reveal>
          </h1>
          <Reveal delay={0.26}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg drop-shadow-sm">
              Preview how a garment sits on your own body, right in the
              browser. No headset, no kiosk, just the camera you already have.
            </p>
          </Reveal>
          <Reveal delay={0.36}>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href="/#ar-fitting"
                className="btn-lift font-ui rounded-full border-2 border-fg bg-fg px-6 py-3 text-sm font-semibold text-canvas hover:border-chrome-strong hover:bg-chrome-strong"
              >
                See the AR fitting flow
              </a>
              <a
                href="/#boutiques"
                className="btn-lift glass glass-btn font-ui rounded-full px-6 py-3 text-sm font-semibold text-fg hover:text-chrome-strong"
              >
                For boutique owners
              </a>
            </div>
          </Reveal>
          <Reveal delay={0.44}>
            <p className="mt-8 max-w-xl text-sm text-fg-muted drop-shadow-sm">
              Built as a Bachelor of Science in Information Technology capstone
              project. Currently a working prototype, not a live storefront.
            </p>
          </Reveal>
        </motion.div>

        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.96 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: DURATION.entrance, ease: EASE_OUT, delay: 0.3 }}
          style={{ y: reduced ? undefined : cardY }}
          className="relative mx-auto w-full max-w-sm justify-self-center [perspective:1000px] lg:justify-self-end"
          onMouseMove={tilt.handleMouseMove}
          onMouseLeave={tilt.handleMouseLeave}
        >
          <div
            ref={tilt.ref}
            className="glass-lens glass-float chrome-edge rounded-2xl p-6 transition-transform duration-300 ease-out"
          >
            <div className="flex items-center justify-between border-b border-line-strong pb-4">
              <span className="font-ui text-sm font-semibold text-fg">
                Fitting preview
              </span>
              <span className="glass-chip font-ui rounded-full border border-line-strong bg-canvas/60 px-3 py-1 text-xs font-medium text-fg">
                Camera on
              </span>
            </div>
            <SilhouetteMark className="mx-auto mt-4 h-56 w-44 text-fg-muted [filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.35))]" />
            <div className="mt-4 flex gap-3">
              <span className="glass-chip font-ui rounded-full border border-line-strong bg-canvas/60 px-3 py-1.5 text-sm font-medium text-fg">
                Size M
              </span>
              <span className="glass-chip font-ui rounded-full border border-line-strong bg-canvas/60 px-3 py-1.5 text-sm font-medium text-fg">
                Regular fit
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
