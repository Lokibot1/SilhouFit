import { motion } from 'motion/react'
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useReveal } from '../../../hooks/useReveal'
import { useSection } from '../../../hooks/useSection'
import { DURATION, EASE_OUT } from '../../../motion/tokens'
import { getArSessionsSeries, type ArSessionPoint } from '../../../service/arInsights'
import type { RequestOptions } from '../../../service/simulateRequest'
import { areaPath, niceCeil, smoothPath } from '../../../utils/chartPath'
import { resolveSalesWindow, SALES_NOUN, type Granularity, type PeriodFilterValue } from '../../../utils/period'
import { bucketLabel, FIRST_COLUMN, quarterRange } from '../../staff/SalesChart'
import { EmptyNote, SectionBody, StaffSection } from '../../staff/StaffSection'
import { AXIS_TWO_LINES, CHART_PLOT } from '../../staff/StaffSkeleton'
import { Tooltip } from '../../ui/Tooltip'

// Percent insets with slack above and below, so the stroke is not clipped at the box edges.
const CLOSED = 'inset(-5% 100% -5% 0%)'
const OPEN = 'inset(-5% -2% -5% -2%)'

const count = (n: number) => n.toLocaleString('en-PH')

function ChartSkeleton({ twoLineAxis }: { twoLineAxis: boolean }) {
  return (
    <div role="status" aria-label="Loading AR sessions" className="animate-pulse">
      <div className={`${CHART_PLOT} rounded-xl bg-line`} />
      <div className={`mt-1.5 rounded-xl bg-line bg-clip-content py-0.5 ${twoLineAxis ? AXIS_TWO_LINES : 'h-5'}`} />
      <div className="mt-1 h-11 w-36 rounded-xl bg-line bg-clip-content py-1.5" />
    </div>
  )
}

/** AR sessions over the chosen period as a smooth line, one point per day, week, month, quarter or year, as the page's filter says. */
export function ArSessionsChart({ filter }: { filter: PeriodFilterValue }) {
  const { period, year } = filter
  const fetcher = useCallback((options: RequestOptions) => getArSessionsSeries({ ...options, filter: { period, year } }), [period, year])
  const section = useSection(fetcher)
  const resolved = resolveSalesWindow(filter)

  return (
    <StaffSection id="ar-sessions" title="AR sessions" description={`${SALES_NOUN[period]} sessions · ${resolved.scope}`}>
      <SectionBody section={section} what="the AR sessions chart" skeleton={<ChartSkeleton twoLineAxis={period === 'quarter'} />}>
        {(series) =>
          series.every((bucket) => bucket.sessions === 0) ? (
            <EmptyNote>No AR sessions {resolved.when}. Sessions show here once a shopper opens AR Fitting.</EmptyNote>
          ) : (
            <SessionsFigure key={`${period}-${year}`} series={series} granularity={resolved.granularity} scope={resolved.scope} />
          )
        }
      </SectionBody>
    </StaffSection>
  )
}

function SessionsFigure({ series, granularity, scope }: { series: ArSessionPoint[]; granularity: Granularity; scope: string }) {
  const { ref, inView, reduced, fade } = useReveal<HTMLElement>()
  const gradient = useId().replace(/:/g, '')
  const wide = useMediaQuery('(min-width: 640px)')
  const [active, setActive] = useState<number | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)

  const last = series.length - 1
  const peak = series.reduce((best, point) => (point.sessions > best.sessions ? point : best))
  const total = series.reduce((sum, point) => sum + point.sessions, 0)
  const top = niceCeil(peak.sessions)
  // A lone point sits in the middle.
  const xOf = (i: number) => (last === 0 ? 50 : (i / last) * 100)
  const points = series.map((point, i) => ({ x: xOf(i), y: 100 - (point.sessions / top) * 100 }))
  const heading = `${SALES_NOUN[granularity]} AR sessions, ${scope}`
  const summary = `${heading}. Peak ${count(peak.sessions)} ${granularity === 'day' ? 'on' : 'in'} ${bucketLabel(peak.date, granularity, 'long')}; total ${count(total)}.`

  // A short series (four quarters, three years) fits at any width, so it keeps every label.
  const tickCount = Math.min(series.length, wide ? 5 : series.length <= 4 ? 4 : 3)
  const ticks = [...new Set(Array.from({ length: tickCount }, (_, n) => (tickCount === 1 ? 0 : Math.round((n * last) / (tickCount - 1)))))]

  // A touch or pen tap stays shown after the finger lifts, until a tap lands outside the plot.
  const shown = active !== null
  useEffect(() => {
    if (!shown) return
    const clear = (event: globalThis.PointerEvent) => {
      if (!plotRef.current?.contains(event.target as Node)) setActive(null)
    }
    document.addEventListener('pointerdown', clear)
    return () => document.removeEventListener('pointerdown', clear)
  }, [shown])

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
              {count(top * share)}
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
              <path d={smoothPath(points)} fill="none" className="stroke-chart-2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </motion.svg>
            {last === 0 && <span className="absolute -mt-1 -ml-1 size-2 rounded-full bg-chart-2" style={{ left: '50%', top: `${points[0].y}%` }} />}
            {active !== null && (
              <>
                <div className="pointer-events-none absolute inset-y-0 w-px bg-fg-muted/60" style={{ left: `${xOf(active)}%` }} />
                <span className="pointer-events-none absolute -mt-1.5 -ml-1.5" style={{ left: `${xOf(active)}%`, top: `${points[active].y}%` }}>
                  <Tooltip open label={`${bucketLabel(series[active].date, granularity, 'tip')}: ${count(series[active].sessions)} sessions`}>
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
                  bucketLabel(series[i].date, granularity, 'axis')
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
                  {FIRST_COLUMN[granularity]}
                </th>
                <th scope="col" className="sticky top-0 bg-canvas-sub py-2 text-right font-medium">
                  Sessions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {series.map((point) => (
                <tr key={point.date}>
                  <td className="py-2 text-fg">{bucketLabel(point.date, granularity, granularity === 'quarter' ? 'tip' : 'axis')}</td>
                  <td className="py-2 text-right tabular-nums text-fg">{count(point.sessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </motion.figure>
  )
}
