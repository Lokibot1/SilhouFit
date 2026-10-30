import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useReveal } from '../../../hooks/useReveal'
import { Tooltip } from '../../ui/Tooltip'

/** A block that fades in once on screen (not at all on reduced motion beyond the fade). */
export function Reveal({ children }: { children: ReactNode }) {
  const { ref, fade } = useReveal<HTMLDivElement>()
  return (
    <motion.div ref={ref} {...fade}>
      {children}
    </motion.div>
  )
}

/** One labelled share of a whole: the name, the percent (with a hint on hover and focus) and a bar. Colour is never the only cue. */
export function ShareBar({ label, pct, fill, hint }: { label: string; pct: number; fill: string; hint: string }) {
  return (
    <li>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-fg">{label}</span>
        <Tooltip label={hint}>
          <span tabIndex={0} aria-label={`${label}: ${pct}%. ${hint}`} className="-my-3 inline-flex min-h-11 min-w-11 items-center justify-end rounded-sm font-semibold text-fg tabular-nums">
            {pct}%
          </span>
        </Tooltip>
      </div>
      <div aria-hidden="true" className="mt-1.5 h-2 rounded-full bg-chart-grid">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  )
}

/** Stacked bars standing in for ShareBar rows while they load; same row height as the loaded list. */
export function ShareBarsSkeleton({ label, count }: { label: string; count: number }) {
  return (
    <ul role="status" aria-label={label} className="grid animate-pulse gap-4">
      {Array.from({ length: count }, (_, n) => (
        <li key={n}>
          <div className="flex justify-between gap-3">
            <div className="h-5 w-20 rounded-xl bg-line" />
            <div className="h-5 w-10 rounded-xl bg-line" />
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-line" />
        </li>
      ))}
    </ul>
  )
}
