import { ADMIN_REVIEWS_PER_PAGE } from '../../../service/reviewsApi'
import { TD, TH } from '../../staff/inventory/layout'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { TransactionPagerSkeleton } from '../../staff/TransactionsSkeleton'

/** The height a review row and card keep before and after the rows arrive: a name line, two lines of comment and the buttons fit in it. */
export const REVIEW_ROW = 'min-h-28'

export const REVIEW_HEADERS = ['Reviewer', 'Product', 'Rating', 'Review', 'Date', 'Status', 'Actions'] as const

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

const BAR_WIDTH = ['w-28', 'w-24', 'w-24', 'w-48', 'w-24', 'w-20', 'w-44']

export function ReviewTableSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <tr key={n} className={`${REVIEW_ROW} animate-pulse`}>
      {BAR_WIDTH.map((width, i) => (
        <td key={i} className={TD}>
          <Bar className={`h-5 ${width} ${i === 2 ? 'ml-auto' : ''}`} />
        </td>
      ))}
    </tr>
  ))
}

export function ReviewCardSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <li key={n} className={`${REVIEW_ROW} grid animate-pulse content-center gap-2 py-3`}>
      <Bar className="h-5 w-1/2" />
      <Bar className="h-5 w-2/3" />
      <Bar className="h-5 w-full" />
      <Bar className="h-11 w-3/4" />
    </li>
  ))
}

/** The route fallback for Reviews: header, toolbar, list and pager at the sizes they have once loaded. */
export function ReviewsPageSkeleton() {
  return (
    <div role="status" aria-label="Loading Reviews" className="grid animate-pulse gap-3">
      <div className="flex min-h-8 flex-wrap items-center gap-3">
        <div aria-hidden="true" className="min-w-0">
          <div className="display w-fit rounded-xl bg-line text-2xl text-transparent sm:text-3xl">Reviews</div>
          <div className="mt-1 text-xs text-transparent">
            <span className="rounded-xl bg-line">Customer reviews to reply to or take down</span>
          </div>
        </div>
      </div>
      <section className={STAFF_SECTION}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Bar className="h-9 w-full max-md:h-11 @sm:w-40" />
          <Bar className="h-9 w-full max-md:h-11 @sm:w-44" />
          <Bar className="h-11 w-36" />
        </div>
        <table className="hidden w-full border-separate border-spacing-0 whitespace-nowrap @4xl:table">
          <thead>
            <tr>
              {REVIEW_HEADERS.map((label) => (
                <th key={label} className={TH}>
                  <div className="h-11" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <ReviewTableSkeletonRows count={ADMIN_REVIEWS_PER_PAGE} />
          </tbody>
        </table>
        <ul className="divide-y divide-line border-y border-line @4xl:hidden">
          <ReviewCardSkeletonRows count={ADMIN_REVIEWS_PER_PAGE} />
        </ul>
        <TransactionPagerSkeleton />
      </section>
    </div>
  )
}
