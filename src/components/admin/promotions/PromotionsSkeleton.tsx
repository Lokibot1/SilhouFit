import { TABLE_ROW, TD } from '../../staff/inventory/layout'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { PromoCardsSkeleton, PROMO_GRID } from './PromotionSummaryCards'

/** The mobile card's height, and the height of each line in it: the loaded card and its placeholder share these, so nothing jumps when the rows arrive. */
export const PROMO_CARD_ROW = 'h-52'
export const PROMO_CARD_LINE = 'h-6'
export const PROMO_CARD_ACTIONS = 'h-11'

/** Table columns: name, code, value, sale period, status, redemptions, actions. */
export const PROMO_CELLS = 7

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

export function PromoTableSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <tr key={n} className={`${TABLE_ROW} animate-pulse`}>
      {Array.from({ length: PROMO_CELLS }, (_, c) => (
        <td key={c} className={TD}>
          <Bar className={`h-5 ${c === 0 ? 'w-2/3' : 'w-3/4'}`} />
        </td>
      ))}
    </tr>
  ))
}

export function PromoCardSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <li key={n} className={`${PROMO_CARD_ROW} flex animate-pulse flex-col justify-center py-2`}>
      <div className="flex h-11 items-center">
        <Bar className="h-6 w-2/3" />
      </div>
      <div className={`flex ${PROMO_CARD_LINE} items-center`}>
        <Bar className="h-5 w-1/2" />
      </div>
      <div className={`flex ${PROMO_CARD_LINE} items-center`}>
        <Bar className="h-5 w-2/3" />
      </div>
      <div className="flex h-11 items-center">
        <Bar className="h-5 w-3/4" />
      </div>
      <div className={`flex ${PROMO_CARD_ACTIONS} items-center justify-end`}>
        <Bar className="h-9 w-32" />
      </div>
    </li>
  ))
}

/** The route fallback for Pricing & Promotions: title, the four cards, then the list's tabs, toolbar and a few cards. */
export function PromotionsPageSkeleton() {
  return (
    <div role="status" aria-label="Loading Pricing & Promotions" className="grid animate-pulse gap-3">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <Bar className="h-8 w-64 max-w-full sm:h-9" />
        <Bar className="h-8 w-28" />
      </div>
      <div className="@container">
        <div className={PROMO_GRID}>
          <PromoCardsSkeleton />
        </div>
      </div>
      <section className={STAFF_SECTION}>
        <Bar className="mb-3 h-12 w-80 max-w-full" />
        <Bar className="mb-3 h-11 w-full" />
        <Bar className="mb-3 h-11 w-full @sm:w-44" />
        <ul className="divide-y divide-line border-y border-line">
          <PromoCardSkeletonRows count={4} />
        </ul>
      </section>
    </div>
  )
}
