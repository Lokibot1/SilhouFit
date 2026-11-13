import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchProductReviews, type ProductReviewsPage, type Review, type ReviewSort } from '../../service/reviewsApi'
import { formatOrderTime, variantLabel } from '../../utils/format'
import { ReviewMediaTile } from '../orders/ReviewMediaTile'
import { StarDisplay } from '../orders/StarRating'
import { Avatar } from '../ui/Avatar'
import { Select } from '../ui/Select'
import { Pagination } from './Pagination'
import { ReviewListSkeleton, ProductReviewsSkeleton } from './ProductReviewsSkeleton'
import { KRAL_CHIP, KRAL_PRIMARY, KRAL_SECONDARY } from './shopControls'

const HEADING = 'font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl'
const MUTED = 'font-kral-mono text-base text-kral-muted md:text-sm'
const SORTS: { value: ReviewSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'highest_rating', label: 'Highest rating' },
  { value: 'lowest_rating', label: 'Lowest rating' },
]
const STARS = [5, 4, 3, 2, 1] as const
const CHIP_STARS = [1, 2, 3, 4, 5]

interface Filters {
  /** 0 lists every rating. */
  rating: number
  photos: boolean
  sort: ReviewSort
  page: number
}

interface State {
  /** The request this answer belongs to; while it differs from the current one, the section is loading. */
  key: string
  status: 'ready' | 'error'
  /** The last answer, so the summary and filters stay put while a filter or page change loads. */
  data: ProductReviewsPage | null
  failure: unknown
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function failureCopy(failure: unknown) {
  const kind = (failure as { kind?: string } | null)?.kind
  if (kind === 'network') return "We couldn't load the reviews. The request failed, most likely because the connection dropped. Your other product details are not affected. Check your connection, then try again."
  if (kind === 'rate-limit') return "We couldn't load the reviews. Too many requests were sent in a short time. Wait a moment, then try again."
  return "We couldn't load the reviews. The reviews service didn't answer properly, which is usually brief. Your other product details are not affected. Try again in a moment."
}

function ReviewRow({ review }: { review: Review }) {
  const variants = [...new Set(review.purchasedVariants.map((v) => variantLabel(v.size, v.color)).filter(Boolean))].join(', ')
  return (
    <li className="border-t border-kral-rule py-6">
      <div className="flex items-center gap-3">
        <Avatar tone="kral" size="sm" name={review.user.name} src={review.user.avatarUrl ?? undefined} />
        <p className="font-kral-mono text-base font-medium text-kral-fg md:text-sm">{review.user.name}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarDisplay rating={review.rating} />
        <p className={`${MUTED} tabular-nums`}>{formatOrderTime(review.createdAt)}</p>
      </div>
      {variants && <p className={`${MUTED} mt-1`}>{variants}</p>}
      {review.comment && <p className="font-kral-mono mt-3 max-w-2xl text-base break-words whitespace-pre-line text-kral-fg md:text-sm">{review.comment}</p>}
      {review.images.length > 0 && (
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {review.images.map((image, i) => (
            <ReviewMediaTile key={image.id} name={`Photo ${i + 1}`} url={image.url} label={`Photo ${i + 1} from ${review.user.name}`} />
          ))}
        </ul>
      )}
      {review.adminReply && (
        <div className="mt-4 max-w-2xl border-l-2 border-kral-rule pl-4">
          <p className="font-kral-mono text-base font-medium text-kral-fg md:text-sm">Reply from SilhouFit</p>
          <p className={`${MUTED} mt-1 break-words whitespace-pre-line text-kral-fg`}>{review.adminReply}</p>
          {review.adminRepliedAt && <p className={`${MUTED} mt-1 tabular-nums`}>{formatOrderTime(review.adminRepliedAt)}</p>}
        </div>
      )}
    </li>
  )
}

/** A product's reviews: the rating summary, filters and sort, and the reviews a page at a time. It owns its data, so a failure here never touches the rest of the page. */
export function ProductReviews({ productId }: { productId: string }) {
  const [filters, setFilters] = useState<Filters>({ rating: 0, photos: false, sort: 'newest', page: 1 })
  const [state, setState] = useState<State>({ key: '', status: 'ready', data: null, failure: null })
  const [attempt, setAttempt] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const { rating, photos, sort, page } = filters

  // A new filter always starts at page 1.
  const change = (next: Partial<Filters>) => setFilters((current) => ({ ...current, page: 1, ...next }))

  const key = [productId, rating, photos, sort, page, attempt].join('|')
  useEffect(() => {
    const controller = new AbortController()
    fetchProductReviews(productId, { page, rating: rating || undefined, hasImages: photos, sortBy: sort }, { signal: controller.signal }).then(
      (data) => setState({ key, status: 'ready', data, failure: null }),
      (failure: unknown) => {
        if (!controller.signal.aborted) setState((current) => ({ key, status: 'error', data: current.data, failure }))
      },
    )
    return () => controller.abort()
  }, [key, productId, rating, photos, sort, page])

  const { data } = state
  const status = state.key === key ? state.status : 'loading'
  const summary = data?.summary
  const filtered = rating > 0 || photos
  const retry = (
    <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${KRAL_SECONDARY} mt-4`}>
      Try again
    </button>
  )
  const failureBox = (
    <div role="alert" className="border border-kral-rule p-5">
      <p className={MUTED}>{failureCopy(state.failure)}</p>
      {retry}
    </div>
  )

  let body
  if (!summary) {
    body = status === 'error' ? failureBox : <ProductReviewsSkeleton />
  } else if (summary.totalReviews === 0) {
    body = (
      <div className="border border-kral-rule p-6">
        <p className="font-kral-display text-lg leading-[1.05] font-extrabold text-kral-fg uppercase">No reviews yet</p>
        <p className={`${MUTED} mt-2 max-w-xl`}>Bought this piece? Share how it fits from your orders and help the next shopper choose.</p>
        <Link to="/orders" className={`${KRAL_PRIMARY} mt-4 w-fit`}>
          Go to your orders
        </Link>
      </div>
    )
  } else {
    const total = data.meta.total
    const start = (page - 1) * data.meta.limit
    const none = `No ${rating ? `${rating}-star reviews` : 'reviews'}${photos ? ' with photos' : ''}`
    body = (
      <>
        <div className="grid gap-6 md:grid-cols-[auto_1fr] md:gap-12">
          <div>
            <p className="font-kral-display text-5xl leading-none font-extrabold text-kral-fg tabular-nums">{summary.averageRating.toFixed(1)}</p>
            <div className="mt-3">
              <StarDisplay rating={Math.round(summary.averageRating)} />
            </div>
            <p className={`${MUTED} mt-2 tabular-nums`}>{plural(summary.totalReviews, 'review')}</p>
          </div>
          <ul aria-label="Reviews by rating" className="space-y-2 self-center">
            {STARS.map((n) => (
              <li key={n} className="font-kral-mono grid grid-cols-[4.5rem_1fr_3rem] whitespace-nowrap items-center gap-3 text-base text-kral-fg tabular-nums md:text-sm">
                <span>{plural(n, 'star')}</span>
                <span aria-hidden="true" className="block h-2 bg-kral-porcelain dark:bg-kral-graphite">
                  <span className="block h-full bg-kral-red-ink" style={{ width: `${(summary.ratingDistribution[n] / summary.totalReviews) * 100}%` }} />
                </span>
                <span className="text-right">{summary.ratingDistribution[n]}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter reviews" className="flex flex-wrap gap-2">
            {CHIP_STARS.map((n) => (
              <button key={n} type="button" aria-pressed={rating === n} onClick={() => change({ rating: rating === n ? 0 : n })} className={KRAL_CHIP}>
                {plural(n, 'star')}
              </button>
            ))}
            <button type="button" aria-pressed={photos} onClick={() => change({ photos: !photos })} className={KRAL_CHIP}>
              With photos
            </button>
          </div>
          <Select tone="kral" label="Sort reviews" triggerPrefix="Sort: " value={sort} options={SORTS} onChange={(next) => change({ sort: next })} className="min-h-11! sm:ml-auto" />
        </div>

        <div className="mt-6" aria-busy={status === 'loading'}>
          {status === 'loading' && <ReviewListSkeleton />}
          {status === 'error' && failureBox}
          {status === 'ready' && total === 0 && (
            <div className="border border-kral-rule p-6">
              <p className="font-kral-display text-lg leading-[1.05] font-extrabold text-kral-fg uppercase">{none}</p>
              <p className={`${MUTED} mt-2 max-w-xl`}>{filtered ? 'Nothing matches these filters. Clear them to see all the reviews for this piece.' : 'There are no reviews to show.'}</p>
              <button type="button" onClick={() => change({ rating: 0, photos: false })} className={`${KRAL_SECONDARY} mt-4`}>
                Clear filters
              </button>
            </div>
          )}
          {status === 'ready' && total > 0 && <ul>{data.data.map((review) => <ReviewRow key={review.id} review={review} />)}</ul>}
        </div>

        {status !== 'error' && data.meta.totalPages > 1 && (
          <Pagination
            tone="kral"
            page={page}
            pageCount={data.meta.totalPages}
            from={start + 1}
            to={Math.min(start + data.meta.limit, total)}
            total={total}
            onPage={(next) => {
              setFilters((current) => ({ ...current, page: next }))
              heading.current?.scrollIntoView?.({ block: 'start' })
            }}
          />
        )}
      </>
    )
  }

  return (
    <section aria-labelledby="product-reviews" className="mx-auto w-full max-w-6xl px-6 py-12 2xl:max-w-[88rem]">
      <h2 ref={heading} id="product-reviews" className={`${HEADING} mb-6 scroll-mt-28`}>
        Reviews
      </h2>
      {body}
    </section>
  )
}
