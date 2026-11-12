// The customer's review of a delivered order: types, then a localStorage-backed service until the reviews API exists.
// shortcut: media bytes kept in tab memory, metadata in localStorage; replace with signed uploads to Supabase Storage when the reviews API lands.
import { checkReviewFile, isVideoFile, validateReview, type ReviewField } from '../utils/reviewValidation'
import { failParam } from './fetchStaffAnalytics'
import { simulateRequest, type RequestOptions } from './simulateRequest'

export interface ReviewMedia {
  id: string
  kind: 'photo' | 'video'
  name: string
  type: string
  size: number
}

export interface OrderReview {
  orderId: string
  /** 1 to 5. */
  rating: number
  /** Plain text. */
  text: string
  media: ReviewMedia[]
  createdAt: string
  updatedAt: string
}

/** What the form sends. `keepIds` is the saved media to keep when editing; `files` are the new ones. */
export interface ReviewInput {
  rating: number
  text: string
  keepIds?: string[]
  files: File[]
}

export const ORDER_REVIEWS_KEY = 'silhoufit.orderReviews.v1'

/** A rule broken by the request itself ('validation', with the form field it belongs to), or a second review for one order ('conflict'). */
export class ReviewError extends Error {
  kind: 'validation' | 'conflict' | 'not-found'
  field?: ReviewField
  constructor(message: string, kind: 'validation' | 'conflict' | 'not-found', field?: ReviewField) {
    super(message)
    this.kind = kind
    this.field = field
  }
}

/** Dev-only: ?fail=review-load (or review-save, review-delete) fails that request. */
const wait = (section: string, delayMs: number, signal?: AbortSignal) =>
  simulateRequest(delayMs, signal, () => failParam() === section).catch((error: Error) => {
    throw error.name === 'AbortError' ? error : Object.assign(error, { kind: 'network' })
  })

const isMedia = (raw: Partial<ReviewMedia> | null): raw is ReviewMedia =>
  typeof raw?.id === 'string' && (raw.kind === 'photo' || raw.kind === 'video') && typeof raw.name === 'string' && typeof raw.type === 'string' && typeof raw.size === 'number'

/** Reads what was saved; anything that does not look like a review is dropped. */
function load(): OrderReview[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(ORDER_REVIEWS_KEY) ?? 'null')
    if (!Array.isArray(saved)) return []
    return saved.flatMap((raw: Partial<OrderReview> | null): OrderReview[] => {
      if (typeof raw?.orderId !== 'string' || typeof raw.text !== 'string' || !Number.isInteger(raw.rating) || raw.rating! < 1 || raw.rating! > 5) return []
      const media = Array.isArray(raw.media) ? raw.media.filter(isMedia) : []
      return [{ orderId: raw.orderId, rating: raw.rating!, text: raw.text, media, createdAt: String(raw.createdAt ?? ''), updatedAt: String(raw.updatedAt ?? raw.createdAt ?? '') }]
    })
  } catch {
    return []
  }
}

let reviews = load()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** Object URLs of the photos and videos added in this visit; they do not survive a reload. */
const urls = new Map<string, string>()
export const mediaUrl = (id: string): string | undefined => urls.get(id)
function forget(media: ReviewMedia[]) {
  for (const { id } of media) {
    const url = urls.get(id)
    if (url) URL.revokeObjectURL(url)
    urls.delete(id)
  }
}

function commit(next: OrderReview[]) {
  reviews = next
  // Storage can be blocked or full, so the reviews then live for this tab only.
  try {
    localStorage.setItem(ORDER_REVIEWS_KEY, JSON.stringify(reviews))
  } catch {
    // Keep the in-memory reviews.
  }
  notify()
}

// Another tab changed the reviews.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== ORDER_REVIEWS_KEY && event.key !== null) return
    reviews = load()
    notify()
  })
}

/** Test seam: replaces every review. */
export const setOrderReviews = (next: OrderReview[]) => commit(next)

/** Called after every change, so a review on screen can load again. */
export function subscribeOrderReviews(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let nextMedia = 0
const find = (orderId: string) => reviews.find((r) => r.orderId === orderId)

/** The same rules the form uses, checked again where the data is saved; returns the new media, already stored in memory. */
function checkAndStore(input: ReviewInput, kept: ReviewMedia[]): ReviewMedia[] {
  const errors = validateReview(input)
  if (errors.rating) throw new ReviewError(errors.rating, 'validation', 'rating')
  if (errors.text) throw new ReviewError(errors.text, 'validation', 'text')
  const counts = { photos: kept.filter((m) => m.kind === 'photo').length, videos: kept.filter((m) => m.kind === 'video').length }
  const added = input.files.map((file) => {
    const problem = checkReviewFile(file, counts)
    if (problem) throw new ReviewError(problem, 'validation', 'media')
    const kind = isVideoFile(file) ? 'video' : 'photo'
    counts[kind === 'video' ? 'videos' : 'photos']++
    return { file, media: { id: `rm-${Date.now().toString(36)}-${++nextMedia}`, kind, name: file.name, type: file.type, size: file.size } satisfies ReviewMedia }
  })
  for (const { file, media } of added) urls.set(media.id, URL.createObjectURL(file))
  return added.map(({ media }) => media)
}

/** REPLACE: GET /orders/:id/review -> OrderReview, or 404 when the order has none (returned here as null). */
export async function getOrderReview(orderId: string, { signal, delayMs = 500 }: RequestOptions = {}): Promise<OrderReview | null> {
  await wait('review-load', delayMs, signal)
  return find(orderId) ?? null
}

/**
 * REPLACE: POST /orders/:id/review with { rating, text, mediaPaths[] } -> OrderReview; 409 when the order has one already, 422 when it is not DELIVERED
 * or a rule is broken (with `field`). Each photo or video is first sent with POST /orders/:id/review/uploads, which returns a signed upload URL and the path to send here.
 */
export async function createOrderReview(orderId: string, input: ReviewInput, { signal, delayMs = 800 }: RequestOptions = {}): Promise<OrderReview> {
  await wait('review-save', delayMs, signal)
  if (find(orderId)) throw new ReviewError('This order already has a review.', 'conflict')
  const media = checkAndStore(input, [])
  const now = new Date().toISOString()
  const created: OrderReview = { orderId, rating: input.rating, text: input.text.trim(), media, createdAt: now, updatedAt: now }
  commit([...reviews, created])
  return created
}

/** REPLACE: PATCH /orders/:id/review with { rating, text, mediaPaths[] } (the paths to keep plus the new uploads) -> OrderReview; 404 when there is none. */
export async function updateOrderReview(orderId: string, input: ReviewInput, { signal, delayMs = 800 }: RequestOptions = {}): Promise<OrderReview> {
  await wait('review-save', delayMs, signal)
  const current = find(orderId)
  if (!current) throw new ReviewError('This order has no review.', 'not-found')
  const kept = current.media.filter((m) => input.keepIds?.includes(m.id))
  const added = checkAndStore(input, kept)
  forget(current.media.filter((m) => !kept.includes(m)))
  const saved: OrderReview = { ...current, rating: input.rating, text: input.text.trim(), media: [...kept, ...added], updatedAt: new Date().toISOString() }
  commit(reviews.map((r) => (r.orderId === orderId ? saved : r)))
  return saved
}

/** REPLACE: DELETE /orders/:id/review. */
export async function deleteOrderReview(orderId: string, { signal, delayMs = 600 }: RequestOptions = {}): Promise<void> {
  await wait('review-delete', delayMs, signal)
  const current = find(orderId)
  if (!current) throw new ReviewError('This order has no review.', 'not-found')
  forget(current.media)
  commit(reviews.filter((r) => r.orderId !== orderId))
}
