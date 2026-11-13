import type { Page, Route } from '@playwright/test'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info, x-upsert',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const PAGE_ORIGIN = 'http://localhost:5173'

/** A review as the API sends it (ReviewResponseDto). */
export interface ApiReview {
  id: string
  orderId: string
  productId: string
  rating: number
  comment: string | null
  user: { id: string; firstName: string; lastName: string; fullName: string | null; avatarUrl: string | null }
  images: { id: string; url: string; displayOrder: number }[]
  purchasedVariants: { size: string | null; color: string | null; sku: string }[]
  adminReply: string | null
  adminRepliedAt: string | null
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export const reviewId = (n: number) => `00000000-0000-4000-8000-${String(500000 + n).padStart(12, '0')}`

/** An inline 8x8 grey SVG, served for every review photo so no request hangs. */
export const PHOTO_HOST = 'https://photos.silhoufit.test'

export function apiReview(n: number, over: Partial<ApiReview> = {}): ApiReview {
  return {
    id: reviewId(n),
    orderId: '00000000-0000-4000-8000-000000900007',
    productId: '00000000-0000-4000-8000-000000000001',
    rating: 5,
    comment: `Review number ${n}, fits true to size.`,
    user: { id: `user-${n}`, firstName: 'Reviewer', lastName: `Number${n}`, fullName: `Reviewer Number${n}`, avatarUrl: null },
    images: [],
    purchasedVariants: [{ size: 'M', color: 'Black', sku: 'LS-BLK-M' }],
    adminReply: null,
    adminRepliedAt: null,
    isDeleted: false,
    createdAt: new Date(Date.UTC(2026, 10, 1, 2, 0) - n * 3_600_000).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 10, 1, 2, 0) - n * 3_600_000).toISOString(),
    ...over,
  }
}

export const apiPhotos = (count: number, prefix = 'p') =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i + 1}`, url: `${PHOTO_HOST}/${prefix}-${i + 1}.svg`, displayOrder: i }))

export interface ApiPending {
  orderId: string
  orderNumber: string
  deliveredAt: string | null
  product: { id: string; name: string; slug: string; primaryImage: string | null }
  variations: { orderItemId: string; variantId: string | null; size: string | null; color: string | null; quantity: number }[]
}

export type Reply = { status: number; json: unknown } | 'abort' | undefined

export interface ReviewsMock {
  /** What GET /products/:id/reviews serves (all ratings). Filtering, sorting and paging follow the request. */
  list: ApiReview[]
  /** GET /reviews/pending. */
  pending: ApiPending[]
  /** GET /reviews/me. */
  mine: ApiReview[]
  /** The query strings of GET /products/:id/reviews, in order. */
  listQueries: URLSearchParams[]
  /** The bodies of POST /orders/:orderId/products/:productId/reviews, with the ids from the path. */
  creates: { orderId: string; productId: string; body: Record<string, unknown> }[]
  /** The bodies of PATCH /reviews/:id. */
  updates: { id: string; body: Record<string, unknown> }[]
  /** Paths of the files sent to the Supabase `reviews` bucket. */
  uploads: string[]
  /** What GET /admin/reviews serves, and what the moderation endpoints change. */
  admin: ApiReview[]
  /** The query strings of GET /admin/reviews, in order. */
  adminQueries: URLSearchParams[]
  /** Every moderation request: DELETE /admin/reviews/:id, POST .../restore, POST and DELETE .../reply. */
  moderation: { method: string; id: string; action: 'delete' | 'restore' | 'reply' | 'delete-reply'; body: Record<string, unknown> }[]
  /** Overrides for the next request of a kind: a reply, 'abort', or undefined to answer normally. */
  on: {
    list?: (query: URLSearchParams) => Reply
    pending?: () => Reply
    create?: (body: Record<string, unknown>) => Reply
    update?: (body: Record<string, unknown>) => Reply
    adminList?: (query: URLSearchParams) => Reply
    /** Answers a moderation request (the change is then not made). */
    moderate?: (action: 'delete' | 'restore' | 'reply' | 'delete-reply') => Reply
  }
}

/** The pagination envelope and the rating summary of a set of reviews, as the API sends them. */
const summaryOf = (all: ApiReview[]) => {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>
  for (const r of all) dist[r.rating]++
  const total = all.length
  const average = total ? all.reduce((s, r) => s + r.rating, 0) / total : 0
  return { averageRating: Math.round(average * 10) / 10, totalReviews: total, ratingDistribution: dist }
}

/**
 * Stands in for the reviews API: GET /products/:id/reviews (rating, hasImages, sortBy, page, limit; the summary always covers every
 * review), GET /reviews/pending, GET /reviews/me, POST /orders/:orderId/products/:productId/reviews (201, builds the review from the body,
 * moves the product from pending to mine) and PATCH /reviews/:id, plus the Supabase Storage `reviews` bucket (200 for every upload).
 * Register it after mockAuth, mockProducts and mockOrders: those also match these paths and the later route wins.
 */
export async function mockReviews(page: Page, initial: { list?: ApiReview[]; pending?: ApiPending[]; mine?: ApiReview[]; admin?: ApiReview[] } = {}): Promise<ReviewsMock> {
  const mock: ReviewsMock = { list: initial.list ?? [], pending: initial.pending ?? [], mine: initial.mine ?? [], listQueries: [], creates: [], updates: [], uploads: [], admin: initial.admin ?? [], adminQueries: [], moderation: [], on: {} }
  let created = 0

  const reply = async (route: Route, r: Exclude<Reply, undefined>) => {
    if (r === 'abort') return route.abort('connectionreset')
    return route.fulfill({ status: r.status, json: r.json, headers: CORS })
  }

  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/products\/[^/]+\/reviews$/.test(url.pathname), async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const query = new URL(request.url()).searchParams
    mock.listQueries.push(query)
    const override = mock.on.list?.(query)
    if (override) return reply(route, override)
    const rating = Number(query.get('rating')) || 0
    const limit = Number(query.get('limit')) || 10
    const pageNo = Number(query.get('page')) || 1
    const sortBy = query.get('sortBy') ?? 'newest'
    const matched = mock.list
      .filter((r) => !rating || r.rating === rating)
      .filter((r) => query.get('hasImages') !== 'true' || r.images.length > 0)
      .sort((a, b) => {
        if (sortBy === 'oldest') return a.createdAt.localeCompare(b.createdAt)
        if (sortBy === 'highest_rating') return b.rating - a.rating || b.createdAt.localeCompare(a.createdAt)
        if (sortBy === 'lowest_rating') return a.rating - b.rating || b.createdAt.localeCompare(a.createdAt)
        return b.createdAt.localeCompare(a.createdAt)
      })
    return reply(route, {
      status: 200,
      json: {
        data: matched.slice((pageNo - 1) * limit, pageNo * limit),
        meta: { total: matched.length, page: pageNo, limit, totalPages: Math.ceil(matched.length / limit) },
        summary: summaryOf(mock.list),
      },
    })
  })

  // GET /admin/reviews (rating, hasImages, includeDeleted, sortBy, page, limit) and the moderation endpoints, which change `mock.admin` like the API does.
  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/admin\/reviews(\/|$)/.test(url.pathname), async (route) => {
    const request = route.request()
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const [, , , id = '', sub = ''] = new URL(request.url()).pathname.split('/')
    if (method === 'GET') {
      const query = new URL(request.url()).searchParams
      mock.adminQueries.push(query)
      const override = mock.on.adminList?.(query)
      if (override) return reply(route, override)
      const rating = Number(query.get('rating')) || 0
      const limit = Number(query.get('limit')) || 20
      const pageNo = Number(query.get('page')) || 1
      const sortBy = query.get('sortBy') ?? 'newest'
      const matched = mock.admin
        .filter((r) => query.get('includeDeleted') === 'true' || !r.isDeleted)
        .filter((r) => !rating || r.rating === rating)
        .filter((r) => query.get('hasImages') !== 'true' || r.images.length > 0)
        .sort((a, b) => {
          if (sortBy === 'oldest') return a.createdAt.localeCompare(b.createdAt)
          if (sortBy === 'highest_rating') return b.rating - a.rating || b.createdAt.localeCompare(a.createdAt)
          if (sortBy === 'lowest_rating') return a.rating - b.rating || b.createdAt.localeCompare(a.createdAt)
          return b.createdAt.localeCompare(a.createdAt)
        })
      return reply(route, { status: 200, json: { data: matched.slice((pageNo - 1) * limit, pageNo * limit), meta: { total: matched.length, page: pageNo, limit, totalPages: Math.ceil(matched.length / limit) } } })
    }
    const action = sub === 'restore' ? 'restore' : sub === 'reply' ? (method === 'POST' ? 'reply' : 'delete-reply') : 'delete'
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
    mock.moderation.push({ method, id, action, body })
    const override = mock.on.moderate?.(action)
    if (override) return reply(route, override)
    const found = mock.admin.find((r) => r.id === id)
    if (!found) return reply(route, { status: 404, json: { statusCode: 404, message: 'Review not found', error: 'Not Found' } })
    if (action === 'delete') found.isDeleted = true
    if (action === 'restore') found.isDeleted = false
    if (action === 'reply') {
      found.adminReply = body.reply as string
      found.adminRepliedAt = '2026-11-12T03:00:00.000Z'
    }
    if (action === 'delete-reply') {
      found.adminReply = null
      found.adminRepliedAt = null
    }
    return reply(route, { status: 200, json: found })
  })

  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/reviews(\/|$)/.test(url.pathname), async (route) => {
    const request = route.request()
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const [, , id = null] = new URL(request.url()).pathname.split('/')
    if (method === 'GET' && id === 'pending') return reply(route, mock.on.pending?.() ?? { status: 200, json: mock.pending })
    if (method === 'GET' && id === 'me') {
      return reply(route, { status: 200, json: { data: mock.mine, meta: { total: mock.mine.length, page: 1, limit: 50, totalPages: 1 } } })
    }
    if (method === 'PATCH' && id) {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
      mock.updates.push({ id, body })
      const override = mock.on.update?.(body)
      if (override) return reply(route, override)
      const found = mock.mine.find((r) => r.id === id)
      if (!found) return reply(route, { status: 404, json: { statusCode: 404, message: 'Review not found', error: 'Not Found' } })
      if (typeof body.rating === 'number') found.rating = body.rating
      if (typeof body.comment === 'string') found.comment = body.comment
      if (Array.isArray(body.imageUrls)) found.images = (body.imageUrls as string[]).map((url, i) => ({ id: `u-${i}`, url, displayOrder: i }))
      found.updatedAt = '2026-11-12T03:00:00.000Z'
      return reply(route, { status: 200, json: found })
    }
    return reply(route, { status: 405, json: {} })
  })

  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/orders\/[^/]+\/products\/[^/]+\/reviews$/.test(url.pathname), async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const [, , orderId, , productId] = new URL(request.url()).pathname.split('/')
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
    mock.creates.push({ orderId, productId, body })
    const override = mock.on.create?.(body)
    if (override) return reply(route, override)
    const row = mock.pending.find((p) => p.orderId === orderId && p.product.id === productId)
    const variation = row?.variations.find((v) => v.orderItemId === body.orderItemId) ?? row?.variations[0]
    const urls = (body.imageUrls as string[] | undefined) ?? []
    const review = apiReview(900 + ++created, {
      orderId,
      productId,
      rating: body.rating as number,
      comment: (body.comment as string | undefined) ?? null,
      images: urls.map((url, i) => ({ id: `c-${i}`, url, displayOrder: i })),
      purchasedVariants: [{ size: variation?.size ?? null, color: variation?.color ?? null, sku: 'POLO-M-NAVY' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    mock.pending = mock.pending.filter((p) => p !== row)
    mock.mine.push(review)
    return reply(route, { status: 201, json: review })
  })

  // Review photo uploads (XHR to Supabase Storage) and their cleanup.
  await page.route('**/storage/v1/object/reviews/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() === 'POST') mock.uploads.push(new URL(request.url()).pathname)
    return route.fulfill({ status: 200, json: { Key: 'reviews/x' }, headers: CORS })
  })
  await page.route('**/storage/v1/object/reviews', (route) => route.fulfill({ status: 200, json: [], headers: CORS }))
  // Review photos are only decoration.
  await page.route(`${PHOTO_HOST}/**`, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#888"/></svg>' }),
  )
  await page.route('**/storage/v1/object/public/reviews/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#888"/></svg>' }),
  )
  return mock
}
