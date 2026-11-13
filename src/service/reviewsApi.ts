import { ProductListError, request, type ProductListErrorKind } from './fetchProductList'
import { isMoney, isRecord, text } from './ordersApi'
import type { RequestOptions } from './simulateRequest'

export const REVIEWS_PER_PAGE = 10
// shortcut: mirrors REVIEW_EDIT_WINDOW_DAYS, read it from the API if it changes
export const REVIEW_EDIT_WINDOW_DAYS = 30

export type ReviewSort = 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating'

export interface ReviewImage {
  id: string
  url: string
}

export interface Review {
  id: string
  orderId: string
  productId: string
  /** 1 to 5. */
  rating: number
  comment: string | null
  user: { id: string; name: string; avatarUrl: string | null }
  images: ReviewImage[]
  /** The variants of the product the reviewer bought in that order. */
  purchasedVariants: { size: string | null; color: string | null; sku: string }[]
  adminReply: string | null
  adminRepliedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ReviewSummary {
  averageRating: number
  totalReviews: number
  /** Reviews per star count. */
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>
}

export interface ReviewsMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ProductReviewsPage {
  data: Review[]
  meta: ReviewsMeta
  summary: ReviewSummary
}

/** A delivered product the customer has not reviewed yet. */
export interface PendingReview {
  orderId: string
  orderNumber: string
  deliveredAt: string | null
  product: { id: string; name: string; slug: string; primaryImage: string | null }
  variations: { orderItemId: string; variantId: string | null; size: string | null; color: string | null; quantity: number }[]
}

export interface ReviewBody {
  rating: number
  comment?: string
  /** The order line the customer bought, when the order holds several variants of the product. */
  orderItemId?: string
  /** On an update these replace every photo the review has. */
  imageUrls?: string[]
}

/** 'already-reviewed': this order and product have a review. 'removed': moderation took the review down. 'edit-window': the review is too old to edit. */
export type ReviewsErrorKind = ProductListErrorKind | 'already-reviewed' | 'removed' | 'edit-window'

export class ReviewsError extends Error {
  kind: ReviewsErrorKind
  /** Copy the screen can show as it is (what happened, why, what to do), when the server's answer allows one. */
  detail?: string
  status?: number

  constructor(kind: ReviewsErrorKind, detail?: string, status?: number) {
    super(`The reviews request failed (${kind}).`)
    this.kind = kind
    this.detail = detail
    this.status = status
  }
}

type Operation = 'read' | 'create' | 'update' | 'moderate'

/** Turns the API's failure into one the screen can explain; an abort passes through untouched. */
function toReviewsError(failure: unknown, operation: Operation): unknown {
  if (!(failure instanceof ProductListError)) return failure
  const { kind, detail, status } = failure
  const told = detail ?? ''
  if (operation === 'create' && kind === 'conflict') {
    return new ReviewsError('already-reviewed', 'You already reviewed this product on this order, possibly from another tab or device. Reload the page to see your review, then edit it if you want to change it.', status)
  }
  if (operation === 'create' && status === 403 && /moderation/i.test(told)) {
    return new ReviewsError('removed', 'This review was removed by our moderators, so it cannot be posted again. Contact support if you think this was a mistake.', status)
  }
  if (operation === 'update' && kind === 'validation' && /within \d+ days/i.test(told)) {
    return new ReviewsError('edit-window', `Reviews can only be edited within ${REVIEW_EDIT_WINDOW_DAYS} days of posting, and this one is past that. Your review stays as it is.`, status)
  }
  if (kind === 'forbidden') return new ReviewsError('forbidden', 'Your session ended. Sign in again, then try again.', status)
  return new ReviewsError(kind, told || undefined, status)
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body: unknown, signal: AbortSignal | undefined, operation: Operation) {
  try {
    return await request(method, path, body, signal)
  } catch (failure) {
    throw toReviewsError(failure, operation)
  }
}

const bad = () => new ReviewsError('server')

function toReview(value: unknown): Review {
  if (!isRecord(value) || !isRecord(value.user)) throw bad()
  const { id, orderId, productId, rating, createdAt, updatedAt } = value
  if (typeof id !== 'string' || typeof orderId !== 'string' || typeof productId !== 'string' || typeof createdAt !== 'string') throw bad()
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5 || typeof value.user.id !== 'string') throw bad()
  const { user } = value
  return {
    id,
    orderId,
    productId,
    rating,
    comment: text(value.comment),
    user: {
      id: user.id as string,
      name: text(user.fullName) ?? ([text(user.firstName), text(user.lastName)].filter(Boolean).join(' ') || 'SilhouFit customer'),
      avatarUrl: text(user.avatarUrl),
    },
    images: (Array.isArray(value.images) ? value.images : []).filter(isRecord).flatMap((image) => (typeof image.id === 'string' && typeof image.url === 'string' ? [{ id: image.id, url: image.url }] : [])),
    purchasedVariants: (Array.isArray(value.purchasedVariants) ? value.purchasedVariants : []).filter(isRecord).map((variant) => ({ size: text(variant.size), color: text(variant.color), sku: typeof variant.sku === 'string' ? variant.sku : '' })),
    adminReply: text(value.adminReply),
    adminRepliedAt: text(value.adminRepliedAt),
    createdAt,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : createdAt,
  }
}

function toSummary(value: unknown): ReviewSummary {
  if (!isRecord(value) || !isMoney(value.averageRating) || !isMoney(value.totalReviews) || !isRecord(value.ratingDistribution)) throw bad()
  const d = value.ratingDistribution
  const count = (n: number) => (isMoney(d[n]) ? d[n] : 0)
  return { averageRating: value.averageRating, totalReviews: value.totalReviews, ratingDistribution: { 1: count(1), 2: count(2), 3: count(3), 4: count(4), 5: count(5) } }
}

function toMeta(value: unknown): ReviewsMeta {
  if (!isRecord(value) || !isMoney(value.total)) throw bad()
  return { total: value.total, page: Number(value.page) || 1, limit: Number(value.limit) || REVIEWS_PER_PAGE, totalPages: Number(value.totalPages) || 1 }
}

function toList(body: unknown) {
  if (!isRecord(body) || !Array.isArray(body.data)) throw bad()
  return { data: body.data.map(toReview), meta: toMeta(body.meta), body }
}

export interface ProductReviewsParams {
  page?: number
  /** 1 to 5; absent lists every rating. */
  rating?: number
  hasImages?: boolean
  sortBy?: ReviewSort
}

/** GET /products/:productId/reviews (public). The answer carries the product's rating summary, so no second request is made. */
export async function fetchProductReviews(productId: string, { page = 1, rating, hasImages, sortBy = 'newest' }: ProductReviewsParams = {}, { signal }: RequestOptions = {}): Promise<ProductReviewsPage> {
  const query = new URLSearchParams({ page: String(page), limit: String(REVIEWS_PER_PAGE), sortBy })
  if (rating !== undefined) query.set('rating', String(rating))
  if (hasImages) query.set('hasImages', 'true')
  const { data, meta, body } = toList(await call('GET', `/products/${encodeURIComponent(productId)}/reviews?${query}`, undefined, signal, 'read'))
  return { data, meta, summary: toSummary(body.summary) }
}

const MAX_PAGES = 20

/** GET /reviews/me, every page (50 a page), newest first. */
export async function fetchMyReviews({ signal }: RequestOptions = {}): Promise<Review[]> {
  const all: Review[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, meta } = toList(await call('GET', `/reviews/me?page=${page}&limit=50`, undefined, signal, 'read'))
    all.push(...data)
    if (page >= meta.totalPages) break
  }
  return all
}

function toPending(value: unknown): PendingReview {
  if (!isRecord(value) || !isRecord(value.product) || !Array.isArray(value.variations)) throw bad()
  const { orderId, orderNumber } = value
  const { product } = value
  if (typeof orderId !== 'string' || typeof orderNumber !== 'string' || typeof product.id !== 'string' || typeof product.name !== 'string') throw bad()
  return {
    orderId,
    orderNumber,
    deliveredAt: text(value.deliveredAt),
    product: { id: product.id, name: product.name, slug: typeof product.slug === 'string' ? product.slug : '', primaryImage: text(product.primaryImage) },
    variations: value.variations.filter(isRecord).flatMap((v) =>
      typeof v.orderItemId === 'string' ? [{ orderItemId: v.orderItemId, variantId: text(v.variantId), size: text(v.size), color: text(v.color), quantity: isMoney(v.quantity) ? v.quantity : 1 }] : [],
    ),
  }
}

/** GET /reviews/pending: delivered products from the customer's orders that still await a review. */
export async function fetchPendingReviews({ signal }: RequestOptions = {}): Promise<PendingReview[]> {
  const body = await call('GET', '/reviews/pending', undefined, signal, 'read')
  if (!Array.isArray(body)) throw bad()
  return body.map(toPending)
}

/** POST /orders/:orderId/products/:productId/reviews. One review per product per order, whatever the variant. */
export async function createReview(orderId: string, productId: string, body: ReviewBody, { signal }: RequestOptions = {}): Promise<Review> {
  return toReview(await call('POST', `/orders/${encodeURIComponent(orderId)}/products/${encodeURIComponent(productId)}/reviews`, body, signal, 'create'))
}

/** PATCH /reviews/:id. Only the fields sent change; `imageUrls` replaces all the photos. */
export async function updateReview(id: string, body: Omit<ReviewBody, 'orderItemId'>, { signal }: RequestOptions = {}): Promise<Review> {
  return toReview(await call('PATCH', `/reviews/${encodeURIComponent(id)}`, body, signal, 'update'))
}

/** A review as staff see it: it also says whether moderation deleted it. */
export interface AdminReview extends Review {
  isDeleted: boolean
}

export interface AdminReviewsPage {
  data: AdminReview[]
  meta: ReviewsMeta
}

export interface AdminReviewsParams {
  page?: number
  limit?: number
  /** 1 to 5; absent lists every rating. */
  rating?: number
  hasImages?: boolean
  /** Deleted reviews are left out unless this is on. */
  includeDeleted?: boolean
  sortBy?: ReviewSort
}

export const ADMIN_REVIEWS_PER_PAGE = 20
/** The API's limit on a reply. */
export const REPLY_MAX = 2000

const toAdminReview = (value: unknown): AdminReview => ({ ...toReview(value), isDeleted: isRecord(value) && value.isDeleted === true })

/** GET /admin/reviews (staff role or above). Pass only the keys the API knows: it rejects others. */
export async function listAdminReviews({ page = 1, limit = ADMIN_REVIEWS_PER_PAGE, rating, hasImages, includeDeleted, sortBy = 'newest' }: AdminReviewsParams = {}, { signal }: RequestOptions = {}): Promise<AdminReviewsPage> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit), sortBy })
  if (rating !== undefined) query.set('rating', String(rating))
  if (hasImages) query.set('hasImages', 'true')
  if (includeDeleted) query.set('includeDeleted', 'true')
  const body = await call('GET', `/admin/reviews?${query}`, undefined, signal, 'read')
  if (!isRecord(body) || !Array.isArray(body.data)) throw bad()
  return { data: body.data.map(toAdminReview), meta: toMeta(body.meta) }
}

const moderate = async (method: 'POST' | 'DELETE', path: string, body?: unknown) => toAdminReview(await call(method, `/admin/reviews/${path}`, body, undefined, 'moderate'))

/** DELETE /admin/reviews/:id: hides the review (a soft delete that restoreReview undoes). */
export const deleteReview = (id: string) => moderate('DELETE', encodeURIComponent(id))

/** POST /admin/reviews/:id/restore. */
export const restoreReview = (id: string) => moderate('POST', `${encodeURIComponent(id)}/restore`)

/** POST /admin/reviews/:id/reply: posts the reply, or replaces the one there. */
export const replyToReview = (id: string, reply: string) => moderate('POST', `${encodeURIComponent(id)}/reply`, { reply })

/** DELETE /admin/reviews/:id/reply. */
export const deleteReply = (id: string) => moderate('DELETE', `${encodeURIComponent(id)}/reply`)
