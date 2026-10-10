// Placeholders use the same text classes, spacing and grid as the loaded page, so nothing shifts on swap.
// Card text and promo heights are measured from the loaded page at each width (wrapping varies a little per card).
// ShopSkeleton is the route fallback (header included); ShopPage shows ProductGridSkeleton under its own header.
import { ShopHeader } from './ShopHeader'

// A one-line bar sized by the text classes it is given (the non-breaking space gives it the line height).
const Bar = ({ className = '' }: { className?: string }) => <div className={`rounded-xl bg-line ${className}`}>&nbsp;</div>

export function ShopSkeleton() {
  return (
    <>
      <ShopHeader />
      <div className="mx-auto max-w-6xl px-6 pb-24">
        <ProductGridSkeleton />
      </div>
    </>
  )
}

interface ProductGridSkeletonProps {
  view?: 'grid' | 'list'
  perPage?: number
}

export function ProductGridSkeleton({ view = 'grid', perPage = 12 }: ProductGridSkeletonProps) {
  const list = view === 'list'
  return (
    <div role="status" aria-label="Loading the catalogue" className="animate-pulse">
      <div className="-mx-6 overflow-hidden px-6 py-1">
        <div className="flex w-max gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-11 w-24 shrink-0 rounded-xl bg-line" />
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="h-11 rounded-xl bg-line" />
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-11 w-28 rounded-xl bg-line" />
          <div className="h-11 w-22 rounded-xl bg-line" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          {[0, 1].map((i) => (
            <div key={i}>
              <Bar className="font-ui w-1/2 text-xs" />
              <div className="mt-1 h-11 rounded-xl bg-line-strong" />
            </div>
          ))}
        </div>
        <div className="font-ui flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
          <Bar className="w-32" />
          <Bar className="w-40" />
        </div>
      </div>

      <Bar className="display mt-10 w-40 text-2xl sm:text-3xl" />

      <div
        className={`mt-6 grid gap-x-4 gap-y-10 ${
          list ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
        }`}
      >
        {Array.from({ length: perPage }, (_, i) => (
          <div key={i} className={list ? 'flex gap-4' : ''}>
            <div className={`aspect-3/4 shrink-0 rounded-2xl bg-line-strong ${list ? 'w-28 sm:w-44' : ''}`} />
            <div className={`min-w-0 ${list ? 'flex-1 max-[359px]:min-h-[10.3rem]' : 'mt-3 h-[7.7rem] max-sm:h-[9.2rem] max-[359px]:h-[10.3rem]'}`}>
              <Bar className="font-ui w-2/3 text-[11px]" />
              <Bar className="mt-1 w-5/6 text-base leading-snug" />
              <Bar className="mt-1 w-1/3 text-sm" />
              <Bar className="mt-2 ml-auto w-1/2 text-base" />
              <Bar className="mt-2 w-full text-xs" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div className="h-11 w-64 max-w-full rounded-xl bg-line" />
        <Bar className="font-ui w-40 text-sm" />
      </div>

      <div className="mt-16 h-[22rem] rounded-2xl bg-line max-[359px]:h-[25.5rem] sm:h-[17.5rem] lg:h-[20.5rem]" />
    </div>
  )
}
