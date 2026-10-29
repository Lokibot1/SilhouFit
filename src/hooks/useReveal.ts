import { useInView, useReducedMotion } from 'motion/react'
import { useRef } from 'react'
import { DURATION, EASE_OUT, VIEWPORT, staggerDelay } from '../motion/tokens'

/**
 * For a block that animates in once it is meaningfully on screen: attach `ref`, and spread `fade` on a motion element.
 * `amount` is how much of the block must show; a block taller than the screen needs 'some', or it never reveals until scrolled.
 * Reduced motion keeps the fade and drops the travel; `reduced` is for the caller's own animations.
 */
export function useReveal<T extends HTMLElement>(index = 0, amount: number | 'some' = VIEWPORT.amount) {
  const ref = useRef<T>(null)
  const inView = useInView(ref, { ...VIEWPORT, amount })
  const reduced = useReducedMotion() ?? false
  const fade = {
    initial: { opacity: 0, y: reduced ? 0 : 12 },
    animate: inView ? { opacity: 1, y: 0 } : undefined,
    transition: { duration: DURATION.shift, ease: EASE_OUT, delay: staggerDelay(index) },
  }
  return { ref, inView, reduced, fade }
}
