import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { fetchMe } from '../../service/fetchMe'
import type { CustomerOrder } from '../../service/ordersApi'
import {
  createReview,
  fetchMyReviews,
  fetchPendingReviews,
  REVIEW_EDIT_WINDOW_DAYS,
  ReviewsError,
  updateReview,
  type PendingReview,
  type Review,
} from '../../service/reviewsApi'
import { AvatarUploadError, deleteAvatar, uploadAvatar } from '../../service/uploadAvatar'
import { formatOrderTime, variantLabel } from '../../utils/format'
import { PencilIcon } from '../form/icons'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../shop/shopControls'
import { useToast } from '../toast/useToast'
import { PhotoImg } from '../ui/PhotoImg'
import { ReviewMediaTile } from './ReviewMediaTile'
import { ReviewOrderModal, type ReviewFormInput } from './ReviewOrderModal'
import { StarDisplay } from './StarRating'

const SECTION = 'border border-kral-rule p-5'
const HEADING = 'font-kral-display text-lg leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-xl'
const MUTED = 'font-kral-mono text-base text-kral-muted md:text-sm'
const BLOCK = 'bg-kral-porcelain dark:bg-kral-graphite'
const REVIEW_BUCKET = 'reviews'

const SAVE_FAILED = "We couldn't save your review. The request failed, most likely because the connection dropped, so nothing was saved. Check your connection, then press the button again."
const UPLOAD_COPY = {
  invalid: "A photo was rejected by the server, most likely because of its type or size, so nothing was saved. Remove the photo or choose a JPG, PNG or WebP under 5 MB, then press the button again.",
  unauthorized: 'Your session ended before the photos were sent, so nothing was saved. Sign in again, then press the button again.',
  'rate-limit': 'Too many uploads were sent in a short time, so nothing was saved. Wait a moment, then press the button again.',
  network: "We couldn't send your photos. The connection dropped, so nothing was saved. Check your connection, then press the button again.",
  server: "We couldn't send your photos. The upload service didn't accept them, so nothing was saved. Try again in a moment.",
} as const

/** One product of the order: still to review, or reviewed (with the order line it matches, for its name and photo). */
type Row = { kind: 'pending'; key: string; name: string; image: string | null; pending: PendingReview } | { kind: 'reviewed'; key: string; name: string; image: string | null; review: Review }

interface Data {
  pending: PendingReview[]
  mine: Review[]
}

/** What the open dialog is for: a first review of a product, or an edit of a saved one. */
type Target = { kind: 'new'; row: Extract<Row, { kind: 'pending' }> } | { kind: 'edit'; row: Extract<Row, { kind: 'reviewed' }> }

function rowsOf(order: CustomerOrder, { pending, mine }: Data): Row[] {
  const waiting = pending.filter((p) => p.orderId === order.id).map((p): Row => ({ kind: 'pending', key: p.product.id, name: p.product.name, image: p.product.primaryImage, pending: p }))
  const done = mine
    .filter((r) => r.orderId === order.id)
    .map((review): Row => {
      const item = order.items.find((i) => review.purchasedVariants.some((v) => v.sku === i.sku))
      return { kind: 'reviewed', key: review.productId, name: item?.name ?? 'Product', image: item?.imageUrl ?? null, review }
    })
  return [...waiting, ...done]
}

// shortcut: mirrors REVIEW_EDIT_WINDOW_DAYS, read it from the API if it changes
const canEdit = (review: Review) => Date.now() - Date.parse(review.createdAt) <= REVIEW_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000

function saveFailure(error: unknown) {
  if (error instanceof AvatarUploadError) return UPLOAD_COPY[error.kind]
  if (error instanceof ReviewsError && error.detail && !(error.status && error.status >= 500)) return error.detail
  if (error instanceof ReviewsError && error.kind !== 'network') return "We couldn't save your review. Something went wrong on our side and your review wasn't posted. Your text and photos are still here - try again in a moment."
  return SAVE_FAILED
}

/** The customer's reviews of a delivered order, one row per product: write the ones still waiting, and edit a saved one for 30 days. */
export function OrderReviewSection({ order }: { order: CustomerOrder }) {
  const toast = useToast()
  const id = useId()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [data, setData] = useState<Data>({ pending: [], mine: [] })
  const [target, setTarget] = useState<Target | null>(null)
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const refocus = useRef<string | null>(null)

  const load = useCallback((signal?: AbortSignal, quiet = false) => {
    Promise.all([fetchPendingReviews({ signal }), fetchMyReviews({ signal })]).then(
      ([waiting, mine]) => {
        setData({ pending: waiting, mine })
        setStatus('ready')
      },
      (error: Error) => {
        if (error.name !== 'AbortError' && !quiet) setStatus('error')
      },
    )
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  // The button that held focus may be gone (a first review swaps "Review" for "Edit review"), so focus goes to its replacement.
  useEffect(() => {
    if (refocus.current) document.getElementById(`${id}-edit-${refocus.current}`)?.focus()
    refocus.current = null
  }, [data, id])

  async function save(current: Target, input: ReviewFormInput) {
    if (pending) return
    setPending(true)
    setProblem(null)
    const uploaded: string[] = []
    let owner = ''
    try {
      if (input.files.length) {
        owner = (await fetchMe()).id
        setProgress(0)
        for (const [i, file] of input.files.entries()) {
          uploaded.push(await uploadAvatar(file, owner, (percent) => setProgress(Math.round((i * 100 + percent) / input.files.length)), undefined, REVIEW_BUCKET))
        }
      }
      const comment = input.text.trim()
      const imageUrls = [...input.keptImages.map((image) => image.url), ...uploaded]
      if (current.kind === 'edit') await updateReview(current.row.review.id, { rating: input.rating, comment, imageUrls })
      else await createReview(order.id, current.row.pending.product.id, { rating: input.rating, comment, ...(input.orderItemId && { orderItemId: input.orderItemId }), ...(imageUrls.length > 0 && { imageUrls }) })
      toast.show({ kind: 'success', message: current.kind === 'edit' ? 'Review updated.' : 'Review posted.' })
      refocus.current = current.row.key
      setTarget(null)
      load(undefined, true)
    } catch (error) {
      // The photos were sent but no review holds them: remove them rather than leave them in the bucket.
      for (const url of uploaded) void deleteAvatar(url, owner, REVIEW_BUCKET)
      setProblem(saveFailure(error))
      if (error instanceof ReviewsError && ['already-reviewed', 'edit-window', 'removed'].includes(error.kind)) load(undefined, true)
    } finally {
      setPending(false)
      setProgress(null)
    }
  }

  const rows = rowsOf(order, data)
  const reviewing = target?.kind === 'new' ? target.row.pending : null
  const variantsOfProduct = reviewing?.variations.map((v) => ({ orderItemId: v.orderItemId, label: variantLabel(v.size, v.color) || 'Standard' }))
  let photoNo = 0
  return (
    <section aria-labelledby={`${id}-heading`} className={SECTION}>
      <h2 id={`${id}-heading`} className={HEADING}>
        Your reviews
      </h2>

      {status === 'loading' && (
        <div role="status" aria-label="Loading your reviews" className="mt-4 animate-pulse">
          <div className="flex gap-4">
            <div className={`h-24 w-18 shrink-0 ${BLOCK}`} />
            <div className="min-w-0 flex-1">
              <div className={`font-kral-mono text-base md:text-sm ${BLOCK}`}>&nbsp;</div>
              <div className={`font-kral-mono mt-1 w-2/3 text-base md:text-sm ${BLOCK}`}>&nbsp;</div>
              <div className={`mt-4 h-11 w-40 ${BLOCK}`} />
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="mt-3">
          <p className={MUTED}>We couldn&apos;t load your reviews. The request failed, most likely because the connection dropped. Your order is not affected. Check your connection, then try again.</p>
          <button
            type="button"
            onClick={() => {
              setStatus('loading')
              load()
            }}
            className={`${KRAL_SECONDARY} mt-4`}
          >
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && rows.length === 0 && <p className={`${MUTED} mt-3`}>There is nothing to review on this order. Items that are no longer in the shop can&apos;t be reviewed.</p>}

      {status === 'ready' && rows.length > 0 && (
        <ul className="mt-4 space-y-6">
          {rows.map((row) => (
            <li key={row.key} className="flex min-w-0 gap-4">
              <PhotoImg tone="kral" src={row.image} alt={row.name} loading="lazy" className="h-24 w-18 shrink-0 object-cover" />
              <div className="font-kral-mono min-w-0 flex-1">
                <h3 className="font-kral-display text-sm leading-tight font-extrabold [overflow-wrap:anywhere] text-kral-fg uppercase sm:text-base">{row.name}</h3>
                {row.kind === 'pending' ? (
                  <>
                    <p className={`${MUTED} mt-1`}>How did it go? Rate it, say a few words, and add photos if you like.</p>
                    <button type="button" aria-label={`Review ${row.name}`} onClick={() => { setProblem(null); setTarget({ kind: 'new', row }) }} className={`${KRAL_PRIMARY} mt-3`}>
                      Review
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mt-2">
                      <StarDisplay rating={row.review.rating} />
                    </div>
                    {row.review.comment && <p className={`${MUTED} mt-2 break-words whitespace-pre-line text-kral-fg`}>{row.review.comment}</p>}
                    {row.review.images.length > 0 && (
                      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {row.review.images.map((image) => (
                          <ReviewMediaTile key={image.id} name={`Photo ${photoNo + 1}`} url={image.url} label={`Photo ${++photoNo}: ${row.name}`} />
                        ))}
                      </ul>
                    )}
                    <p className={`${MUTED} mt-3 tabular-nums`}>Reviewed {formatOrderTime(row.review.createdAt)}</p>
                    {canEdit(row.review) ? (
                      <button id={`${id}-edit-${row.key}`} type="button" aria-label={`Edit review of ${row.name}`} onClick={() => { setProblem(null); setTarget({ kind: 'edit', row }) }} className={`${KRAL_SECONDARY} mt-3`}>
                        <PencilIcon />
                        Edit review
                      </button>
                    ) : (
                      <p className={`${MUTED} mt-1`}>Reviews can be edited for {REVIEW_EDIT_WINDOW_DAYS} days after posting. That time has passed.</p>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ReviewOrderModal
        open={target !== null}
        productName={target?.row.name ?? ''}
        orderNumber={order.orderNumber}
        initial={target?.kind === 'edit' ? { rating: target.row.review.rating, text: target.row.review.comment ?? '', images: target.row.review.images } : undefined}
        variants={variantsOfProduct}
        pending={pending}
        progress={progress}
        error={problem}
        onClose={() => {
          setProblem(null)
          setTarget(null)
        }}
        onSubmit={(input) => target && void save(target, input)}
      />
    </section>
  )
}
