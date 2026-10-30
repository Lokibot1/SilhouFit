import { REFUND_PER_PAGE } from '../../../service/refunds'
import { PAGER_CONTROL, PAGER_FOOTER, PAGER_PAGINATION, TABLE_ROW, TD, TH } from '../../staff/inventory/layout'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { PAGER_ROWS, PAGER_SKELETON_ROWS } from '../../staff/transactions/layout'
import { REFUND_COLUMNS, wideCell } from './refundColumns'
import { REFUND_GRID, RefundCardsSkeleton } from './RefundSummaryCards'

/**
 * The mobile card's height and the height of each line in it: the loaded card and its placeholder share these, so nothing jumps when the rows arrive.
 * Top line 44px (request number, status), customer, reason and time, requested by and decision 24px each, bottom line 44px (order, amount) and 16px of padding.
 */
export const REFUND_CARD_ROW = 'h-50'
export const REFUND_CARD_LINE = 'h-6'
export const REFUND_CARD_TALL = 'h-11'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

export function RefundTableSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <tr key={n} className={`${TABLE_ROW} animate-pulse`}>
      {REFUND_COLUMNS.map((_, c) => (
        <td key={c} className={`${TD} ${wideCell(c)}`}>
          <Bar className={c === 0 ? 'size-6' : `h-5 ${c === 3 ? 'w-2/3' : 'w-3/4'}`} />
        </td>
      ))}
    </tr>
  ))
}

export function RefundCardSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <li key={n} className={`${REFUND_CARD_ROW} flex animate-pulse flex-col justify-center py-2`}>
      <div className={`flex ${REFUND_CARD_TALL} items-center justify-between gap-3`}>
        <Bar className="h-6 w-1/3" />
        <Bar className="h-6 w-24" />
      </div>
      <div className={`flex ${REFUND_CARD_LINE} items-center`}>
        <Bar className="h-5 w-1/2" />
      </div>
      <div className={`flex ${REFUND_CARD_LINE} items-center`}>
        <Bar className="h-5 w-2/3" />
      </div>
      <div className={`flex ${REFUND_CARD_LINE} items-center`}>
        <Bar className="h-5 w-1/2" />
      </div>
      <div className={`flex ${REFUND_CARD_LINE} items-center`}>
        <Bar className="h-5 w-3/4" />
      </div>
      <div className={`flex ${REFUND_CARD_TALL} items-center justify-between gap-3`}>
        <Bar className="h-5 w-24" />
        <Bar className="h-5 w-20" />
      </div>
    </li>
  ))
}

/** The pager's placeholder: the shared one, with the 44px controls Pagination has below the md breakpoint as well as on touch screens. */
export function RefundPagerSkeleton() {
  return (
    <div aria-hidden="true" className={`${PAGER_FOOTER} animate-pulse`}>
      <div className={`${PAGER_PAGINATION} ${PAGER_ROWS}`}>
        <div className={PAGER_SKELETON_ROWS}>
          <Bar className="h-5 w-40" />
          <Bar className={`${PAGER_CONTROL} w-56 max-md:h-11`} />
        </div>
      </div>
    </div>
  )
}

const TAB_LABELS = ['All', 'Pending', 'Approved', 'Rejected']

/** The route fallback for Returns & Refunds: the page as it loads (header, four cards, tabs, toolbar, list and pager) with the same sizes, so nothing jumps when it arrives. */
export function RefundsPageSkeleton() {
  return (
    <div role="status" aria-label="Loading Returns & Refunds" className="grid animate-pulse gap-3">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        {/* The real title and line, hidden, so they wrap and measure the same. */}
        <div aria-hidden="true" className="min-w-0">
          <div className="display w-fit rounded-xl bg-line text-2xl text-transparent sm:text-3xl">Returns &amp; Refunds</div>
          <div className="mt-1 text-xs text-transparent">
            <span className="rounded-xl bg-line">Refund and return requests waiting for an admin decision</span>
          </div>
        </div>
        <Bar className="h-8 w-28" />
      </div>
      <div className="@container">
        <div className={REFUND_GRID}>
          <RefundCardsSkeleton />
        </div>
      </div>
      <section className={STAFF_SECTION}>
        <div className="mb-3">
          <div aria-hidden="true" className="font-ui inline-flex flex-wrap rounded-xl border border-line-strong bg-line p-0.5">
            {TAB_LABELS.map((label) => (
              <div key={label} className="flex h-11 min-w-11 items-center px-3 text-base font-semibold text-transparent md:text-sm">
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="mb-3 grid gap-3">
          <Bar className="h-11 w-full" />
          <div className="flex flex-wrap items-center gap-3">
            <Bar className="h-9 w-full max-md:h-11 pointer-coarse:h-11 @sm:w-44" />
          </div>
        </div>
        <table className="hidden w-full table-fixed border-separate border-spacing-0 @4xl:table">
          <colgroup>
            {REFUND_COLUMNS.map((column, n) => (
              <col key={n} className={`${column.width} ${'wide' in column ? 'hidden @7xl:table-column' : ''}`} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {REFUND_COLUMNS.map((_, c) => (
                <th key={c} className={`${TH} ${wideCell(c)}`}>
                  <div className="h-11" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <RefundTableSkeletonRows count={REFUND_PER_PAGE} />
          </tbody>
        </table>
        <ul className="divide-y divide-line border-y border-line @4xl:hidden">
          <RefundCardSkeletonRows count={REFUND_PER_PAGE} />
        </ul>
        <RefundPagerSkeleton />
      </section>
    </div>
  )
}
