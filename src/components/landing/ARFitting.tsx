import {
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'motion/react'
import { lazy, Suspense, useRef, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { Reveal, RevealWords } from '../../motion/Reveal'
import { SPRING } from '../../motion/tokens'
import { ARPipeline } from './ARPipeline'

// three.js is fetched for the fitting view on its own, off the main bundle.
const ARAcquisition = lazy(() =>
  import('./ARAcquisition').then((m) => ({ default: m.ARAcquisition })),
)

const STAGE_CAPTIONS = [
  'The camera finds the body and pulls focus.',
  'Pose tracking locks onto the joints it needs.',
  'The scaled garment renders over the video.',
]

export function ARFitting() {
  const sectionRef = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const canPin = useMediaQuery('(min-width: 1024px)')
  const isPinned = !reduced && canPin

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  })
  const scrubbed = useSpring(scrollYProgress, SPRING.scrub)
  // Held at the end of the sequence, so the unpinned page shows the fully
  // acquired figure rather than an empty frame waiting for a scroll that will
  // never drive it. Same JSX, no second static copy of the diagram.
  const settled = useMotionValue(1)
  const progress = isPinned ? scrubbed : settled

  const [stage, setStage] = useState(isPinned ? 0 : 2)
  useMotionValueEvent(progress, 'change', (value) => {
    setStage(value < 0.3 ? 0 : value < 0.62 ? 1 : 2)
  })

  return (
    <section
      id="ar-fitting"
      ref={sectionRef}
      className={
        isPinned
          ? 'relative h-[260svh] scroll-mt-28'
          : 'relative scroll-mt-28'
      }
    >
      <div
        className={
          isPinned
            ? 'sticky top-0 flex h-svh items-center'
            : 'relative'
        }
      >
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-16 px-6 py-24 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <div className="glass-panel rounded-2xl p-8">
              <ARPipeline activeIndex={stage} />
              <div className="mt-8 border-t border-line pt-8">
                <Suspense fallback={<div className="h-72 sm:h-80" />}>
                  <ARAcquisition progress={progress} />
                </Suspense>
              </div>
              <p
                className="font-ui mt-6 min-h-[2.5rem] text-center text-sm text-fg/60"
                aria-live="off"
              >
                {STAGE_CAPTIONS[stage]}
              </p>
            </div>
          </div>

          {/* Deliberately stationary while the figure is acquired beside it.
              The prose is the claim; the diagram is the evidence moving. */}
          <div className="glass-panel order-1 max-w-xl rounded-2xl p-8 lg:order-2">
            <h2 className="display text-[clamp(1.75rem,4vw,3rem)] text-fg">
              <RevealWords text="One camera is enough." />
            </h2>
            <Reveal delay={0.18}>
              <p className="mt-6 text-base leading-relaxed text-fg-muted">
                The fitting module runs entirely in the browser. Pose tracking
                reads body landmarks from the camera feed on the shopper&apos;s
                own device, and a scaled 3D garment model renders over the video
                in real time. The same code path works on a laptop&apos;s
                built-in camera, a desktop with a webcam, or a larger screen with
                a webcam attached.
              </p>
            </Reveal>
            <Reveal delay={0.26}>
              <p className="mt-4 text-base leading-relaxed text-fg-muted">
                No dedicated kiosk hardware, headset, or app install. Trying the
                fitting module on a shopper&apos;s own phone at home is under
                consideration for a later version and is not part of the current
                build.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
