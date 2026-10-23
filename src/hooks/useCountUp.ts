import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { DURATION, EASE_OUT } from '../motion/tokens'

/** Counts from 0 up to `target` once, on mount. With reduced motion it is the target at once. */
export function useCountUp(target: number, delay = 0) {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (reduced) return
    const controls = animate(0, target, { duration: DURATION.entrance, ease: EASE_OUT, delay, onUpdate: setValue })
    return () => controls.stop()
  }, [target, delay, reduced])

  return reduced ? target : Math.round(value)
}
