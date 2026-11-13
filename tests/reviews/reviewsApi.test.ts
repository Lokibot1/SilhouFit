import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'token-123' } } }) } }),
}))

const { createReview, deleteReply, deleteReview, fetchPendingReviews, fetchProductReviews, listAdminReviews, replyToReview, restoreReview, updateReview } = await import('../../src/service/reviewsApi')

const REVIEW = {
  id: 'r-1',
  orderId: 'o-1',
  productId: 'p-1',
  rating: 4,
  comment: 'Fits very well.',
  user: { id: 'u-1', firstName: 'Anne', lastName: 'Santos', fullName: null, avatarUrl: null },
  images: [{ id: 'i-1', url: 'https://img/a.jpg', displayOrder: 0 }],
  purchasedVariants: [{ size: 'M', color: 'Black', sku: 'POLO-M-BLK' }],
  adminReply: 'Thank you!',
  adminRepliedAt: '2026-11-02T04:00:00.000Z',
  isDeleted: false,
  createdAt: '2026-11-01T04:00:00.000Z',
  updatedAt: '2026-11-01T04:00:00.000Z',
}
const PAGE = {
  data: [REVIEW],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
  summary: { averageRating: 4, totalReviews: 1, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 } },
}
const fetchMock = vi.fn()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('fetchProductReviews', () => {
  it('parses a page, with the reviewer name built from first and last name', async () => {
    fetchMock.mockResolvedValue(json(PAGE))
    const page = await fetchProductReviews('p-1')
    expect(page.summary.ratingDistribution[4]).toBe(1)
    expect(page.meta.totalPages).toBe(1)
    expect(page.data[0]).toMatchObject({ rating: 4, user: { name: 'Anne Santos' }, images: [{ id: 'i-1', url: 'https://img/a.jpg' }], purchasedVariants: [{ size: 'M', color: 'Black', sku: 'POLO-M-BLK' }] })
  })

  it('builds the query: no rating key unset, hasImages only when on', async () => {
    fetchMock.mockImplementation(async () => json(PAGE))
    await fetchProductReviews('p-1', { page: 2, sortBy: 'oldest' })
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/products\/p-1\/reviews\?page=2&limit=10&sortBy=oldest$/)
    await fetchProductReviews('p-1', { rating: 2, hasImages: true, sortBy: 'highest_rating' })
    const url = new URL(fetchMock.mock.calls[1][0])
    expect(url.searchParams.get('rating')).toBe('2')
    expect(url.searchParams.get('hasImages')).toBe('true')
    await fetchProductReviews('p-1', { hasImages: false })
    expect(new URL(fetchMock.mock.calls[2][0]).searchParams.has('hasImages')).toBe(false)
    expect(new URL(fetchMock.mock.calls[2][0]).searchParams.has('rating')).toBe(false)
  })

  it.each([
    ['a review with a rating of 9', { ...PAGE, data: [{ ...REVIEW, rating: 9 }] }],
    ['a missing summary', { data: [REVIEW], meta: PAGE.meta }],
    ['a body that is not a list', { reviews: [] }],
  ])('rejects %s as a server error', async (_name, body) => {
    fetchMock.mockResolvedValue(json(body))
    await expect(fetchProductReviews('p-1')).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('fetchPendingReviews', () => {
  it('parses the list and rejects anything else', async () => {
    const item = { orderId: 'o-1', orderNumber: 'SHF-1', deliveredAt: null, product: { id: 'p-1', name: 'Polo', slug: 'polo', primaryImage: null }, variations: [{ orderItemId: 'oi-1', variantId: 'v-1', size: 'M', color: null, quantity: 2 }] }
    fetchMock.mockResolvedValueOnce(json([item]))
    expect((await fetchPendingReviews())[0]).toMatchObject({ orderId: 'o-1', product: { name: 'Polo' }, variations: [{ orderItemId: 'oi-1', quantity: 2 }] })
    fetchMock.mockResolvedValueOnce(json({ nope: true }))
    await expect(fetchPendingReviews()).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('writing a review', () => {
  it('posts to the order and product path and patches by id', async () => {
    fetchMock.mockImplementation(async () => json(REVIEW))
    await createReview('o-1', 'p-1', { rating: 4, comment: 'Fits very well.' })
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/orders\/o-1\/products\/p-1\/reviews$/)
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    await updateReview('r-1', { rating: 5, imageUrls: [] })
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/reviews\/r-1$/)
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH')
  })

  it.each([
    ['a duplicate', 409, 'A review for this product in this order already exists', 'already-reviewed', /already reviewed/],
    ['moderation', 403, 'This review was removed by moderation and cannot be resubmitted', 'removed', /moderators/],
  ])('explains %s on create', async (_name, status, message, kind, copy) => {
    fetchMock.mockResolvedValue(json({ message }, status))
    await expect(createReview('o-1', 'p-1', { rating: 4 })).rejects.toMatchObject({ kind, detail: expect.stringMatching(copy) })
  })

  it('explains an expired edit window on update', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Reviews can only be edited within 30 days of submission' }, 400))
    await expect(updateReview('r-1', { rating: 3 })).rejects.toMatchObject({ kind: 'edit-window', detail: expect.stringMatching(/30 days/) })
  })
})

describe('admin moderation', () => {
  it('lists with only the keys the API knows, and reads isDeleted', async () => {
    fetchMock.mockImplementation(async () => json({ data: [{ ...REVIEW, isDeleted: true }], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } }))
    const result = await listAdminReviews({ rating: 2, hasImages: true, includeDeleted: true, sortBy: 'lowest_rating' })
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.pathname).toBe('/admin/reviews')
    expect([...url.searchParams.keys()].sort()).toEqual(['hasImages', 'includeDeleted', 'limit', 'page', 'rating', 'sortBy'])
    expect(result.data[0].isDeleted).toBe(true)
    await listAdminReviews()
    expect([...new URL(fetchMock.mock.calls[1][0]).searchParams.keys()].sort()).toEqual(['limit', 'page', 'sortBy'])
  })

  it('rejects a list without data as a server error', async () => {
    fetchMock.mockResolvedValue(json({ nope: true }))
    await expect(listAdminReviews()).rejects.toMatchObject({ kind: 'server' })
  })

  it('sends reply, remove reply, delete and restore to their endpoints', async () => {
    fetchMock.mockImplementation(async () => json(REVIEW))
    await replyToReview('r-1', 'Thanks')
    await deleteReply('r-1')
    await deleteReview('r-1')
    await restoreReview('r-1')
    const calls = fetchMock.mock.calls.map(([url, init]) => [init.method, new URL(url).pathname])
    expect(calls).toEqual([['POST', '/admin/reviews/r-1/reply'], ['DELETE', '/admin/reviews/r-1/reply'], ['DELETE', '/admin/reviews/r-1'], ['POST', '/admin/reviews/r-1/restore']])
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reply: 'Thanks' })
  })

  it('maps a 404 to not-found', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Review not found' }, 404))
    await expect(deleteReview('r-1')).rejects.toMatchObject({ kind: 'not-found' })
  })
})
