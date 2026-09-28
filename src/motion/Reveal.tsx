import { motion, useInView, useReducedMotion } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { DURATION, EASE_OUT, VIEWPORT, staggerDelay } from './tokens'

// A clip that sweeps down while the content settles up: together they read as
// an edge passing over the line rather than a fade.
//
// Every inset is a percentage, including the slack. Mixing units across the two
// keyframes (100% closed against an em of slack open) gives the interpolator
// two incompatible values in the same slot and the sweep never resolves. The
// slack itself is not decoration -- `.display` sets line-height 0.95, so
// descenders and the drop-shadow fall outside the text box and a flush clip
// would shear them off.
const CLIPPED = 'inset(0% -20% 100% -20%)'
const OPEN = 'inset(0% -20% -30% -20%)'

/**
 * The page's one text entrance. Everything arriving as a line of type uses it,
 * so the reveal reads as a single authored gesture repeated deliberately rather
 * than a different effect per section.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as = 'div',
}: {
  children: ReactNode
  delay?: number
  className?: string
  /** `span` for use inside a heading, where a div is not valid content. */
  as?: 'div' | 'span'
}) {
  const ref = useRef<HTMLDivElement & HTMLSpanElement>(null)
  const inView = useInView(ref, VIEWPORT)
  const reduced = useReducedMotion()

  const Tag = as === 'span' ? motion.span : motion.div
  const inner = as === 'span' ? 'block' : undefined
  const box = as === 'span' ? `block ${className}` : className

  // Reduced motion keeps the arrival legible and drops the travel: opacity
  // still marks "this just appeared", nothing sweeps or slides.
  if (reduced) {
    return (
      <Tag
        ref={ref}
        className={box}
        initial={{ opacity: 0 }}
        animate={{ opacity: inView ? 1 : 0 }}
        transition={{ duration: DURATION.shift, delay }}
      >
        {children}
      </Tag>
    )
  }

  // Three elements, and the split is not cosmetic. Chrome folds clip-path into
  // the rect it reports to IntersectionObserver, so an element that clips
  // itself to nothing is measured as zero-area and never counts as in view --
  // the reveal would wait forever on a condition its own start state prevents.
  // The observed wrapper therefore stays unclipped and untransformed; the clip
  // and the lift live below it, on separate elements so the mask holds still
  // while the line travels through it.
  return (
    <Tag ref={ref} className={box}>
      <Tag
        className={inner}
        initial={{ clipPath: CLIPPED }}
        animate={{ clipPath: inView ? OPEN : CLIPPED }}
        transition={{ duration: DURATION.entrance, ease: EASE_OUT, delay }}
      >
        <Tag
          className={inner}
          initial={{ y: '38%' }}
          animate={{ y: inView ? '0%' : '38%' }}
          transition={{ duration: DURATION.entrance, ease: EASE_OUT, delay }}
        >
          {children}
        </Tag>
      </Tag>
    </Tag>
  )
}

/**
 * Word by word, for the one heading naming the product's whole claim. Kept to a
 * single short line: per-word reveal on body copy is a DOM tax that reads as a
 * template, and the effect stops meaning anything once it is everywhere.
 */
export function RevealWords({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, VIEWPORT)
  const reduced = useReducedMotion()
  const words = text.split(' ')

  return (
    <span ref={ref} className={className}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          // Each word carries its own clip, so the sweep crosses the line left
          // to right instead of opening the whole heading at once.
          className="inline-block overflow-hidden pb-[0.12em] align-bottom"
        >
          <motion.span
            className="inline-block"
            initial={reduced ? { opacity: 0 } : { y: '105%' }}
            animate={
              reduced
                ? { opacity: inView ? 1 : 0 }
                : { y: inView ? '0%' : '105%' }
            }
            transition={{
              duration: DURATION.entrance,
              ease: EASE_OUT,
              delay: staggerDelay(index),
            }}
          >
            {word}
          </motion.span>
          {index < words.length - 1 && (
            <span className="inline-block">&nbsp;</span>
          )}
        </span>
      ))}
    </span>
  )
}
