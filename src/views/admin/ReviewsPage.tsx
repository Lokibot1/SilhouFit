import { useCallback, useRef, useState } from 'react'
import { ReplyModal } from '../../components/admin/reviews/ReplyModal'
import { ReviewsTable } from '../../components/admin/reviews/ReviewsTable'
import { ConfirmDialog } from '../../components/admin/users/ConfirmDialog'
import { Pagination } from '../../components/shop/Pagination'
import { PAGER_FOOTER, PAGER_PAGINATION } from '../../components/staff/inventory/layout'
import { SectionError } from '../../components/staff/StaffSection'
import { STAFF_SECTION } from '../../components/staff/StaffSkeleton'
import { PAGER_ROWS } from '../../components/staff/transactions/layout'
import { useToast } from '../../components/toast/useToast'
import { SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { Checkbox } from '../../components/ui/Checkbox'
import { Select } from '../../components/ui/Select'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useSection } from '../../hooks/useSection'
import { ADMIN_REVIEWS_PER_PAGE, deleteReply, deleteReview, listAdminReviews, replyToReview, restoreReview, type AdminReview, type ReviewSort } from '../../service/reviewsApi'

const META_DESCRIPTION =
  'Read what customers say about SilhouFit products, reply to a review as the store, delete one that breaks the rules and restore it if it was a mistake.'

const SORTS: { value: ReviewSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'highest_rating', label: 'Highest rating' },
  { value: 'lowest_rating', label: 'Lowest rating' },
]
const RATINGS = [{ value: 0, label: 'All ratings' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: n, label: `${n} ${n === 1 ? 'star' : 'stars'}` }))]

/** What happened, why, and what to do, for a moderation request that failed. */
function failureCopy(failure: unknown, doing: string) {
  const { kind, detail } = (failure ?? {}) as { kind?: string; detail?: string }
  const head = `We couldn't ${doing}.`
  if (kind === 'network') return `${head} The connection dropped before the server answered. Check your connection, then try again.`
  if (kind === 'rate-limit') return `${head} Too many requests were sent in a short time. Wait a moment, then try again.`
  if (kind === 'not-found') return `${head} The review no longer exists, so someone may have removed it already. Reload the list to see what is there now.`
  if (kind === 'forbidden') return `${head} Your account is not allowed to do this, or your session ended. Sign in again, then try again.`
  if (kind === 'validation') return `${head} ${detail ?? 'The server did not accept it.'} Check what you entered, then try again.`
  return `${head} Something went wrong on our side. Try again in a moment.`
}

type Confirm = { kind: 'delete' | 'remove-reply'; review: AdminReview }

/** Customer reviews for staff: filter them, reply as the store, delete one and restore it. */
export function ReviewsPage() {
  useDocumentTitle('Reviews — SilhouFit')
  useMetaDescription(META_DESCRIPTION)
  const toast = useToast()

  const [filters, setFilters] = useState({ rating: 0, photos: false, deleted: false, sort: 'newest' as ReviewSort, page: 1 })
  const { rating, photos, deleted, sort, page } = filters
  // A new filter always starts at page 1.
  const change = (next: Partial<typeof filters>) => setFilters((current) => ({ ...current, page: 1, ...next }))
  const filtered = rating > 0 || photos

  // Counts up after every change, so the list reads again (its old rows stay until the new ones arrive).
  const [version, setVersion] = useState(0)
  const load = useCallback(
    (options: { signal?: AbortSignal }) =>
      listAdminReviews({ page, limit: ADMIN_REVIEWS_PER_PAGE, rating: rating || undefined, hasImages: photos, includeDeleted: deleted, sortBy: sort }, options),
    // A new version is a new request, though it is not read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [page, rating, photos, deleted, sort, version],
  )
  const { state, previous, retry } = useSection(load)
  const result = state.status === 'success' ? state.data : previous
  const stale = state.status === 'loading' && result !== undefined
  const rows = result?.data ?? null

  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const [reply, setReply] = useState<{ review: AdminReview; session: number; open: boolean; error: string | null } | null>(null)
  // Stays set while the dialog closes, so its text does not change as it fades out.
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [asking, setAsking] = useState(false)

  /** One request at a time: the buttons wait, and a double click cannot send it twice. */
  async function run(id: string, request: () => Promise<unknown>) {
    if (inFlight.current) return false
    inFlight.current = true
    setBusyId(id)
    setPending(true)
    try {
      await request()
      setVersion((n) => n + 1)
      return true
    } finally {
      inFlight.current = false
      setBusyId(null)
      setPending(false)
    }
  }

  async function restore(review: AdminReview) {
    try {
      if (await run(review.id, () => restoreReview(review.id))) toast.show({ kind: 'success', message: `${review.user.name}'s review is restored.` })
    } catch (failure) {
      toast.show({ kind: 'error', message: failureCopy(failure, 'restore the review'), action: { label: 'Retry', onClick: () => void restore(review) } })
    }
  }

  async function saveReply(text: string) {
    if (!reply) return
    const { review } = reply
    try {
      if (await run(review.id, () => replyToReview(review.id, text))) {
        setReply({ ...reply, open: false, error: null })
        toast.show({ kind: 'success', message: review.adminReply ? 'Reply updated.' : 'Reply posted.' })
      }
    } catch (failure) {
      setReply((current) => current && { ...current, error: failureCopy(failure, review.adminReply ? 'save the reply' : 'post the reply') })
    }
  }

  async function confirmed() {
    if (!confirm) return
    const { kind, review } = confirm
    try {
      const done = await run(review.id, () => (kind === 'delete' ? deleteReview(review.id) : deleteReply(review.id)))
      if (!done) return
      setAsking(false)
      toast.show(
        kind === 'delete'
          ? { kind: 'success', message: `${review.user.name}'s review is deleted.`, action: { label: 'Undo', onClick: () => void restore(review) } }
          : { kind: 'success', message: 'Reply removed.' },
      )
    } catch (failure) {
      setAsking(false)
      toast.show({ kind: 'error', message: failureCopy(failure, kind === 'delete' ? 'delete the review' : 'remove the reply') })
    }
  }

  const clearFilters = () => change({ rating: 0, photos: false })

  return (
    <div className="grid gap-3">
      <header className="flex min-h-8 flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl text-fg sm:text-3xl">Reviews</h1>
          <p className="mt-1 text-xs text-fg-muted">Customer reviews to reply to or take down</p>
        </div>
      </header>

      <section aria-labelledby="reviews-list" className={`${STAFF_SECTION} scroll-mt-14`}>
        <h2 id="reviews-list" className="sr-only">
          Reviews
        </h2>
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="w-full @sm:w-40">
            <Select label="Filter by rating" value={rating} options={RATINGS} onChange={(next) => change({ rating: next })} />
          </div>
          <div className="w-full @sm:w-44">
            <Select label="Sort reviews" value={sort} options={SORTS} onChange={(next) => change({ sort: next })} />
          </div>
          <Checkbox label="Only reviews with photos" checked={photos} onChange={(next) => change({ photos: next })}>
            With photos
          </Checkbox>
          <Checkbox label="Include deleted reviews" checked={deleted} onChange={(next) => change({ deleted: next })}>
            Include deleted
          </Checkbox>
        </div>
        <p role="status" className="sr-only">
          {state.status === 'loading' ? 'Loading reviews' : ''}
        </p>

        {state.status === 'error' && result && (
          <div className="mb-3 rounded-xl border border-line bg-canvas-sub p-3">
            <SectionError what="the latest reviews" kind={state.kind} onRetry={retry} />
            <p className="mt-3 text-sm text-fg-muted">The list below is from before your last change.</p>
          </div>
        )}

        {state.status === 'error' && !result ? (
          <SectionError what="the reviews" kind={state.kind} onRetry={retry} />
        ) : result && result.data.length === 0 && !stale ? (
          <div>
            {result.meta.total > 0 ? (
              <>
                <p className="text-base text-fg-muted">There are no reviews on page {page}.</p>
                <button type="button" onClick={() => setFilters((current) => ({ ...current, page: 1 }))} className={`${SECONDARY_BUTTON} mt-3`}>
                  Go to the first page
                </button>
              </>
            ) : filtered ? (
              <>
                <p className="text-base font-semibold text-fg">No reviews match</p>
                <p className="mt-1 text-base text-fg-muted">Clear the rating and photo filters to see every review.</p>
                <button type="button" onClick={clearFilters} className={`${SECONDARY_BUTTON} mt-3`}>
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-fg">No reviews yet</p>
                <p className="mt-1 text-base text-fg-muted">Reviews show here once customers rate the products they received.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <ReviewsTable
              rows={rows}
              stale={stale}
              skeletonRows={ADMIN_REVIEWS_PER_PAGE}
              busyId={busyId}
              onReply={(review) => setReply((old) => ({ review, session: (old?.session ?? 0) + 1, open: true, error: null }))}
              onRemoveReply={(review) => {
                setConfirm({ kind: 'remove-reply', review })
                setAsking(true)
              }}
              onDelete={(review) => {
                setConfirm({ kind: 'delete', review })
                setAsking(true)
              }}
              onRestore={(review) => void restore(review)}
            />
            {result && (
              <div className={PAGER_FOOTER}>
                <div className={`${PAGER_PAGINATION} ${PAGER_ROWS}`}>
                  <Pagination
                    page={page}
                    pageCount={Math.max(1, result.meta.totalPages)}
                    from={(page - 1) * ADMIN_REVIEWS_PER_PAGE + 1}
                    to={Math.min(page * ADMIN_REVIEWS_PER_PAGE, result.meta.total)}
                    total={result.meta.total}
                    onPage={(next) => setFilters((current) => ({ ...current, page: next }))}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {reply && (
        <ReplyModal
          key={reply.session}
          open={reply.open}
          review={reply.review}
          pending={pending}
          error={reply.error}
          onSave={(text) => void saveReply(text)}
          onClose={() => setReply({ ...reply, open: false })}
        />
      )}
      <ConfirmDialog
        open={asking}
        title={confirm?.kind === 'delete' ? `Delete ${confirm.review.user.name}'s review?` : 'Remove your reply?'}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete review' : 'Remove reply'}
        pending={pending}
        onConfirm={() => void confirmed()}
        onClose={() => setAsking(false)}
      >
        {confirm?.kind === 'delete'
          ? 'The review disappears from the product page. You can undo it right after, or restore it later by including deleted reviews.'
          : 'Shoppers stop seeing your reply under this review. You can write a new one at any time.'}
      </ConfirmDialog>
    </div>
  )
}
