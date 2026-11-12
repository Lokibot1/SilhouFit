import { CARD_ROW, PAGER_CONTROL, PAGER_FOOTER, PAGER_PAGINATION, TABLE_HEAD_ROW, TABLE_ROW, TD, TH } from './inventory/layout'
import { STAFF_SECTION } from './StaffSkeleton'
import { PAGER_ROWS, PAGER_SKELETON_ROWS, TOTALS_GRID, TOTALS_TILE, TOTALS_WRAP, TransactionColgroup } from './transactions/layout'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** Body rows with the table's own row height and cell padding, so the data replaces them without a shift. */
export function TransactionTableSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <tr key={n} className={`${TABLE_ROW} animate-pulse`}>
      <td className={TD}>
        <Bar className="h-5 w-24" />
      </td>
      <td className={TD}>
        <Bar className="h-4 w-32" />
      </td>
      <td className={TD}>
        <Bar className="h-4 w-16" />
      </td>
      <td className={TD}>
        <Bar className="h-5 w-20" />
      </td>
      <td className={TD}>
        <Bar className="h-4 w-36" />
      </td>
      <td className={TD}>
        <Bar className="h-4 w-16" />
      </td>
      <td className={TD}>
        <Bar className="ml-auto h-4 w-20" />
      </td>
    </tr>
  ))
}

export function TransactionCardSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <li key={n} className={`${CARD_ROW} flex animate-pulse flex-col justify-center`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Bar className="h-5 w-24" />
          <Bar className="mt-1 h-4 w-1/2" />
        </div>
        <Bar className="h-5 w-20" />
      </div>
      <Bar className="mt-1 h-4 w-2/3" />
    </li>
  ))
}

/** The totals strip's placeholder: four tiles of the real strip's size (label line 20px, value line 28px, caption line 16px reserved). */
export function TransactionTotalsSkeleton() {
  return (
    <div aria-hidden="true" className={TOTALS_WRAP}>
      <div className={`${TOTALS_GRID} animate-pulse`}>
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className={TOTALS_TILE}>
            <Bar className="absolute top-3 right-3 size-8 @sm:right-4" />
            <Bar className="h-4 w-16" />
            <Bar className="mt-1.5 h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** The pager footer's placeholder: same layout and heights as the real Pagination in its transactions layout. */
export function TransactionPagerSkeleton() {
  return (
    <div aria-hidden="true" className={`${PAGER_FOOTER} animate-pulse`}>
      <div className={`${PAGER_PAGINATION} ${PAGER_ROWS}`}>
        <div className={PAGER_SKELETON_ROWS}>
          <Bar className="h-5 w-40" />
          <Bar className={`${PAGER_CONTROL} w-56`} />
        </div>
      </div>
    </div>
  )
}

/** The route's fallback while the page's code loads: the page header, the totals cards, a card with the toolbar's controls, and the first rows. */
export function TransactionsPageSkeleton() {
  return (
    <div role="status" aria-label="Loading transactions" className="grid gap-3">
      <div className="flex min-h-8 items-center">
        <Bar className="display h-[22.8px] w-48 sm:h-[28.5px]" />
      </div>
      <TransactionTotalsSkeleton />
      <div className={STAFF_SECTION}>
        <div className="mb-3 grid gap-3">
          <Bar className="h-11" />
          <Bar className="h-9 pointer-coarse:h-11 @4xl:hidden" />
          <Bar className="h-11 @4xl:h-9 @4xl:pointer-coarse:h-11" />
        </div>
        <table className="hidden w-full table-fixed border-separate border-spacing-0 animate-pulse @4xl:table">
          <TransactionColgroup />
          <thead>
            <tr className={TABLE_HEAD_ROW}>
              {Array.from({ length: 7 }, (_, n) => (
                <th key={n} className={TH}>
                  <Bar className="h-4 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TransactionTableSkeletonRows count={10} />
          </tbody>
        </table>
        <ul className="divide-y divide-line border-y border-line @4xl:hidden">
          <TransactionCardSkeletonRows count={10} />
        </ul>
        <TransactionPagerSkeleton />
      </div>
    </div>
  )
}
