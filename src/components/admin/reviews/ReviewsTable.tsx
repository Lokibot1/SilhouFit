import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { AdminReview } from '../../../service/reviewsApi'
import { formatOrderTime } from '../../../utils/format'
import { MessageIcon, PencilIcon, RestoreIcon, TrashIcon, XIcon } from '../../form/icons'
import { StarDisplay } from '../../orders/StarRating'
import { TD, TH } from '../../staff/inventory/layout'
import { RowIconButton } from '../../staff/measurements/RowIconButton'
import { REVIEW_HEADERS, REVIEW_ROW, ReviewCardSkeletonRows, ReviewTableSkeletonRows } from './ReviewsSkeleton'

export interface ReviewActionHandlers {
  onReply: (review: AdminReview) => void
  onRemoveReply: (review: AdminReview) => void
  onDelete: (review: AdminReview) => void
  onRestore: (review: AdminReview) => void
}

interface ReviewsTableProps extends ReviewActionHandlers {
  /** Null while the first answer is on its way. */
  rows: AdminReview[] | null
  /** The rows are from an earlier view and the next one is loading. */
  stale: boolean
  skeletonRows: number
  /** The review a request is running for: its buttons wait. */
  busyId: string | null
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The status in words and a dot, so it never rests on colour alone. */
function Badge({ label, dot }: { label: string; dot: string }) {
  return (
    <span className="font-ui inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-line-strong px-1.5 text-xs whitespace-nowrap text-fg">
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

function Status({ review, className = 'flex-wrap items-center' }: { review: AdminReview; className?: string }) {
  return (
    <div className={`flex gap-1 ${className}`}>
      {review.isDeleted ? <Badge label="Deleted" dot="bg-danger" /> : <Badge label="Published" dot="bg-success" />}
      {review.adminReply && <Badge label="Replied" dot="border-2 border-fg" />}
    </div>
  )
}

// The API sends no product name or order number yet, so the ids stand in; the product's id also opens its page.
const shortId = (id: string) => id.slice(0, 8)

function Product({ review }: { review: AdminReview }) {
  return (
    <Link to={`/shop/${encodeURIComponent(review.productId)}`} className="inline-flex min-h-11 items-center rounded-xl font-mono text-sm text-fg underline underline-offset-2 hover:text-chrome-strong">
      <span className="sr-only">Product </span>
      {shortId(review.productId)}
      <span className="sr-only">, order {shortId(review.orderId)}</span>
    </Link>
  )
}

function Content({ review }: { review: AdminReview }) {
  return (
    <>
      {review.comment ? <p className="line-clamp-2 text-sm break-words whitespace-pre-line text-fg">{review.comment}</p> : <p className="text-sm text-fg-muted">No comment</p>}
      {review.images.length > 0 && <p className="text-xs text-fg-muted tabular-nums">{plural(review.images.length, 'photo')}</p>}
      {review.adminReply && <p className="line-clamp-1 text-xs break-words text-fg-muted">Your reply: {review.adminReply}</p>}
    </>
  )
}

function Actions({ review, busy, onReply, onRemoveReply, onDelete, onRestore }: ReviewActionHandlers & { review: AdminReview; busy: boolean }) {
  const name = review.user.name
  // Icon-only like the other pages: the label is the accessible name and the tooltip.
  const button = (aria: string, icon: ReactNode, onClick: () => void) => <RowIconButton label={`${aria} ${name}'s review`} icon={icon} disabled={busy} onClick={onClick} />
  return (
    <div className="flex flex-nowrap items-center gap-2">
      {review.isDeleted ? (
        button('Restore', <RestoreIcon />, () => onRestore(review))
      ) : (
        <>
          {review.adminReply ? button('Edit your reply to', <PencilIcon />, () => onReply(review)) : button('Reply to', <MessageIcon size={16} />, () => onReply(review))}
          {review.adminReply && button('Remove your reply to', <XIcon />, () => onRemoveReply(review))}
          {button('Delete', <TrashIcon />, () => onDelete(review))}
        </>
      )}
    </div>
  )
}

const DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
const CLOCK = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true })

// Rating and Review have centred headers; the Review data stays left-aligned.
const ALIGN: Record<string, string> = { Rating: 'text-center', Review: 'text-center' }

/** The reviews: a table from the @4xl of its panel and cards below, each row with its own actions. */
export function ReviewsTable({ rows, stale, skeletonRows, busyId, ...handlers }: ReviewsTableProps) {
  const fade = `transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`
  return (
    <>
      <table aria-busy={rows === null || stale} className="hidden w-full border-separate border-spacing-0 @4xl:table">
        <caption className="sr-only">Reviews with reviewer, product, rating, review, date, status and actions</caption>
        <thead>
          <tr>
            {REVIEW_HEADERS.map((label) => (
              <th key={label} scope="col" className={ALIGN[label] ? TH.replace('text-left', ALIGN[label]) : TH}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={fade}>
          {rows === null ? (
            <ReviewTableSkeletonRows count={skeletonRows} />
          ) : (
            rows.map((review) => (
              <tr key={review.id} className={`${REVIEW_ROW} hover:bg-line/40`}>
                <td className={`${TD} text-sm text-fg`}>
                  <span className="block max-w-40 truncate">{review.user.name}</span>
                </td>
                <td className={TD}>
                  <Product review={review} />
                </td>
                <td className={`${TD} text-center`}>
                  <StarDisplay rating={review.rating} size={16} />
                </td>
                <td className={`${TD} max-w-xs py-2`}>
                  <Content review={review} />
                </td>
                <td className={`${TD} text-sm whitespace-nowrap text-fg-muted`}>
                  <time dateTime={review.createdAt} className="grid tabular-nums">
                    <span>{DAY.format(new Date(review.createdAt))}</span>
                    <span>{CLOCK.format(new Date(review.createdAt))}</span>
                  </time>
                </td>
                <td className={`${TD} w-px`}>
                  <Status review={review} className="flex-col items-center" />
                </td>
                <td className={`${TD} w-px py-2`}>
                  <Actions review={review} busy={busyId === review.id} {...handlers} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <ul aria-busy={rows === null || stale} aria-label="Reviews" className={`divide-y divide-line border-y border-line @4xl:hidden ${fade}`}>
        {rows === null ? (
          <ReviewCardSkeletonRows count={skeletonRows} />
        ) : (
          rows.map((review) => (
            <li key={review.id} className={`${REVIEW_ROW} grid content-center gap-2 py-3`}>
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-base font-semibold text-fg">{review.user.name}</p>
                <StarDisplay rating={review.rating} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3">
                <Product review={review} />
                <time dateTime={review.createdAt} className="text-sm text-fg-muted">
                  {formatOrderTime(review.createdAt)}
                </time>
              </div>
              <div>
                <Content review={review} />
              </div>
              <Status review={review} />
              <Actions review={review} busy={busyId === review.id} {...handlers} />
            </li>
          ))
        )}
      </ul>
    </>
  )
}
