// Mirrors the loaded product page: same grid, same photo ratio, same text classes in the panel.
import { ShopHeader } from './ShopHeader'

// A one-line bar sized by the text classes it is given (the non-breaking space gives it the line height).
const Bar = ({ className = '' }: { className?: string }) => <div className={`rounded-xl bg-line ${className}`}>&nbsp;</div>

const OptionRow = ({ count, width }: { count: number; width: string }) => (
  <div className="mt-2 flex flex-wrap gap-2">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className={`h-8 rounded-xl bg-line-strong pointer-coarse:h-11 max-lg:h-11 ${width}`} />
    ))}
  </div>
)

// Shared with the loaded page: the screen is exactly one viewport tall and never scrolls.
export const PRODUCT_SCREEN = 'flex h-svh flex-col overflow-hidden'
export const PRODUCT_BODY = 'mx-auto w-full max-w-6xl min-h-0 flex-1 px-6 pb-6 max-lg:pb-0 2xl:max-w-[88rem]'
export const PRODUCT_GRID =
  'flex h-full min-h-0 flex-col gap-2 lg:grid lg:grid-cols-[1.1fr_1fr] lg:grid-rows-[minmax(0,1fr)] lg:gap-12'
// Below lg the details scroll inside the screen (the photo takes what is left) and the actions stay pinned under them.
export const PRODUCT_PANEL =
  'contents lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-3 lg:[@media(min-height:800px)]:gap-4 lg:[@media(min-height:900px)]:gap-6'
export const PRODUCT_ACTIONS =
  '-mx-6 flex shrink-0 flex-col gap-2 border-t border-line bg-canvas px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-lg:grid max-lg:grid-cols-2 lg:m-0 lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0'

export function ProductSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the product"
      className={`${PRODUCT_GRID} animate-pulse`}
    >
      <div className="mx-auto flex min-h-0 w-full flex-1 items-center gap-2 max-lg:min-h-28 max-lg:justify-center lg:h-full lg:flex-none lg:flex-col lg:gap-0">
        <div className="flex w-full justify-center max-lg:contents lg:min-h-0 lg:flex-1">
          <div className="aspect-4/5 h-full w-auto max-w-full rounded-xl bg-line-strong" />
        </div>
        <div className="flex shrink-0 gap-2 p-1 max-lg:order-first max-lg:flex-col lg:mt-3 lg:p-0">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="aspect-4/5 w-11 rounded-xl bg-line-strong lg:w-20" />
          ))}
        </div>
      </div>

      <div className={PRODUCT_PANEL}>
        <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:[@media(min-height:800px)]:gap-4 lg:[@media(min-height:900px)]:gap-6">
        <div className="flex flex-col gap-2 max-lg:flex-row max-lg:flex-wrap max-lg:gap-x-3 max-lg:gap-y-1">
          <Bar className="font-ui w-1/2 text-xs max-lg:hidden" />
          <div className="flex items-start justify-between gap-6 max-lg:basis-full">
            <Bar className="w-2/3 text-2xl leading-tight" />
            <Bar className="w-28 text-2xl" />
          </div>
          <Bar className="w-32 text-sm" />
          <Bar className="font-ui w-32 text-sm" />
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
          <div className="mt-3 flex items-center gap-2 max-lg:mt-0">
            <div className="size-8 rounded-xl bg-line-strong pointer-coarse:size-11 max-lg:size-11" />
            <div className="h-5 w-6 rounded-xl bg-line" />
            <div className="size-8 rounded-xl bg-line-strong pointer-coarse:size-11 max-lg:size-11" />
          </div>
        </div>
        </div>
        <div className={PRODUCT_ACTIONS}>
          <div className="h-12 rounded-xl bg-line-strong max-lg:order-2 max-lg:h-11" />
          <div className="flex flex-col gap-2 max-lg:contents sm:flex-row sm:gap-3">
            <div className="h-12 flex-1 rounded-xl bg-line-strong max-lg:order-1 max-lg:col-span-2 max-lg:h-11" />
            <div className="h-12 flex-1 rounded-xl bg-line-strong max-lg:order-3 max-lg:h-11" />
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
