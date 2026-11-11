// Placeholders use the same text classes, spacing and grid as the loaded page, so nothing shifts on swap.
// Card text and promo heights are measured from the loaded page at each width (wrapping varies a little per card).
// ShopSkeleton is the route fallback (header included); ShopPage shows ProductGridSkeleton under its own header.
import { useSearchParams } from 'react-router-dom'
import { shopTitle } from '../../utils/productQuery'
import { CartIcon, HeartIcon } from '../form/icons'
import { ShopHeader } from './ShopHeader'

// A one-line bar sized by the text classes it is given (the non-breaking space gives it the line height).
const Bar = ({ className = '', kral = false }: { className?: string; kral?: boolean }) => (
  <div className={`${kral ? 'bg-kral-porcelain dark:bg-kral-graphite' : 'rounded-xl bg-line'} ${className}`}>&nbsp;</div>
)
// KRAL blocks are flat and square: Porcelain on Paper, Graphite on Obsidian.
const KRAL_BLOCK = 'bg-kral-porcelain dark:bg-kral-graphite'

/** Stands in for the count / saved / sync line beside the heading. */
export function SummarySkeleton() {
  return <Bar kral className="font-kral-mono w-72 max-w-full animate-pulse text-sm max-[347px]:h-10" />
}

export function ShopSkeleton() {
  const [params] = useSearchParams()
  return (
    <>
      <ShopHeader tone="kral" title={shopTitle(params)} summary={<SummarySkeleton />} />
      <div className="mx-auto max-w-6xl px-6 pb-24 2xl:max-w-[88rem]">
        <ProductGridSkeleton />
      </div>
    </>
  )
}

export function CardSkeletons({ list = false, count, tone }: { list?: boolean; count: number; tone?: 'kral' }) {
  const kral = tone === 'kral'
  return (
    <div
      className={`mt-6 grid gap-x-3 gap-y-8 sm:gap-x-4 sm:gap-y-10 ${
        list ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'
      }`}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={list ? 'flex gap-4' : ''}>
          <div className={`aspect-3/4 shrink-0 ${kral ? KRAL_BLOCK : 'rounded-xl bg-line-strong'} ${list ? 'w-28 sm:w-44' : ''}`} />
          <div className={`min-w-0 flex-1 ${list ? '' : 'mt-3'}`}>
            {kral ? (
              // Name (up to two lines), rating, price and stock line, at the card's own text sizes.
              <div className="h-[8.5rem]">
                <Bar kral className="w-5/6 text-sm leading-tight" />
                <Bar kral className="mt-1 w-2/3 text-sm leading-tight" />
                <Bar kral className="mt-1 w-1/3 text-xs" />
                <Bar kral className="mt-3 ml-auto w-1/2 text-base" />
                <Bar kral className="mt-1 w-full text-xs" />
              </div>
            ) : (
              <div className={list ? 'min-[360px]:max-sm:min-h-[6.95rem] max-[359px]:min-h-[7.9rem]' : 'h-[6.6rem] min-[480px]:max-sm:h-[6.4rem] min-[360px]:max-[479px]:h-[7.7rem] max-[359px]:h-[9.2rem]'}>
                <Bar className="w-5/6 text-base leading-snug" />
                <Bar className="mt-1 w-1/3 text-sm" />
                <Bar className="mt-2 ml-auto w-1/2 text-base" />
                <Bar className="mt-2 w-full text-xs" />
              </div>
            )}
            {/* The two buttons, stacked until sm. */}
            <div className="flex flex-col gap-2 pt-3 sm:flex-row">
              <div className={`${kral ? `h-11 ${KRAL_BLOCK}` : 'h-9 rounded-xl bg-line-strong pointer-coarse:h-11'} sm:flex-1`} />
              <div className={`${kral ? `h-11 ${KRAL_BLOCK}` : 'h-9 rounded-xl bg-line-strong pointer-coarse:h-11'} sm:flex-1`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** The wishlist's bulk-action bar and cards, under its own header. */
export function WishlistGridSkeleton() {
  return (
    <div role="status" aria-label="Loading your wishlist" className="animate-pulse">
      <div className="-mx-6 h-[165px] border-b border-kral-rule px-6 py-2 sm:h-[113px] md:h-[61px]">
        <div className={`h-11 w-56 max-w-full ${KRAL_BLOCK}`} />
      </div>
      <CardSkeletons tone="kral" count={4} />
    </div>
  )
}

/** The wishlist route fallback (header included). */
export function WishlistSkeleton() {
  return (
    <>
      <ShopHeader tone="kral" title="Your wishlist" icon={<HeartIcon className="size-[1.1em]" />} crumb="Wishlist" backToShop />
      <div className="mx-auto max-w-6xl px-6 pb-24 2xl:max-w-[88rem]">
        <WishlistGridSkeleton />
      </div>
    </>
  )
}

/** The cart page's select-all bar, rows and bottom bar, under its own header. Same text classes and 44px controls as the loaded rows. */
export function CartListSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading your cart" className="animate-pulse">
      <div className="mt-4 h-[57px] border-b border-kral-rule max-sm:hidden">
        <div className={`h-11 w-56 max-w-full ${KRAL_BLOCK}`} />
      </div>
      <ul className="divide-y divide-kral-rule">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="-mx-3 flex gap-2 px-3 py-5 sm:gap-3">
            <div className="-ml-2.5 flex size-11 shrink-0 items-center justify-center self-center sm:ml-0">
              <div className={`size-6 ${KRAL_BLOCK}`} />
            </div>
            <div className={`h-30 w-24 shrink-0 max-[300px]:h-25 max-[300px]:w-20 sm:h-24 sm:w-18 ${KRAL_BLOCK}`} />
            <div className="min-w-0 flex-1">
              <Bar kral className="font-kral-display w-1/2 text-sm leading-snug font-extrabold sm:text-base" />
              <div className={`mt-1 h-11 w-32 ${KRAL_BLOCK}`} />
              <Bar kral className="font-kral-mono mt-0.5 w-1/4 text-base md:text-sm" />
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className={`h-11 w-32 ${KRAL_BLOCK}`} />
                <Bar kral className="font-kral-mono w-20 text-base" />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className={`mt-4 h-[61px] max-sm:hidden ${KRAL_BLOCK}`} />
    </div>
  )
}

/** The cart route fallback (header included). */
export function CartSkeleton() {
  return (
    <>
      <ShopHeader tone="kral" title="Your cart" icon={<CartIcon className="size-[1.1em]" />} crumb="Cart" backToShop />
      <div className="mx-auto max-w-6xl px-6 pb-24 max-sm:pb-36 2xl:max-w-[88rem]">
        <CartListSkeleton />
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
      <div className="-mx-6 hidden overflow-hidden px-6 py-1 sm:block">
        <div className="flex w-max gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`h-11 w-24 shrink-0 ${KRAL_BLOCK}`} />
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-3">
        <div className="flex items-center gap-2 max-sm:w-full sm:gap-3">
          <div className={`h-11 w-28 max-sm:flex-1 ${KRAL_BLOCK}`} />
          <div className={`h-11 w-24 ${KRAL_BLOCK}`} />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:gap-3">
          <div className={`h-11 min-w-0 sm:w-72 ${KRAL_BLOCK}`} />
          <div className={`h-11 sm:w-44 max-sm:hidden ${KRAL_BLOCK}`} />
        </div>
      </div>

      <CardSkeletons tone="kral" list={list} count={perPage} />

      <div className="mt-12 flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-6">
        <Bar kral className="font-kral-mono w-40 text-sm" />
        <div className={`h-11 w-64 max-w-full ${KRAL_BLOCK}`} />
      </div>

      <div className={`mt-16 h-[22rem] max-[359px]:h-[25.5rem] sm:h-[17.5rem] lg:h-[20.5rem] ${KRAL_BLOCK}`} />
    </div>
  )
}
