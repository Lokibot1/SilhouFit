import { motion, useReducedMotion } from 'motion/react'
import { DURATION, EASE_OUT } from '../../motion/tokens'

const COUNT = 30
const COLORS = ['bg-fg', 'bg-chrome-strong', 'bg-fg-muted', 'bg-success']

/** A short burst from the middle of the screen. Pieces are placed by index, so it looks the same every time. */
export function Confetti() {
  const reduced = useReducedMotion()
  if (reduced) return null

  return (
    <div data-testid="confetti" aria-hidden="true" className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      {Array.from({ length: COUNT }, (_, i) => {
        const angle = (i / COUNT) * Math.PI * 2
        const reach = 110 + ((i * 37) % 140)
        return (
          <motion.span
            key={i}
            className={`absolute top-[40%] left-1/2 h-3 w-1.5 rounded-sm ${COLORS[i % COLORS.length]}`}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={{
              x: Math.cos(angle) * reach,
              y: [0, Math.sin(angle) * reach - 40, Math.sin(angle) * reach + 140],
              rotate: ((i * 47) % 360) + 180,
              opacity: [1, 1, 0],
            }}
            transition={{ duration: DURATION.entrance + 0.5, ease: EASE_OUT }}
          />
        )
      })}
    </div>
  )
}
