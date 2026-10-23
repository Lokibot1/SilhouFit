import { motion } from 'motion/react'
import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useReveal } from '../../hooks/useReveal'
import { useSection } from '../../hooks/useSection'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { fetchSalesSeries, type SalesDay } from '../../service/fetchStaffAnalytics'
import { areaPath, niceCeil, smoothPath } from '../../utils/chartPath'
import { formatDay, formatPeso, formatPesoCompact, formatPesoWhole } from '../../utils/format'
import { Tooltip } from '../ui/Tooltip'
import { EmptyNote, SectionBody, StaffSection } from './StaffSection'
import { CHART_PLOT, SalesSkeleton } from './StaffSkeleton'

// Percent insets with slack above and below, so the stroke is not clipped at the box edges.
const CLOSED = 'inset(-5% 100% -5% 0%)'
const OPEN = 'inset(-5% -2% -5% -2%)'

/** Daily sales this month as a smooth line. */
export function SalesChart() {
  const section = useSection(fetchSalesSeries)

  return (
    <StaffSection id="sales" title="Sales this month" description="Daily totals since the 1st">
      <SectionBody section={section} what="the sales chart" skeleton={<SalesSkeleton />}>
        {(series) =>
          series.every((day) => day.total === 0) ? (
            <EmptyNote>No orders yet this month. Sales show here once the first order is placed.</EmptyNote>
          ) : (
            <SalesFigure series={series} />
          )
        }
      </SectionBody>
    </StaffSection>
  )
}

/** "Oct 1 to 22" for a run of days in one month. */
function dayRange(series: SalesDay[], month: 'short' | 'long') {
  const first = series[0].date
  const last = series[series.length - 1].date
  return first === last ? formatDay(first, month) : `${formatDay(first, month)} to ${Number(last.slice(8))}`
}

function SalesFigure({ series }: { series: SalesDay[] }) {
  const { ref, inView, reduced, fade } = useReveal<HTMLElement>()
  const gradient = useId().replace(/:/g, '')
  const wide = useMediaQuery('(min-width: 640px)')
  const [active, setActive] = useState<number | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)

  const last = series.length - 1
  const peak = series.reduce((best, day) => (day.total > best.total ? day : best))
  const total = series.reduce((sum, day) => sum + day.total, 0)
  const top = niceCeil(peak.total)
  // A lone day sits in the middle.
  const xOf = (i: number) => (last === 0 ? 50 : (i / last) * 100)
  const points = series.map((day, i) => ({ x: xOf(i), y: 100 - (day.total / top) * 100 }))
  const summary = (month: 'short' | 'long') =>
    `Daily sales, ${dayRange(series, month)}. Peak ${formatPesoWhole(peak.total)} on ${formatDay(peak.date)}; total ${formatPesoWhole(total)}.`

  const tickCount = Math.min(series.length, wide ? 5 : 3)
  const ticks = [...new Set(Array.from({ length: tickCount }, (_, n) => (tickCount === 1 ? 0 : Math.round((n * last) / (tickCount - 1)))))]

  // A touch or pen tap stays shown after the finger lifts, until a tap lands outside the plot.
  useEffect(() => {
    if (active === null) return
    const clear = (event: globalThis.PointerEvent) => {
      if (!plotRef.current?.contains(event.target as Node)) setActive(null)
    }
    document.addEventListener('pointerdown', clear)
    return () => document.removeEventListener('pointerdown', clear)
  }, [active === null])

  function track(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const share = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    setActive(last === 0 ? 0 : Math.round(share * last))
  }

  return (
    <motion.figure ref={ref} {...fade}>
      <div className="flex gap-2">
        <div aria-hidden="true" className={`relative ${CHART_PLOT} w-12 shrink-0`}>
          {[1, 0.5, 0].map((share) => (
            <span key={share} className="absolute right-0 -translate-y-1/2 text-xs tabular-nums text-fg-muted" style={{ top: `${(1 - share) * 100}%` }}>
              {formatPesoCompact(top * share)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            ref={plotRef}
            className={`relative ${CHART_PLOT} touch-pan-y`}
            onPointerDown={track}
            onPointerMove={track}
            onPointerLeave={(event) => event.pointerType === 'mouse' && setActive(null)}
            onPointerCancel={() => setActive(null)}
          >
            {[0, 50, 100].map((at) => (
              <div key={at} className="absolute inset-x-0 h-px bg-chart-grid" style={{ top: `${at}%` }} />
            ))}
            {/* The line is wiped in from the left by clipping the box: dash-based drawing breaks under non-scaling strokes. */}
            <motion.svg
              role="img"
              aria-label={summary('long')}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
              initial={{ clipPath: reduced ? OPEN : CLOSED }}
              animate={inView ? { clipPath: OPEN } : undefined}
              transition={{ duration: DURATION.entrance, ease: EASE_OUT }}
            >
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--chart-2)" stopOpacity="0.32" />
                  <stop offset="1" stopColor="var(--chart-2)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath(points, 100)} fill={`url(#${gradient})`} />
              <path
                d={smoothPath(points)}
                fill="none"
                className="stroke-chart-2"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </motion.svg>
            {last === 0 && <span className="absolute -mt-1 -ml-1 size-2 rounded-full bg-chart-2" style={{ left: '50%', top: `${points[0].y}%` }} />}
            {active !== null && (
              <>
                <div className="pointer-events-none absolute inset-y-0 w-px bg-fg-muted/60" style={{ left: `${xOf(active)}%` }} />
                <span className="pointer-events-none absolute -mt-1.5 -ml-1.5" style={{ left: `${xOf(active)}%`, top: `${points[active].y}%` }}>
                  <Tooltip open label={`${formatDay(series[active].date)}: ${formatPeso(series[active].total)}`}>
                    <span className="block size-3 rounded-full bg-chart-2 ring-2 ring-canvas-sub" />
                  </Tooltip>
                </span>
              </>
            )}
          </div>
          <div aria-hidden="true" className="relative mt-1.5 h-5">
            {ticks.map((i) => (
              <span
                key={i}
                className="absolute whitespace-nowrap text-xs tabular-nums text-fg-muted"
                style={{ left: `${xOf(i)}%`, transform: `translateX(${last === 0 ? -50 : i === 0 ? 0 : i === last ? -100 : -50}%)` }}
              >
                {formatDay(series[i].date)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">{summary('short')}</figcaption>
      <details className="mt-1">
        <summary className="font-ui min-h-11 w-fit cursor-pointer py-2.5 text-sm font-semibold text-fg">View as table</summary>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Daily sales, {dayRange(series, 'long')}</caption>
            <thead>
              <tr className="text-xs text-fg-muted">
                <th scope="col" className="sticky top-0 bg-canvas-sub py-2 text-left font-medium">
                  Date
                </th>
                <th scope="col" className="sticky top-0 bg-canvas-sub py-2 text-right font-medium">
                  Sales
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {series.map((day) => (
                <tr key={day.date}>
                  <td className="py-2 text-fg">{formatDay(day.date)}</td>
                  <td className="py-2 text-right tabular-nums text-fg">{formatPeso(day.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </motion.figure>
  )
}
