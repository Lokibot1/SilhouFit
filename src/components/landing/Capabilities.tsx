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
    term: 'Inventory that matches in real time',
    detail:
      'Stock changes at the register update the storefront immediately, and the reverse. One inventory count, not two ledgers to reconcile by hand.',
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
    term: 'One cart, either channel',
    detail:
      'Add items online or in the store and check out with Buy Online, Pick Up In-Store. The cart follows the shopper across channels.',
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

// How much scroll the pinned sequence gets, as a multiple of the distance the
// track physically travels. At 1:1 the whole set crosses in less than one
// viewport and the section races the reader; the surplus is what buys each card
// a moment of its own.
const PACE = 3

// The rhythm inside that scroll, in relative units: how long a card sits
// centred against how long the track takes to hand over to the next one.
const DWELL = 1
const HANDOVER = 1.45
// Extra stillness on the last card only. Without it the section unpins on the
// same scroll that finishes the track, so the sequence never reads as having
// arrived -- it just stops.
const TAIL_REST = 1.3

/**
 * Maps raw scroll progress to a position along the track, with a flat span at
 * every card's centred stop.
 *
 * The flats are the whole point. A linear mapping means the track is always
 * moving, so a card is only ever passing through the reading position and never
 * simply at it -- which is what made the sequence feel rushed no matter how
 * much scroll length it was given. Length alone does not buy composure; the
 * pauses do, and the length is what makes room for them.
 */
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

/**
 * One card on the horizontal track. It reads its own distance from the centre
 * of the pane and comes to full presence there, so the card being read is the
 * only one at full weight. That focus is the reason to pin the section at all;
 * without it a horizontal track is just a sideways list.
 */
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
      // shrink-0 is load-bearing: as flex items these would otherwise compress
      // to fit the pane, the track would measure no overflow, and the section
      // would size itself to exactly one viewport and never pin.
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

  // The track lays out at its natural width and is then translated. Measuring
  // it is what lands the last card flush with the right edge on any viewport,
  // rather than guessing a vh height that only resolves on one monitor.
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

  // Smoothed, so a trackpad flick glides to rest instead of stopping dead.
  const progress = useSpring(scrollYProgress, SPRING.scrub)

  // Position along the track, paused at each card's stop. Cards read this same
  // value for their own scale and weight, so a card is at full presence for
  // exactly as long as it is parked at the reading position.
  const timeline = useMemo(() => dwellTimeline(CAPABILITIES.length), [])
  const settled = useTransform(progress, timeline.input, timeline.output)
  const x = useTransform(settled, [0, 1], [0, -distance])

  // The rail stays on raw scroll rather than the paused value. Scrolling during
  // a card's dwell would otherwise produce no visible response at all, and a
  // pinned section that swallows input feels broken rather than composed: the
  // rail keeps reporting progress, so the frame stays alive while the card it
  // is holding does not move.
  const railScale = useTransform(progress, [0, 1], [0, 1])

  return (
    <section
      id="capabilities"
      ref={sectionRef}
      className="relative scroll-mt-28"
      // Scroll length stays proportional to how far the track has to move, so
      // the section never feels slack on a wide screen or frantic on a narrow
      // one -- PACE then stretches that budget far enough for the dwells.
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
              {/* Matches the leading gutter, so the last card comes to rest
                  aligned the way the first one started rather than jammed
                  against the edge. */}
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
  // Pinning needs the width to justify a horizontal read in the first place.
  const canPin = useMediaQuery('(min-width: 1024px)')

  return reduced || !canPin ? <StackedGrid /> : <HorizontalTrack />
}
