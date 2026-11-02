// Placeholders use the same text classes, spacing and grid as the loaded page, so nothing shifts on swap.
// Card text and promo heights are measured from the loaded page at each width (wrapping varies a little per card).
// ShopSkeleton is the route fallback (header included); ShopPage shows ProductGridSkeleton under its own header.
import { useSearchParams } from 'react-router-dom'
import { shopTitle } from '../../utils/productQuery'
import { CartIcon } from '../form/icons'
import { ShopHeader } from './ShopHeader'

// A one-line bar sized by the text classes it is given (the non-breaking space gives it the line height).
const Bar = ({ className = '' }: { className?: string }) => <div className={`rounded-xl bg-line ${className}`}>&nbsp;</div>

/** Stands in for the count / saved / sync line beside the heading. */
export function SummarySkeleton() {
  return <Bar className="font-ui w-72 max-w-full animate-pulse text-sm max-[347px]:h-10" />
}

export function ShopSkeleton() {
  const [params] = useSearchParams()
  return (
    <>
      <ShopHeader title={shopTitle(params)} summary={<SummarySkeleton />} />
      <div className="mx-auto max-w-6xl px-6 pb-24 2xl:max-w-[88rem]">
        <ProductGridSkeleton />
      </div>
    </>
  )
}

export function CardSkeletons({ list = false, count }: { list?: boolean; count: number }) {
  return (
    <div
      className={`mt-6 grid gap-x-3 gap-y-8 sm:gap-x-4 sm:gap-y-10 ${
        list ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'
      }`}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={list ? 'flex gap-4' : ''}>
          <div className={`aspect-3/4 shrink-0 rounded-xl bg-line-strong ${list ? 'w-28 sm:w-44' : ''}`} />
          <div className={`min-w-0 flex-1 ${list ? '' : 'mt-3'}`}>
            <div className={list ? 'min-[360px]:max-sm:min-h-[6.95rem] max-[359px]:min-h-[7.9rem]' : 'h-[6.6rem] min-[480px]:max-sm:h-[6.4rem] min-[360px]:max-[479px]:h-[7.7rem] max-[359px]:h-[9.2rem]'}>
              <Bar className="w-5/6 text-base leading-snug" />
              <Bar className="mt-1 w-1/3 text-sm" />
              <Bar className="mt-2 ml-auto w-1/2 text-base" />
              <Bar className="mt-2 w-full text-xs" />
            </div>
            {/* The two buttons, stacked until sm. */}
            <div className="flex flex-col gap-2 pt-3 sm:flex-row">
              <div className="h-9 rounded-xl bg-line-strong pointer-coarse:h-11 sm:flex-1" />
              <div className="h-9 rounded-xl bg-line-strong pointer-coarse:h-11 sm:flex-1" />
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
      <div className="h-9 w-full rounded-xl bg-line pointer-coarse:h-11" />
      <CardSkeletons count={4} />
    </div>
  )
}

/** The wishlist route fallback (header included). */
export function WishlistSkeleton() {
  return (
    <>
      <ShopHeader title="Your wishlist" crumb="Wishlist" backToShop />
      <div className="mx-auto max-w-6xl px-6 pb-24 2xl:max-w-[88rem]">
        <WishlistGridSkeleton />
      </div>
    </>
  )
}

/** The cart page's rows and its bottom bar, under its own header. */
export function CartListSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading your cart" className="animate-pulse">
      <ul className="mt-4 divide-y divide-line">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="flex items-center gap-2 py-5 sm:gap-3">
            <div className="-ml-2.5 flex size-11 shrink-0 items-center justify-center sm:ml-0">
              <div className="size-6 rounded-md bg-line-strong" />
            </div>
            <div className="h-20 w-16 shrink-0 rounded-xl bg-line-strong sm:h-24 sm:w-18" />
            <div className="min-w-0 flex-1">
              <Bar className="w-1/2 text-base leading-snug" />
              <Bar className="mt-0.5 w-1/3 text-sm" />
              <Bar className="mt-0.5 w-1/4 text-sm" />
              <div className="mt-2 h-9 w-32 rounded-xl bg-line-strong pointer-coarse:h-11" />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 h-14 rounded-xl bg-line" />
    </div>
  )
}

/** The cart route fallback (header included). */
export function CartSkeleton() {
  return (
    <>
      <ShopHeader title="Your cart" icon={<CartIcon className="size-[1.1em]" />} crumb="Cart" backToShop />
      <div className="mx-auto max-w-6xl px-6 pb-24 2xl:max-w-[88rem]">
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
            <div key={i} className="h-9 w-24 shrink-0 rounded-xl bg-line pointer-coarse:h-11" />
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-28 rounded-xl bg-line pointer-coarse:h-11" />
          <div className="h-9 w-[4.75rem] rounded-xl bg-line pointer-coarse:h-11 pointer-coarse:w-[5.75rem]" />
        </div>
        <div className="flex w-full gap-2 max-[359px]:flex-col sm:w-auto sm:gap-3">
          <div className="h-9 min-w-0 flex-1 rounded-xl bg-line-strong pointer-coarse:h-11 sm:w-60 sm:flex-none" />
          <div className="h-9 w-33 rounded-xl bg-line-strong pointer-coarse:h-11 max-[359px]:w-full sm:w-36" />
        </div>
      </div>

      <CardSkeletons list={list} count={perPage} />

      <div className="mt-12 flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-6">
        <Bar className="font-ui w-40 text-sm" />
        <div className="h-9 w-64 max-w-full rounded-xl bg-line pointer-coarse:h-11" />
      </div>

      <div className="mt-16 h-[22rem] rounded-xl bg-line max-[359px]:h-[25.5rem] sm:h-[17.5rem] lg:h-[20.5rem]" />
    </div>
  )
}
