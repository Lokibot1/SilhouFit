import { motion, useTransform, type MotionValue } from 'motion/react'

const ROWS = [
  { label: 'Sales by channel', value: 72 },
  { label: 'Inventory turnover', value: 54 },
  { label: 'Fitting to checkout', value: 38 },
]

function Row({
  row,
  index,
  progress,
}: {
  row: (typeof ROWS)[number]
  index: number
  progress: MotionValue<number>
}) {
  const start = 0.1 + index * 0.12
  const fill = useTransform(progress, [start, start + 0.3], [0, row.value / 100])
  const reading = useTransform(fill, (value) => Math.round(value * 100))

  return (
    <div className="group">
      <div className="font-ui flex items-baseline justify-between gap-4 text-sm text-fg-muted transition-colors duration-150 group-hover:text-chrome-strong">
        <span>{row.label}</span>
        <span className="font-mono text-xs tabular-nums">
          <motion.span>{reading}</motion.span>%
        </span>
      </div>
      <div className="mt-2 h-2 rounded-sm bg-fg/10">
        <motion.div
          style={{ scaleX: fill }}
          className="h-2 w-full origin-left rounded-sm bg-fg transition-colors duration-150 group-hover:bg-chrome"
        />
      </div>
    </div>
  )
}

export function DashboardMock({ progress }: { progress: MotionValue<number> }) {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-line pb-4">
        <span className="font-ui text-sm font-semibold text-fg">
          Dashboard preview
        </span>
      </div>
      <div className="mt-6 space-y-5">
        {ROWS.map((row, index) => (
          <Row key={row.label} row={row} index={index} progress={progress} />
        ))}
      </div>
      <p className="mt-6 text-xs text-fg-muted">
        Illustrative layout, not live data.
      </p>
    </div>
  )
}
