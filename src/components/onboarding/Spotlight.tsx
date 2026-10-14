import { motion, useReducedMotion } from 'motion/react'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { PAD, type Box } from './useTourTarget'

/**
 * Dims the page except for a hole around the target. It never takes pointer events, so the page stays usable, and it
 * does not lock scrolling. With no box the whole page is dimmed (the card is then centred).
 */
export function Spotlight({ box, pulse = false }: { box: Box | null; pulse?: boolean }) {
  const reduced = useReducedMotion()
  const transition = reduced ? { duration: 0 } : { duration: DURATION.shift, ease: EASE_OUT }

  if (!box) return <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[75] bg-carbon-950/50" />

  const hole = { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }
  return (
    <motion.div
      aria-hidden="true"
      initial={false}
      animate={hole}
      transition={transition}
      className="pointer-events-none fixed z-[75] rounded-2xl border-2 border-chrome-strong"
      style={{ boxShadow: '0 0 0 9999px color-mix(in srgb, var(--color-carbon-950) 60%, transparent)' }}
    >
      {pulse && (
        <motion.span
          className="absolute -inset-1.5 rounded-[1.25rem] border-2 border-fg"
          animate={reduced ? undefined : { opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </motion.div>
  )
}
