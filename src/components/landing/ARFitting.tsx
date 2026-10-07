import {
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'motion/react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { Reveal, RevealWords } from '../../motion/Reveal'
import { SPRING } from '../../motion/tokens'
import { NearViewport } from '../NearViewport'
import { ARPipeline } from './ARPipeline'

// three.js is fetched for the fitting view on its own, off the main bundle.
const ARAcquisition = lazy(() =>
  import('./ARAcquisition').then((m) => ({ default: m.ARAcquisition })),
)

const PIN_TOP = 96

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

  // Below the pin breakpoint only the diagram is held: a sticky panel in a tall wrapper.
  const pinnedSmall = !reduced && !canPin
  const diagramRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Measured live: useScroll's cached offsets go stale when images above finish loading.
  const diagramProgress = useMotionValue(0)
  useEffect(() => {
    if (!pinnedSmall) return
    const update = () => {
      const wrapper = diagramRef.current?.getBoundingClientRect()
      const panel = panelRef.current
      if (!wrapper || !panel) return
      const travel = wrapper.height - panel.offsetHeight
      diagramProgress.set(
        Math.min(1, Math.max(0, (PIN_TOP - wrapper.top) / travel)),
      )
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [pinnedSmall, diagramProgress])
  const scrubbedDiagram = useSpring(diagramProgress, SPRING.scrub)

  // Reduced motion holds the end of the sequence so the acquired figure shows.
  const settled = useMotionValue(1)
  const progress = reduced ? settled : isPinned ? scrubbed : scrubbedDiagram

  const [stage, setStage] = useState(reduced ? 2 : 0)
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
          <div
            ref={diagramRef}
            className={`order-2 lg:order-1 ${pinnedSmall ? 'h-[220svh] lg:h-auto' : ''}`}
          >
            <div ref={panelRef} className={pinnedSmall ? 'sticky top-24' : ''}>
            <div className="glass-card glass-elevated rounded-2xl p-5 sm:p-8">
              <ARPipeline activeIndex={stage} />
              <div className="mt-8 border-t border-line pt-8">
                <NearViewport className="h-72 sm:h-80">
                  <Suspense fallback={null}>
                    <ARAcquisition progress={progress} />
                  </Suspense>
                </NearViewport>
              </div>
              <p
                className="font-ui mt-6 min-h-[2.5rem] text-center text-sm text-fg/60"
                aria-live="off"
              >
                {STAGE_CAPTIONS[stage]}
              </p>
            </div>
            </div>
          </div>

          <div className="glass-card order-1 max-w-xl rounded-2xl p-5 sm:p-8 lg:order-2">
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
