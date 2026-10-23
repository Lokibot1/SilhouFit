import type { ReactNode } from 'react'
import { useSidebarCollapsed } from '../../hooks/useSidebarCollapsed'
import { FILTER_DESCRIPTION, FILTER_HEAD, SEGMENTS_BOX, YEAR_BOX } from './PeriodFilter'
import { StaffBrand } from './StaffNav'

// Shared by the real shell (views/staff/StaffLayout) and its skeleton so the swap does not shift anything.
export const staffAside = (collapsed = false) =>
  `sticky top-0 hidden h-svh shrink-0 flex-col overflow-hidden border-r border-line bg-canvas-sub transition-[width] duration-300 ease-out motion-reduce:transition-none lg:flex ${collapsed ? 'w-[4.5rem] items-center p-3' : 'w-64 p-4'}`
export const STAFF_TOPBAR = 'sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-line bg-canvas px-4 sm:px-6 lg:px-10'
export const STAFF_MAIN = 'mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-10 lg:py-6'
// A bento tile. It is a size container so its content (the order log) lays out by the tile's width, not the screen's.
export const STAFF_SECTION = '@container rounded-2xl border border-line bg-canvas-sub p-4'

// A one-line bar sized by the text classes it is given (the non-breaking space gives it the line height).
const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`}>&nbsp;</div>

// A bar of fixed height whose padding is left unpainted, so stacked lines keep a gap without adding height.
const Line = ({ className }: { className: string }) => <div className={`rounded-xl bg-line bg-clip-content ${className}`} />

/** Rows the size of ProductRow. */
export function ProductRowsSkeleton({ count, label }: { count: number; label: string }) {
  return (
    <ul role="status" aria-label={label} className="animate-pulse divide-y divide-line">
      {Array.from({ length: count }, (_, n) => (
        <li key={n} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:min-h-20 sm:flex-nowrap">
          <div className="size-14 shrink-0 rounded-xl bg-line-strong" />
          {/* Lines are fixed to the loaded text lines (name 24, category 20, ID 24); the padding only thins the painted bar. */}
          <div className="min-w-0 flex-1">
            <Line className="h-6 w-2/3 py-1" />
            <Line className="h-5 w-1/3 py-0.5" />
            <Line className="h-6 w-1/4 py-1" />
          </div>
          <div className="flex w-full items-center justify-between gap-x-3 sm:block sm:w-20 sm:shrink-0">
            <Line className="h-6 w-20 py-1 sm:w-full" />
            <Line className="h-5 w-32 py-0.5 sm:w-full" />
          </div>
        </li>
      ))}
    </ul>
  )
}

// The dashboard's blocks. Each skeleton uses the classes of what it stands in for, so nothing shifts when data arrives.
export const STAT_CARD = 'flex min-w-0 flex-col rounded-2xl border border-line bg-canvas-sub p-4'
export const STAT_VALUE = 'display text-right text-xl leading-none tabular-nums'
export const STAT_TOP = 'flex h-8 items-center justify-between gap-3'
export const CHART_PLOT = 'h-40 sm:h-48'
export const DONUT_SIZE = 'size-56'
export const LEGEND_LIST = 'mt-3 min-h-35'
export const BAR_ROW = 'h-20'
export const TREND_ROW = 'grid grid-cols-[1.25rem_minmax(0,1fr)] content-center gap-x-2 gap-y-0.5 py-1.5'
export const LOG_ROW = 'h-15 @xl:h-12'
export const LOG_PAGE = 8
// The date under the greeting, shared so the shell's placeholder is as wide as the real line and wraps the header at the same widths.
export const longDate = (day: Date) => day.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

export function StatCardsSkeleton() {
  return (
    <div role="status" aria-label="Loading this month's figures" className="grid animate-pulse gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className={STAT_CARD}>
          <div className={STAT_TOP}>
            <div className="size-8 rounded-xl bg-line" />
            <Bar className={`${STAT_VALUE} w-full max-w-24`} />
          </div>
          <Bar className="mt-2 w-24 text-sm" />
          <Bar className="mt-1 w-20 text-xs" />
        </div>
      ))}
    </div>
  )
}

// Quarter labels carry their month range on a second line, so that axis row is taller.
export const AXIS_TWO_LINES = 'h-9'

export function SalesSkeleton({ twoLineAxis = false }: { twoLineAxis?: boolean }) {
  return (
    <div role="status" aria-label="Loading sales" className="animate-pulse">
      <div className={`${CHART_PLOT} rounded-xl bg-line`} />
      <div className={`mt-1.5 rounded-xl bg-line bg-clip-content py-0.5 ${twoLineAxis ? AXIS_TWO_LINES : 'h-5'}`} />
      <div className="mt-1 h-11 w-36 rounded-xl bg-line bg-clip-content py-1.5" />
    </div>
  )
}

export function DonutSkeleton() {
  return (
    <div role="status" aria-label="Loading products sold" className="animate-pulse">
      <div className={`${DONUT_SIZE} mx-auto rounded-full bg-line`} />
      <div className={`${LEGEND_LIST} grid grid-rows-5`}>
        {[0, 1, 2, 3, 4].map((n) => (
          <Line key={n} className="h-7 py-1" />
        ))}
      </div>
    </div>
  )
}

export function BarsSkeleton() {
  return (
    <div role="status" aria-label="Loading trendy items" className="animate-pulse">
      <div className="grid">
        {[0, 1, 2, 3, 4].map((n) => (
          <div key={n} className={`${BAR_ROW} ${TREND_ROW}`}>
            <div className="size-5 rounded-full bg-line" />
            <div className="h-5 w-2/3 rounded-xl bg-line" />
            <div className="col-start-2 flex h-5 justify-between gap-2">
              <div className="h-5 w-16 rounded-xl bg-line" />
              <div className="h-5 w-28 rounded-full bg-line" />
            </div>
            <div className="col-start-2 h-1.5 rounded-full bg-line" style={{ width: `${90 - n * 14}%` }} />
            <div className="col-start-2 h-4 w-1/2 rounded-xl bg-line" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function OrderLogSkeleton() {
  return (
    <div role="status" aria-label="Loading recent orders" className="animate-pulse">
      <div className="divide-y divide-line">
        {Array.from({ length: LOG_PAGE }, (_, n) => (
          <div key={n} className={`${LOG_ROW} flex items-center justify-between gap-4`}>
            <div className="h-5 w-1/2 max-w-64 rounded-xl bg-line" />
            <div className="h-5 w-20 rounded-xl bg-line" />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center">
        <div className="h-11 w-32 rounded-xl bg-line" />
      </div>
    </div>
  )
}

const SkeletonSection = ({ filtered, children }: { filtered?: boolean; children: ReactNode }) => (
  <div className={STAFF_SECTION}>
    {filtered ? (
      <div className={FILTER_HEAD}>
        <Bar className="display w-32 max-w-full text-xl" />
        <div className={`${YEAR_BOX} rounded-xl bg-line`} />
        <div className={`${FILTER_DESCRIPTION} w-48 max-w-full rounded-xl bg-line`} />
        <div className={`${SEGMENTS_BOX} rounded-xl bg-line`} />
      </div>
    ) : (
      <div className="mb-3">
        <Bar className="display w-40 text-xl" />
        <div className="mt-0.5 h-4 w-48 rounded-xl bg-line" />
      </div>
    )}
    {children}
  </div>
)

/** Mirrors the loaded shell: the sidebar from `lg`, the top bar, then the dashboard's header and sections. */
export function StaffShellSkeleton() {
  const [collapsed] = useSidebarCollapsed()
  return (
    <div role="status" aria-label="Loading the staff area" className="min-h-svh animate-pulse bg-canvas lg:flex">
      <aside className={staffAside(collapsed)}>
        <div className="mb-6 flex min-h-11 items-center">{collapsed ? <div className="size-11 rounded-xl bg-line" /> : <StaffBrand />}</div>
        <div className="grid flex-1 content-start gap-1">
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className={`h-11 rounded-xl bg-line ${collapsed ? 'w-11' : ''}`} />
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className={STAFF_TOPBAR}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-11 w-20 shrink-0 rounded-full bg-line lg:hidden" />
            <span className="lg:hidden max-[399px]:[&_span]:hidden">
              <StaffBrand />
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div className="size-11 rounded-xl bg-line" />
            <div className="size-11 rounded-xl bg-line" />
          </div>
        </header>
        <div className={`${STAFF_MAIN} grid gap-3`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            {/* Sized like the loaded text (not flex-1) so the Sample data pill wraps at the same widths. */}
            <div className="min-w-0">
              <Bar className="display w-36 text-2xl sm:text-3xl" />
              <div aria-hidden="true" className="mt-1 rounded-xl bg-line text-xs text-transparent">
                {longDate(new Date())}
              </div>
            </div>
            <div className="h-8 w-28 rounded-full bg-line" />
          </div>
          <StatCardsSkeleton />
          <div className="grid gap-3 xl:grid-cols-12">
            <div className="grid gap-3 xl:col-span-8 xl:grid-rows-[auto_1fr]">
              <SkeletonSection filtered>
                <SalesSkeleton />
              </SkeletonSection>
              <div className="grid gap-3 md:grid-cols-2 [&>div]:h-full">
                <SkeletonSection filtered>
                  <DonutSkeleton />
                </SkeletonSection>
                <SkeletonSection filtered>
                  <BarsSkeleton />
                </SkeletonSection>
              </div>
            </div>
            <div className="xl:col-span-4 [&>div]:h-full">
              <SkeletonSection>
                <OrderLogSkeleton />
              </SkeletonSection>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
