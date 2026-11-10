import { motion } from 'motion/react'
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useReveal } from '../../hooks/useReveal'
import { useSection } from '../../hooks/useSection'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { fetchSalesSeries, type SalesDay } from '../../service/fetchStaffAnalytics'
import type { RequestOptions } from '../../service/simulateRequest'
import { areaPath, niceCeil, smoothPath } from '../../utils/chartPath'
import { formatDay, formatPeso, formatPesoCompact, formatPesoWhole } from '../../utils/format'
import { defaultFilter, describeSales, manilaToday, resolveSalesWindow, SALES_NOUN, type Granularity, type Period } from '../../utils/period'
import { Tooltip } from '../ui/Tooltip'
import { SalesFilter, type SalesScope } from './SalesFilter'
import { EmptyNote, SectionBody, StaffSection } from './StaffSection'
import { AXIS_TWO_LINES, CHART_PLOT, SalesSkeleton } from './StaffSkeleton'

// Percent insets with slack above and below, so the stroke is not clipped at the box edges.
const CLOSED = 'inset(-5% 100% -5% 0%)'
const OPEN = 'inset(-5% -2% -5% -2%)'
// Up to a month of points get a dot each; a year of weeks would be a string of beads.
const DOTTED_MAX = 31
// Room one day label ('Nov 10') needs on the axis.
const DAY_LABEL_PX = 48

/** Sales over the chosen period as a smooth line, with one point per day, week, month, quarter or year, as the filter says. */
export function SalesChart() {
  const [period, setPeriod] = useState<Period>(() => defaultFilter().period)
  const [scope, setScope] = useState<SalesScope>({ month: null, year: null })
  const year = scope.year ?? manilaToday().year
  const month = scope.month ?? undefined
  const filter = { period, year, month }
  const fetcher = useCallback((options: RequestOptions) => fetchSalesSeries({ ...options, filter: { period, year, month } }), [period, year, month])
  const section = useSection(fetcher)
  const resolved = resolveSalesWindow(filter)

  // Inside one month only days and weeks make sense, so a month pick moves a wider period to Day.
  // A picked year on Day or Week lands on that year's latest month (this month in the running year), so the change shows.
  const withMonth = (next: SalesScope, at: Period): SalesScope =>
    next.year && !next.month && (at === 'day' || at === 'week') ? { ...next, month: next.year === manilaToday().year ? Number(manilaToday().date.slice(5, 7)) : 12 } : next
  const changeScope = (picked: SalesScope) => {
    const next = picked.year !== scope.year ? withMonth(picked, period) : picked
    setScope(next)
    if (next.month && period !== 'day' && period !== 'week') setPeriod('day')
  }
  const changePeriod = (next: Period) => {
    setPeriod(next)
    setScope(withMonth(scope, next))
  }

  return (
    <StaffSection
      id="sales"
      title="Sales"
      description={describeSales(filter)}
      filter={{
        name: 'Sales',
        value: filter,
        onChange: (next) => changePeriod(next.period),
        adjectives: true,
        disabled: month ? ['month', 'quarter', 'year'] : undefined,
        control: <SalesFilter value={scope} onChange={changeScope} />,
      }}
    >
      <SectionBody section={section} what="the sales chart" skeleton={<SalesSkeleton twoLineAxis={period === 'quarter'} />}>
        {(series) =>
          series.every((bucket) => bucket.total === 0) ? (
            <EmptyNote>No orders {resolved.when}. Sales show here once the first order is placed.</EmptyNote>
          ) : (
            <SalesFigure key={`${period}-${year}-${month}`} series={series} granularity={resolved.granularity} inMonth={resolved.inMonth} scope={resolved.scope} />
          )
        }
      </SectionBody>
    </StaffSection>
  )
}

/** A bucket's name: short for the axis and table, fuller for the tooltip, a phrase for sentences. */
export function bucketLabel(date: string, granularity: Granularity, style: 'axis' | 'tip' | 'long', inMonth = false) {
  if (granularity === 'week' && inMonth) {
    const [year, month, day] = date.split('-').map(Number)
    const label = `week ${(day - 1) / 7 + 1}`
    if (style === 'long') return label
    const end = day >= 22 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : day + 6
    const title = label[0].toUpperCase() + label.slice(1)
    return style === 'axis' ? title : `${title} (${formatDay(date)} to ${end})`
  }
  if (granularity === 'week') return style === 'axis' ? formatDay(date) : style === 'tip' ? `Week of ${formatDay(date)}` : `the week of ${formatDay(date)}`
  if (granularity === 'month') {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: style === 'axis' ? 'short' : 'long', year: style === 'long' ? 'numeric' : undefined })
  }
  if (granularity === 'quarter') {
    const quarter = `Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`
    return style === 'axis' ? quarter : `${quarter} ${date.slice(0, 4)} (${quarterRange(date)})`
  }
  if (granularity === 'year') return date.slice(0, 4)
  return formatDay(date)
}

/** The months a quarter spans, e.g. "Jan–Mar", from its first day. */
export function quarterRange(date: string) {
  const month = (m: number) => new Date(Date.UTC(2000, m, 1)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' })
  const first = Math.floor((Number(date.slice(5, 7)) - 1) / 3) * 3
  return `${month(first)}–${month(first + 2)}`
}

export const FIRST_COLUMN: Record<Granularity, string> = { day: 'Date', week: 'Week of', month: 'Month', quarter: 'Quarter', year: 'Year' }

function SalesFigure({ series, granularity, inMonth, scope }: { series: SalesDay[]; granularity: Granularity; inMonth: boolean; scope: string }) {
  const { ref, inView, reduced, fade } = useReveal<HTMLElement>()
  const gradient = useId().replace(/:/g, '')
  const wide = useMediaQuery('(min-width: 640px)')
  const [active, setActive] = useState<number | null>(null)
  const [plotWidth, setPlotWidth] = useState(0)
  const plotRef = useRef<HTMLDivElement>(null)

  const last = series.length - 1
  const peak = series.reduce((best, day) => (day.total > best.total ? day : best))
  const total = series.reduce((sum, day) => sum + day.total, 0)
  const top = niceCeil(peak.total)
  // A lone day sits in the middle.
  const xOf = (i: number) => (last === 0 ? 50 : (i / last) * 100)
  const points = series.map((day, i) => ({ x: xOf(i), y: 100 - (day.total / top) * 100 }))
  const heading = `${SALES_NOUN[granularity]} sales, ${scope}`
  const summary = `${heading}. Peak ${formatPesoWhole(peak.total)} ${granularity === 'day' ? 'on' : 'in'} ${bucketLabel(peak.date, granularity, 'long', inMonth)}; total ${formatPesoWhole(total)}.`

  // A short series (four quarters, three years) fits at any width, so it keeps every label.
  const tickCount = Math.min(series.length, wide ? 5 : series.length <= 4 ? 4 : 3)
  // Days of one month label every few days, as many as fit; the dots mark each day in between.
  const dayStep = Math.max(1, Math.ceil(DAY_LABEL_PX / ((plotWidth || 300) / Math.max(last, 1))))
  const ticks =
    granularity === 'day' && series.length <= DOTTED_MAX
      ? Array.from({ length: Math.floor(last / dayStep) + 1 }, (_, n) => n * dayStep)
      : [...new Set(Array.from({ length: tickCount }, (_, n) => (tickCount === 1 ? 0 : Math.round((n * last) / (tickCount - 1)))))]
  const dotted = last > 0 && series.length <= DOTTED_MAX

  useEffect(() => {
    const plot = plotRef.current
    if (!plot || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => setPlotWidth(plot.clientWidth))
    watch.observe(plot)
    return () => watch.disconnect()
  }, [])

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
              aria-label={summary}
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
            {dotted && (
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                initial={{ clipPath: reduced ? OPEN : CLOSED }}
                animate={inView ? { clipPath: OPEN } : undefined}
                transition={{ duration: DURATION.entrance, ease: EASE_OUT }}
              >
                {points.map((point, i) => (
                  <span key={series[i].date} className="absolute -mt-[3px] -ml-[3px] size-1.5 rounded-full bg-chart-2" style={{ left: `${point.x}%`, top: `${point.y}%` }} />
                ))}
              </motion.div>
            )}
            {last === 0 && <span className="absolute -mt-1 -ml-1 size-2 rounded-full bg-chart-2" style={{ left: '50%', top: `${points[0].y}%` }} />}
            {active !== null && (
              <>
                <div className="pointer-events-none absolute inset-y-0 w-px bg-fg-muted/60" style={{ left: `${xOf(active)}%` }} />
                <span className="pointer-events-none absolute -mt-1.5 -ml-1.5" style={{ left: `${xOf(active)}%`, top: `${points[active].y}%` }}>
                  <Tooltip open label={`${bucketLabel(series[active].date, granularity, 'tip', inMonth)}: ${formatPeso(series[active].total)}`}>
                    <span className="block size-3 rounded-full bg-chart-2 ring-2 ring-canvas-sub" />
                  </Tooltip>
                </span>
              </>
            )}
          </div>
          <div aria-hidden="true" className={`relative mt-1.5 ${granularity === 'quarter' ? AXIS_TWO_LINES : 'h-5'}`}>
            {ticks.map((i) => (
              <span
                key={i}
                className="absolute whitespace-nowrap text-xs tabular-nums text-fg-muted"
                style={{ left: `${xOf(i)}%`, transform: `translateX(${last === 0 ? -50 : i === 0 ? 0 : i === last ? -100 : -50}%)` }}
              >
                {granularity === 'quarter' ? (
                  <>
                    <span className="block">{bucketLabel(series[i].date, granularity, 'axis')}</span>
                    <span className="block">{quarterRange(series[i].date)}</span>
                  </>
                ) : (
                  bucketLabel(series[i].date, granularity, 'axis', inMonth)
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
      <details className="mt-1">
        <summary className="font-ui min-h-11 w-fit cursor-pointer py-2.5 text-sm font-semibold text-fg">View as table</summary>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{heading}</caption>
            <thead>
              <tr className="text-xs text-fg-muted">
                <th scope="col" className="sticky top-0 bg-canvas-sub py-2 text-left font-medium">
                  {inMonth && granularity === 'week' ? 'Week' : FIRST_COLUMN[granularity]}
                </th>
                <th scope="col" className="sticky top-0 bg-canvas-sub py-2 text-right font-medium">
                  Sales
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {series.map((day) => (
                <tr key={day.date}>
                  <td className="py-2 text-fg">{bucketLabel(day.date, granularity, granularity === 'quarter' || inMonth ? 'tip' : 'axis', inMonth)}</td>
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
