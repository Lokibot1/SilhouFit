import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react'
import { useRef } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { Reveal } from '../../motion/Reveal'
import { SPRING } from '../../motion/tokens'
import { DashboardMock } from './DashboardMock'

export function ForBoutiques() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  })
  const scrubbed = useSpring(scrollYProgress, SPRING.scrub)
  const settled = useMotionValue(1)
  const progress = reduced ? settled : scrubbed

  const drift = reduced ? 0 : isDesktop ? 28 : 12
  const copyY = useTransform(scrubbed, [0, 1], [drift, -drift])
  const panelY = useTransform(scrubbed, [0, 1], [-drift * 1.6, drift * 1.6])

  return (
    <section id="boutiques" className="relative scroll-mt-28">
      <div
        ref={sectionRef}
        className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-24 lg:grid-cols-2"
      >
        <motion.div
          style={{ y: copyY }}
          className="glass-card glass-elevated max-w-xl rounded-2xl p-8"
        >
          <h2 className="display text-[clamp(1.75rem,4vw,3rem)] text-fg">
            <Reveal as="span">A dashboard for the owner, not just the shopper</Reveal>
          </h2>
          <Reveal delay={0.14}>
            <p className="mt-6 text-base leading-relaxed text-fg-muted">
              The admin side surfaces sales performance, inventory turnover,
              and revenue trends from the storefront. It also tracks how
              often a virtual fitting session leads to a purchase, so a store
              can see whether the AR module is doing its job.
            </p>
          </Reveal>
          <Reveal delay={0.22}>
            <p className="mt-4 text-base leading-relaxed text-fg-muted">
              The system is being evaluated against the ISO 25010 quality
              model with boutique managers and shoppers, covering
              functionality, usability, and reliability.
            </p>
          </Reveal>
        </motion.div>

        <motion.div
          style={{ y: panelY }}
          className="glass-card mx-auto w-full max-w-sm rounded-2xl p-8"
        >
          <DashboardMock progress={progress} />
        </motion.div>
      </div>
    </section>
  )
}
