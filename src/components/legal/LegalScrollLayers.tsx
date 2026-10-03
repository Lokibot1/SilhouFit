import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react'
import { useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { DURATION, EASE_OUT } from '../../motion/tokens'

// Seeded by hand rather than Math.random, so the sky is the same on every
// visit and across re-renders.
function layer(seed: number, count: number) {
  let s = seed
  const next = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  return Array.from({ length: count }, () => ({
    left: `${(next() * 100).toFixed(2)}%`,
    top: `${(next() * 100).toFixed(2)}%`,
  }))
}

// Far to near: the nearer the layer, the larger and brighter its stars and the
// further it travels over the whole page. Travel is in px across the full
// scroll, so a long page and a short one drift by the same small amount.
const LAYERS = [
  { stars: layer(11, 22), size: 1, opacity: 0.28, travel: -36 },
  { stars: layer(23, 14), size: 1.5, opacity: 0.4, travel: -90 },
  { stars: layer(37, 8), size: 2, opacity: 0.55, travel: -160 },
] as const

const SPARE = 200

/**
 * Extra star layers over the site sky that drift at three different rates as
 * the document scrolls. Fixed and transform-only, so scrolling never triggers
 * layout or paint, and it stays out of the way of the text: the stars are tiny
 * and faint. Phones get the two farther layers, reduced motion gets none of
 * the drift.
 */
export function LegalParallaxSky() {
  const reduced = useReducedMotion()
  const isPhone = !useMediaQuery('(min-width: 768px)')
  const { scrollYProgress } = useScroll()
  const near = useTransform(scrollYProgress, [0, 1], [0, LAYERS[2].travel])
  const mid = useTransform(scrollYProgress, [0, 1], [0, LAYERS[1].travel])
  const far = useTransform(scrollYProgress, [0, 1], [0, LAYERS[0].travel])
  const motionValues = [far, mid, near]

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 overflow-hidden"
      style={{ height: '100lvh' }}
    >
      {LAYERS.map((l, i) => {
        if (isPhone && i === 2) return null
        return (
          <motion.div
            key={i}
            className="absolute inset-x-0 top-0 will-change-transform"
            style={{
              height: `calc(100lvh + ${SPARE}px)`,
              y: reduced ? 0 : motionValues[i],
            }}
          >
            {l.stars.map((star, j) => (
              <span
                key={j}
                className="absolute rounded-full bg-fg"
                style={{
                  left: star.left,
                  top: star.top,
                  width: l.size,
                  height: l.size,
                  opacity: l.opacity,
                }}
              />
            ))}
          </motion.div>
        )
      })}
    </div>
  )
}

/** Appears once the reader is well into the document, and fades away again. */
export function LegalBackToTop() {
  const { scrollY } = useScroll()
  const [visible, setVisible] = useState(false)
  useMotionValueEvent(scrollY, 'change', (value) => setVisible(value > 600))

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: DURATION.shift, ease: EASE_OUT }}
          className="tap glass-clear glass-btn btn-lift font-ui fixed right-4 bottom-4 z-40 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-fg hover:text-chrome-strong sm:right-6 sm:bottom-6"
        >
          Back to top
          <svg
            viewBox="0 0 16 16"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M8 13V3M3 7l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
