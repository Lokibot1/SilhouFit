import { useCallback, useEffect, useRef, useState } from 'react'
import { createOrderReview, deleteOrderReview, getOrderReview, mediaUrl, ReviewError, subscribeOrderReviews, updateOrderReview, type OrderReview, type ReviewInput } from '../../service/orderReviews'
import type { CustomerOrder } from '../../service/ordersApi'
import { formatOrderTime } from '../../utils/format'
import { ConfirmDialog } from '../admin/users/ConfirmDialog'
import { PencilIcon, TrashIcon } from '../form/icons'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../shop/shopControls'
import { useToast } from '../toast/useToast'
import { SampleDataBadge } from '../ui/SampleDataBadge'
import { ReviewMediaTile } from './ReviewMediaTile'
import { ReviewOrderModal } from './ReviewOrderModal'
import { StarDisplay } from './StarRating'

const SECTION = 'border border-kral-rule p-5'
const HEADING = 'font-kral-display text-lg leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-xl'
const MUTED = 'font-kral-mono text-base text-kral-muted md:text-sm'
const BLOCK = 'bg-kral-porcelain dark:bg-kral-graphite'

const SAVE_FAILED = "We couldn't save your review. The request failed, most likely because the connection dropped, so nothing was saved. Check your connection, then press the button again."

/** The customer's review of a delivered order: loads it, and offers to write, edit or delete it. */
export function OrderReviewSection({ order }: { order: CustomerOrder }) {
  const toast = useToast()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [review, setReview] = useState<OrderReview | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const refocus = useRef<'edit' | 'add' | null>(null)

  const load = useCallback(
    (signal?: AbortSignal, quiet = false) => {
      getOrderReview(order.id, { signal, delayMs: quiet ? 0 : undefined }).then(
        (next) => {
          setReview(next)
          setStatus('ready')
        },
        (error: Error) => {
          if (error.name !== 'AbortError' && !quiet) setStatus('error')
        },
      )
    },
    [order.id],
  )
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    // A save in this tab, or a change in another one.
    const stop = subscribeOrderReviews(() => load(controller.signal, true))
    return () => {
      controller.abort()
      stop()
    }
  }, [load])

  // The button that held focus may be gone (after a first review or a delete), so focus goes to its replacement.
  useEffect(() => {
    if (refocus.current) (refocus.current === 'edit' ? editButton : addButton).current?.focus()
    refocus.current = null
  }, [review])

  async function save(input: ReviewInput) {
    if (pending) return
    setPending(true)
    setProblem(null)
    try {
      if (review) await updateOrderReview(order.id, input)
      else await createOrderReview(order.id, input)
      toast.show({ kind: 'success', message: review ? 'Review updated.' : 'Review posted.' })
      refocus.current = 'edit'
      setEditing(false)
    } catch (error) {
      if (error instanceof ReviewError && error.kind === 'conflict') {
        setProblem('This order already has a review, possibly from another tab. Close this window to see it, then press Edit review.')
        load(undefined, true)
      } else setProblem(error instanceof ReviewError ? error.message : SAVE_FAILED)
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (pending) return
    setPending(true)
    setProblem(null)
    try {
      await deleteOrderReview(order.id)
      toast.show({ kind: 'success', message: 'Review deleted.' })
      refocus.current = 'add'
      setDeleting(false)
    } catch {
      setProblem("We couldn't delete your review. The request failed, most likely because the connection dropped, so it is still there. Check your connection, then press Delete review again.")
    } finally {
      setPending(false)
    }
  }

  let photoNo = 0
  return (
    <section aria-labelledby="order-review" className={SECTION}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="order-review" className={HEADING}>
          Your review
        </h2>
        <SampleDataBadge tone="kral" reason="Reviews are saved in this browser only until the reviews service exists; photos and videos last for this visit." />
      </div>

      {status === 'loading' && (
        <div role="status" aria-label="Loading your review" className="animate-pulse">
          <div className={`font-kral-mono mt-3 text-base ${BLOCK}`}>&nbsp;</div>
          <div className={`font-kral-mono mt-1 text-base md:text-sm ${BLOCK}`}>&nbsp;</div>
          <div className={`mt-4 h-11 w-40 ${BLOCK}`} />
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="mt-3">
          <p className={MUTED}>We couldn&apos;t load your review. The request failed, most likely because the connection dropped. Your order is not affected. Check your connection, then try again.</p>
          <button type="button" onClick={() => {
              setStatus('loading')
              load()
            }} className={`${KRAL_SECONDARY} mt-4`}>
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && !review && (
        <>
          <p className="font-kral-mono mt-3 text-base font-medium text-kral-fg">How did this order go?</p>
          <p className={`${MUTED} mt-1`}>Rate it, say a few words, and add photos or a video if you like.</p>
          <button ref={addButton} type="button" onClick={() => setEditing(true)} className={`${KRAL_PRIMARY} mt-4`}>
            Review order
          </button>
        </>
      )}

      {status === 'ready' && review && (
        <div className="mt-3">
          <StarDisplay rating={review.rating} />
          <p className={`${MUTED} mt-3 break-words whitespace-pre-line text-kral-fg`}>{review.text}</p>
          {review.media.length > 0 && (
            <ul className="mt-4 grid grid-cols-2 gap-2 min-[480px]:grid-cols-3 sm:grid-cols-5">
              {review.media.map((m) => (
                <ReviewMediaTile key={m.id} kind={m.kind} name={m.name} url={mediaUrl(m.id)} label={m.kind === 'photo' ? `Photo ${++photoNo}: ${m.name}` : `Video: ${m.name}`} />
              ))}
            </ul>
          )}
          <p className={`${MUTED} mt-4 tabular-nums`}>
            Reviewed {formatOrderTime(review.updatedAt)}
            {review.updatedAt !== review.createdAt && ' (edited)'}
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button ref={editButton} type="button" onClick={() => setEditing(true)} className={KRAL_SECONDARY}>
              <PencilIcon />
              Edit review
            </button>
            <button
              type="button"
              onClick={() => {
                setProblem(null)
                setDeleting(true)
              }}
              className={KRAL_SECONDARY}
            >
              <TrashIcon />
              Delete review
            </button>
          </div>
        </div>
      )}

      <ReviewOrderModal
        open={editing}
        orderNumber={order.orderNumber}
        initial={review ?? undefined}
        pending={pending}
        error={problem}
        onClose={() => {
          setProblem(null)
          setEditing(false)
        }}
        onSubmit={(input) => void save(input)}
      />
      <ConfirmDialog tone="kral" open={deleting} title="Delete this review?" confirmLabel="Delete review" pending={pending} onConfirm={() => void remove()} onClose={() => setDeleting(false)}>
        <p>Your rating, text, photos and video will be removed from this order. This can&apos;t be undone.</p>
        {problem && deleting && (
          <p role="alert" className="mt-3 text-danger">
            {problem}
          </p>
        )}
      </ConfirmDialog>
    </section>
  )
}
