// Mirrors the loaded product page: same grid, same photo ratio, same text classes in the panel.
import { ShopHeader } from './ShopHeader'

// A one-line bar sized by the text classes it is given (the non-breaking space gives it the line height).
const Bar = ({ className = '' }: { className?: string }) => <div className={`rounded-xl bg-line ${className}`}>&nbsp;</div>

const OptionRow = ({ count, width }: { count: number; width: string }) => (
  <div className="mt-2 flex flex-wrap gap-2">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className={`h-8 rounded-xl bg-line-strong pointer-coarse:h-11 ${width}`} />
    ))}
  </div>
)

// Shared with the loaded page: the screen is exactly one viewport tall and never scrolls.
export const PRODUCT_SCREEN = 'flex h-svh flex-col overflow-hidden'
export const PRODUCT_BODY = 'mx-auto w-full max-w-6xl min-h-0 flex-1 px-6 pb-6 2xl:max-w-[88rem]'
export const PRODUCT_GRID = 'grid h-full min-h-0 grid-cols-[1.1fr_1fr] grid-rows-[minmax(0,1fr)] gap-12'

export function ProductSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the product"
      className={`${PRODUCT_GRID} animate-pulse`}
    >
      <div className="mx-auto flex h-full min-h-0 flex-col items-center">
        <div className="flex min-h-0 w-full flex-1 justify-center">
          <div className="aspect-4/5 h-full max-w-full rounded-2xl bg-line-strong" />
        </div>
        <div className="mt-3 flex shrink-0 gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="aspect-4/5 w-20 rounded-xl bg-line-strong" />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 [@media(min-height:800px)]:gap-4 [@media(min-height:900px)]:gap-6">
        <div className="flex flex-col gap-2">
          <Bar className="font-ui w-1/2 text-xs" />
          <div className="flex items-start justify-between gap-6">
            <Bar className="w-2/3 text-2xl leading-tight" />
            <Bar className="w-28 text-2xl" />
          </div>
          <Bar className="w-40 text-sm" />
          <Bar className="font-ui w-56 text-sm" />
        </div>
        <div>
          <Bar className="font-ui w-28 text-xs" />
          <OptionRow count={2} width="w-24" />
        </div>
        <div>
          <Bar className="font-ui w-28 text-xs" />
          <OptionRow count={5} width="w-10" />
        </div>
        <div>
          <Bar className="font-ui w-24 text-xs" />
          <div className="mt-3 flex items-center gap-2">
            <div className="size-8 rounded-xl bg-line-strong pointer-coarse:size-11" />
            <div className="h-5 w-6 rounded-xl bg-line" />
            <div className="size-8 rounded-xl bg-line-strong pointer-coarse:size-11" />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="h-12 rounded-xl bg-line-strong" />
          <div className="flex gap-3">
            <div className="h-12 flex-1 rounded-xl bg-line-strong" />
            <div className="h-12 flex-1 rounded-xl bg-line-strong" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** The route fallback (header included), so the swap to the loaded page does not shift the layout. */
export function ProductRouteSkeleton() {
  return (
    <>
      <div className={PRODUCT_SCREEN}>
        <ShopHeader title="Loading the piece" crumb="Product" backToShop compact />
        <div className={PRODUCT_BODY}>
          <ProductSkeleton />
        </div>
      </div>
    </>
  )
}
