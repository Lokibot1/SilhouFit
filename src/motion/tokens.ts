/**
 * The one place motion is tuned. Sections compose these values; they never
 * invent their own curves, or the page stops reading as a single system.
 */

/** Confident arrival: quick departure, long settle. Every entrance uses it. */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** Symmetric, for values scrubbed back and forth by scroll position. */
export const EASE_SCRUB: [number, number, number, number] = [0.65, 0, 0.35, 1]

export const DURATION = {
  /** Pointer feedback. Anything slower reads as latency. */
  feedback: 0.14,
  /** Routine state change. */
  state: 0.24,
  /** Layout, overlay, cross-fade. */
  shift: 0.42,
  /** An authored entrance. Reserved for headings and focal elements. */
  entrance: 0.7,
} as const

/** Pointer- and scroll-reactive motion gets weight instead of a duration. */
export const SPRING = {
  /** Cursor-following. Must not visibly lag the pointer. */
  pointer: { stiffness: 260, damping: 28, mass: 0.6 },
  /** Smooths raw scroll progress without making it feel detached. */
  scrub: { stiffness: 90, damping: 26, mass: 0.4 },
} as const

/**
 * Sibling stagger, and the cap on a whole run. Four cards that take a full
 * second to arrive have stopped being motion and become a wait.
 */
const STAGGER = 0.06
const STAGGER_CAP = 0.24

export function staggerDelay(index: number) {
  return Math.min(index * STAGGER, STAGGER_CAP)
}

/** Fire once the element is meaningfully on screen, not at its first pixel. */
export const VIEWPORT = { once: true, amount: 0.35 } as const
