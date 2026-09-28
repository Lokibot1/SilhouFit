import { motion, useTransform, type MotionValue } from 'motion/react'

const ROWS = [
  { label: 'Sales by channel', value: 72 },
  { label: 'Inventory turnover', value: 54 },
  { label: 'Fitting to checkout', value: 38 },
]

/**
 * Each row fills under scroll control rather than arriving pre-drawn, so the
 * panel reads as a dashboard resolving its figures -- the one thing a static
 * mock of an analytics view cannot convey.
 */
function Row({
  row,
  index,
  progress,
}: {
  row: (typeof ROWS)[number]
  index: number
  progress: MotionValue<number>
}) {
  // Rows resolve in sequence inside the section's own traversal, top down.
  const start = 0.1 + index * 0.12
  const fill = useTransform(progress, [start, start + 0.3], [0, row.value / 100])
  const reading = useTransform(fill, (value) => Math.round(value * 100))

  return (
    <div className="group">
      <div className="font-ui flex items-baseline justify-between gap-4 text-sm text-ink/70 transition-colors duration-150 group-hover:text-bronze-deep dark:text-bone/75 dark:group-hover:text-bronze-light">
        <span>{row.label}</span>
        <span className="font-mono text-xs tabular-nums">
          <motion.span>{reading}</motion.span>%
        </span>
      </div>
      <div className="mt-2 h-2 rounded-sm bg-ink/10 dark:bg-white/10">
        <motion.div
          style={{ scaleX: fill }}
          className="h-2 w-full origin-left rounded-sm bg-ink transition-colors duration-150 group-hover:bg-bronze dark:bg-bone dark:group-hover:bg-bronze-light"
        />
      </div>
    </div>
  )
}

export function DashboardMock({ progress }: { progress: MotionValue<number> }) {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-ink/10 pb-4 dark:border-white/10">
        <span className="font-ui text-sm font-semibold text-ink dark:text-bone">
          Dashboard preview
        </span>
      </div>
      <div className="mt-6 space-y-5">
        {ROWS.map((row, index) => (
          <Row key={row.label} row={row} index={index} progress={progress} />
        ))}
      </div>
      <p className="mt-6 text-xs text-ink/50 dark:text-bone/50">
        Illustrative layout, not live data.
      </p>
    </div>
  )
}
