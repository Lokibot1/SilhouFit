import { motion, useInView, useReducedMotion } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { DURATION, EASE_OUT, VIEWPORT, staggerDelay } from './tokens'

// Percent insets throughout: mixed units between keyframes never interpolate. The slack keeps
// descenders and the drop-shadow from shearing at line-height 0.95.
const CLIPPED = 'inset(0% -20% 100% -20%)'
const OPEN = 'inset(0% -20% -30% -20%)'

/** The page's one text entrance. */
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

  // The observed wrapper stays unclipped: Chrome measures a self-clipped element as zero-area and never reveals it.
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

/** Word by word; reserve for the one short headline. */
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
