// Mirrors the loaded product page: same grid, same photo ratio, same text classes in the panel.
import { ShopHeader } from './ShopHeader'

// KRAL blocks are flat and square: Porcelain on Paper, Graphite on Obsidian.
const BLOCK = 'bg-kral-porcelain dark:bg-kral-graphite'

// A one-line bar sized by the text classes it is given (the non-breaking space gives it the line height).
const Bar = ({ className = '' }: { className?: string }) => <div className={`${BLOCK} ${className}`}>&nbsp;</div>

// Same label size as the loaded legends: 16px on phones, 12px from md.
const LEGEND = 'font-kral-mono w-28 text-base md:text-xs'

const OptionRow = ({ count, width }: { count: number; width: string }) => (
  <div className="mt-2 flex flex-wrap gap-2">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className={`h-11 ${BLOCK} ${width}`} />
    ))}
  </div>
)

// Shared with the loaded page: the screen is exactly one viewport tall and never scrolls.
export const PRODUCT_SCREEN = 'flex min-h-svh flex-col lg:h-svh lg:overflow-hidden'
export const PRODUCT_BODY = 'mx-auto w-full max-w-6xl min-h-0 flex-1 px-6 pb-6 max-lg:flex max-lg:flex-col max-lg:pb-0 2xl:max-w-[88rem]'
export const PRODUCT_GRID =
  'flex h-full min-h-0 flex-col gap-2 max-lg:h-auto max-lg:flex-1 lg:grid lg:grid-cols-[1.1fr_1fr] lg:grid-rows-[minmax(0,1fr)] lg:gap-12'
// Below lg the page scrolls: the photo, then the details, with the actions sticky at the bottom of the screen.
export const PRODUCT_PANEL =
  'contents lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-3 lg:[@media(min-height:800px)]:gap-4 lg:[@media(min-height:900px)]:gap-6'
// The details read as hairline rows, like a hang tag: a rule between groups, the first one flush with the top.
export const PRODUCT_DETAILS = 'divide-y divide-kral-rule [&>*]:py-3 [&>:first-child]:pt-0 lg:[&>*]:py-4'
export const PRODUCT_ACTIONS =
  '-mx-6 flex shrink-0 flex-col gap-2 border-t border-kral-rule bg-kral-bg pr-[max(1.5rem,env(safe-area-inset-right))] pl-[max(1.5rem,env(safe-area-inset-left))] pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:mt-auto max-lg:grid max-lg:grid-cols-2 lg:m-0 lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0'

export function ProductSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the product"
      className={`${PRODUCT_GRID} animate-pulse`}
    >
      <div className="mx-auto flex min-h-0 w-full flex-1 items-center gap-2 max-lg:flex-none max-lg:flex-col lg:h-full lg:flex-none lg:flex-col lg:gap-0">
        <div className="flex w-full justify-center max-lg:max-w-md lg:min-h-0 lg:flex-1">
          <div className={`aspect-4/5 h-full w-auto max-w-full max-lg:h-auto max-lg:w-full ${BLOCK}`} />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 p-1 lg:mt-3 lg:p-0">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className={`aspect-4/5 w-14 ${BLOCK} lg:w-20`} />
          ))}
        </div>
      </div>

      <div className={PRODUCT_PANEL}>
        <div className={`flex flex-col lg:min-h-0 lg:flex-1 ${PRODUCT_DETAILS}`}>
        <div className="flex flex-col gap-2 max-lg:flex-row max-lg:flex-wrap max-lg:gap-x-3 max-lg:gap-y-1">
          <Bar className="font-kral-mono w-1/2 text-xs max-lg:hidden" />
          <div className="flex items-start justify-between gap-6 max-lg:basis-full">
            <Bar className="w-2/3 text-lg leading-[1.05] lg:text-xl" />
            <Bar className="w-28 text-lg lg:text-xl" />
          </div>
          <Bar className="font-kral-mono w-32 text-sm" />
        </div>
        <div>
          <Bar className={LEGEND} />
          <OptionRow count={2} width="w-24" />
        </div>
        <div>
          <Bar className={LEGEND} />
          <OptionRow count={5} width="w-11" />
        </div>
        <div>
          <Bar className={`${LEGEND} w-24`} />
          <div className="mt-3 flex items-center gap-2 max-lg:mt-0">
            <div className={`size-11 ${BLOCK}`} />
            <div className={`h-5 w-6 ${BLOCK}`} />
            <div className={`size-11 ${BLOCK}`} />
          </div>
        </div>
        </div>
        <div className={PRODUCT_ACTIONS}>
          <div className={`h-11 ${BLOCK} max-lg:order-2`} />
          <div className="flex flex-col gap-2 max-lg:contents sm:flex-row sm:gap-3">
            <div className={`h-11 flex-1 ${BLOCK} max-lg:order-1 max-lg:col-span-2`} />
            <div className={`h-11 flex-1 ${BLOCK} max-lg:order-3`} />
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
        <ShopHeader tone="kral" title="Loading the piece" crumb="Product" backToShop compact />
        <div className={PRODUCT_BODY}>
          <ProductSkeleton />
        </div>
      </div>
    </>
  )
}
