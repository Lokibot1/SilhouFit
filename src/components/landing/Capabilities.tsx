import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { Reveal } from '../../motion/Reveal'
import { SPRING } from '../../motion/tokens'

const CAPABILITIES = [
  {
    term: 'Inventory that stays accurate',
    detail:
      'Every sale updates the storefront stock immediately, so shoppers only see what is actually available.',
    span: 'lg:col-span-2',
    wide: true,
  },
  {
    term: 'A profile that remembers sizing',
    detail:
      'Purchase history, wishlist items, and sizing preferences are stored once and used everywhere the shopper appears.',
    span: 'lg:col-span-1',
    wide: false,
    image: '/images/measuring-tape.jpg',
  },
  {
    term: 'One cart, saved to your account',
    detail:
      'Add items online and check out for delivery. The cart follows the shopper across devices.',
    span: 'lg:col-span-1',
    wide: false,
  },
  {
    term: 'Garment models managed by staff',
    detail:
      'Boutique staff upload and scale 3D garment models from the admin dashboard and link them to the matching product listing, no separate 3D pipeline needed.',
    span: 'lg:col-span-2',
    wide: true,
  },
]

type Capability = (typeof CAPABILITIES)[number]

const HEADING = 'What the store side handles'

// Scroll budget as a multiple of track travel; the surplus gives each card a dwell.
const PACE = 3

// Relative units: dwell on a card vs. travel to the next.
const DWELL = 1
const HANDOVER = 1.45
// Extra stillness on the last card so the sequence reads as arriving, not stopping.
const TAIL_REST = 1.3

/** Maps scroll progress to track position, with a flat span at each card's stop. */
function dwellTimeline(count: number) {
  const moves = Math.max(1, count - 1)
  const span = count * DWELL + moves * HANDOVER + TAIL_REST
  const input: number[] = []
  const output: number[] = []
  let at = 0

  for (let index = 0; index < count; index += 1) {
    const stop = index / moves
    input.push(at / span)
    output.push(stop)
    at += DWELL + (index === count - 1 ? TAIL_REST : 0)
    input.push(at / span)
    output.push(stop)
    at += HANDOVER
  }

  return { input, output }
}

function CardBody({ item }: { item: Capability }) {
  return (
    <>
      {item.image && (
        <img
          src={item.image}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="photo-mono h-36 w-full shrink-0 object-cover"
        />
      )}
      <div className="flex flex-1 flex-col p-7">
        <h3 className="display text-2xl text-fg sm:text-[1.75rem]">
          {item.term}
        </h3>
        <p className="mt-3 text-base leading-relaxed text-fg-muted">
          {item.detail}
        </p>
      </div>
    </>
  )
}

/** One card; reaches full presence at the centre of the pane. */
function TrackCard({
  item,
  index,
  count,
  progress,
}: {
  item: Capability
  index: number
  count: number
  progress: MotionValue<number>
}) {
  const centre = count > 1 ? index / (count - 1) : 0
  const span = count > 1 ? 1 / (count - 1) : 1
  const range = [centre - span, centre, centre + span]

  const scale = useTransform(progress, range, [0.93, 1, 0.93])
  const opacity = useTransform(progress, range, [0.5, 1, 0.5])

  return (
    <motion.div
      style={{ scale, opacity }}
      // shrink-0 is load-bearing: without it the track measures no overflow and never pins.
      className={`glass-card glass-interactive flex h-full shrink-0 flex-col overflow-hidden rounded-2xl ${
        item.wide ? 'w-[34rem]' : 'w-[23rem]'
      }`}
    >
      <CardBody item={item} />
    </motion.div>
  )
}

function HorizontalTrack() {
  const sectionRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [distance, setDistance] = useState(0)

  // Laid out at natural width then translated, so the last card lands flush right on any viewport.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    function measure() {
      setDistance(Math.max(0, track!.scrollWidth - track!.clientWidth))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [])

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  })

  const progress = useSpring(scrollYProgress, SPRING.scrub)

  // Track position, paused at each card's stop; cards read it for their scale and weight.
  const timeline = useMemo(() => dwellTimeline(CAPABILITIES.length), [])
  const settled = useTransform(progress, timeline.input, timeline.output)
  const x = useTransform(settled, [0, 1], [0, -distance])

  // Raw scroll for the rail so input during a dwell still shows progress.
  const railScale = useTransform(progress, [0, 1], [0, 1])

  return (
    <section
      id="capabilities"
      ref={sectionRef}
      className="relative scroll-mt-28"
      // Scroll length is proportional to track travel; PACE stretches it for the dwells.
      style={{ height: `calc(100svh + ${Math.round(distance * PACE)}px)` }}
    >
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden">
        <div className="relative">
          <div className="mx-auto w-full max-w-6xl px-6">
            <Reveal>
              <h2 className="display max-w-2xl text-[clamp(2rem,4.5vw,3.75rem)] text-fg drop-shadow-sm">
                {HEADING}
              </h2>
            </Reveal>
          </div>

          <div ref={trackRef} className="mt-12 overflow-hidden">
            <motion.div
              style={{ x }}
              className="flex items-stretch gap-6 pl-6 will-change-transform xl:pl-[max(1.5rem,calc((100vw-72rem)/2))]"
            >
              {CAPABILITIES.map((item, index) => (
                <TrackCard
                  key={item.term}
                  item={item}
                  index={index}
                  count={CAPABILITIES.length}
                  progress={settled}
                />
              ))}
              <div
                aria-hidden="true"
                className="w-6 shrink-0 xl:w-[max(1.5rem,calc((100vw-72rem)/2))]"
              />
            </motion.div>
          </div>

          <div className="mx-auto mt-12 w-full max-w-6xl px-6">
            <div
              aria-hidden="true"
              className="h-px w-full max-w-xs bg-fg/15"
            >
              <motion.div
                style={{ scaleX: railScale }}
                className="chrome-fill h-px w-full origin-left"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** The vertical composition: narrow screens, and anyone who asked for less. */
function StackedGrid() {
  return (
    <section id="capabilities" className="relative scroll-mt-28">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <h2 className="display max-w-2xl text-[clamp(2rem,4.5vw,3.75rem)] text-fg drop-shadow-sm">
            {HEADING}
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((item) => (
            <div
              key={item.term}
              className={`glass-card glass-interactive flex flex-col overflow-hidden rounded-2xl ${item.span}`}
            >
              <CardBody item={item} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Capabilities() {
  const reduced = useReducedMotion()
  const canPin = useMediaQuery('(min-width: 1024px)')

  return reduced || !canPin ? <StackedGrid /> : <HorizontalTrack />
}
