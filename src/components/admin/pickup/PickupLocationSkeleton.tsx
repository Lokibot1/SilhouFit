const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

// A fixed-height line whose padding is left unpainted, so stacked lines keep their gap without adding height.
const Line = ({ className }: { className: string }) => <div className={`rounded-xl bg-line bg-clip-content ${className}`} />

// The loaded summary and its placeholder share these, so the swap shifts nothing. Heights come from the text lines:
// a caption is 20px, a value 24px, the label 28px; cards pad 20px.
export const PICKUP_GRID = 'grid max-w-6xl items-stretch gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'
export const PICKUP_CARD = 'flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-canvas-sub shadow-bar dark:shadow-none'
export const PICKUP_HEAD = 'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-b border-line p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto]'
export const PICKUP_UPDATED = 'col-span-2 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1'
/** The row's icon tile and copy button are positioned inside the padding, so a long value never runs under them. */
export const PICKUP_ROW = 'relative py-4 pr-16 pl-18'
export const PICKUP_TILE = 'absolute top-4 left-5 flex size-10 items-center justify-center rounded-xl'
export const PICKUP_FOOT = 'mt-auto flex flex-col gap-3 border-t border-line p-5 sm:flex-row sm:items-center sm:justify-between'
export const PICKUP_MAP_HEAD = 'flex min-h-14 items-center gap-2 border-b border-line px-5'
export const PICKUP_MAP = 'h-64 sm:h-80 lg:h-auto lg:min-h-72 lg:flex-1'
export const PICKUP_MAP_FOOT = 'flex items-center justify-between gap-3 border-t border-line p-5'

/** The two cards of the saved-location summary. The caller adds role="status". */
export function PickupBodySkeleton() {
  return (
    <div className={`${PICKUP_GRID} animate-pulse`}>
      <div className={PICKUP_CARD}>
        <div className={PICKUP_HEAD}>
          <Bar className="row-span-2 size-11" />
          <Bar className="h-5 w-28" />
          <Bar className="h-7 w-40" />
          <Bar className={`${PICKUP_UPDATED} h-5 w-48 sm:self-center`} />
        </div>
        <div className="divide-y divide-line">
          <div className={PICKUP_ROW}>
            <Bar className={`${PICKUP_TILE}`} />
            <Bar className="h-5 w-20" />
            <Line className="mt-0.5 h-6 py-1" />
            <Line className="h-6 w-2/3 py-1" />
          </div>
          <div className={PICKUP_ROW}>
            <Bar className={`${PICKUP_TILE}`} />
            <Bar className="h-5 w-24" />
            <Line className="mt-0.5 h-6 w-1/2 py-1" />
            <Line className="mt-1 h-5 w-3/4 py-0.5" />
          </div>
          <div className={PICKUP_ROW}>
            <Bar className={`${PICKUP_TILE}`} />
            <Bar className="h-5 w-24" />
            <Line className="mt-0.5 h-6 w-1/2 py-1" />
          </div>
        </div>
        <div className={PICKUP_FOOT}>
          <Bar className="h-5 w-56 max-w-full" />
          <Bar className="h-11 w-full sm:w-56" />
        </div>
      </div>
      <div className={PICKUP_CARD}>
        <div className={PICKUP_MAP_HEAD}>
          <Bar className="h-6 w-36" />
        </div>
        <div className={`${PICKUP_MAP} bg-line`} />
        <div className={PICKUP_MAP_FOOT}>
          <div className="min-w-0 flex-1">
            <Bar className="h-5 w-24" />
            <Bar className="mt-0.5 h-6 w-40 max-w-full" />
          </div>
          <Bar className="h-11 w-24 shrink-0 md:h-9" />
        </div>
      </div>
    </div>
  )
}

/** The route fallback: the title row, then the two cards. */
export function PickupLocationPageSkeleton() {
  return (
    <div role="status" aria-label="Loading Pickup location" className="grid gap-3">
      <div className="flex min-h-8 animate-pulse flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Bar className="h-8 w-56 max-w-full sm:h-9" />
          <Bar className="mt-1 h-4 w-48 max-w-full" />
        </div>
      </div>
      <PickupBodySkeleton />
    </div>
  )
}
