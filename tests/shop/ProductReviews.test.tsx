import { configure, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductReviews } from '../../src/components/shop/ProductReviews'
import type { ProductReviewsPage, Review } from '../../src/service/reviewsApi'

const api = vi.hoisted(() => ({ fetchProductReviews: vi.fn() }))
vi.mock('../../src/service/reviewsApi', async (original) => ({ ...(await original<typeof import('../../src/service/reviewsApi')>()), ...api }))

beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => vi.resetAllMocks())

const review = (over: Partial<Review> = {}): Review => ({
  id: 'r-1',
  orderId: 'o-1',
  productId: 'p-1',
  rating: 4,
  comment: 'Fits very well.\nFast delivery.',
  user: { id: 'u-1', name: 'Anne Santos', avatarUrl: null },
  images: [{ id: 'i-1', url: 'https://img/a.jpg' }],
  purchasedVariants: [{ size: 'M', color: 'Black', sku: 'POLO-M-BLK' }],
  adminReply: 'Thank you for the kind words!',
  adminRepliedAt: '2026-11-02T04:00:00.000Z',
  createdAt: '2026-11-01T04:00:00.000Z',
  updatedAt: '2026-11-01T04:00:00.000Z',
  ...over,
})
const page = (over: Partial<ProductReviewsPage> = {}): ProductReviewsPage => ({
  data: [review()],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
  summary: { averageRating: 4.25, totalReviews: 4, ratingDistribution: { 1: 0, 2: 1, 3: 0, 4: 2, 5: 1 } },
  ...over,
})

const renderReviews = () =>
  render(
    <MemoryRouter>
      <ProductReviews productId="p-1" />
    </MemoryRouter>,
  )

describe('ProductReviews', () => {
  it('shows a skeleton, then the summary and the review with its photo, variant and store reply', async () => {
    api.fetchProductReviews.mockResolvedValue(page())
    renderReviews()
    expect(within(screen.getByRole('status', { name: 'Loading reviews' })).getAllByRole('listitem')).toHaveLength(10) // a full page, so nothing shifts when it loads
    expect(await screen.findByText('4.3')).toBeInTheDocument()
    expect(screen.getByText('4 reviews')).toBeInTheDocument()
    const bars = within(screen.getByRole('list', { name: 'Reviews by rating' })).getAllByRole('listitem')
    expect(bars).toHaveLength(5)
    expect(bars[0]).toHaveTextContent('5 stars')
    expect(bars[0]).toHaveTextContent('1')
    expect(bars[1]).toHaveTextContent('2')
    expect(screen.getByText('Anne Santos')).toBeInTheDocument()
    expect(screen.getByText('Size M · Black')).toBeInTheDocument()
    expect(screen.getByText(/^Nov 1, \d{1,2}:\d{2} (AM|PM)$/)).toBeInTheDocument()
    expect(screen.getByAltText('Photo 1 from Anne Santos')).toBeInTheDocument()
    expect(screen.getByText('Reply from SilhouFit')).toBeInTheDocument()
    expect(screen.getByText('Thank you for the kind words!')).toBeInTheDocument()
  })

  it('a filter goes back to page 1 and asks for it; clicking it again clears it', async () => {
    const user = userEvent.setup({ delay: null })
    api.fetchProductReviews.mockResolvedValue(page({ meta: { total: 25, page: 1, limit: 10, totalPages: 3 } }))
    renderReviews()
    await screen.findByText('4.3')
    await user.click(screen.getByRole('button', { name: 'Page 2' }))
    expect(api.fetchProductReviews).toHaveBeenLastCalledWith('p-1', expect.objectContaining({ page: 2 }), expect.anything())
    const stars = screen.getByRole('button', { name: '2 stars' })
    await user.click(stars)
    expect(stars).toHaveAttribute('aria-pressed', 'true')
    expect(api.fetchProductReviews).toHaveBeenLastCalledWith('p-1', expect.objectContaining({ page: 1, rating: 2 }), expect.anything())
    await user.click(screen.getByRole('button', { name: 'With photos' }))
    expect(api.fetchProductReviews).toHaveBeenLastCalledWith('p-1', expect.objectContaining({ rating: 2, hasImages: true }), expect.anything())
    await user.click(stars)
    expect(api.fetchProductReviews).toHaveBeenLastCalledWith('p-1', expect.objectContaining({ rating: undefined }), expect.anything())
  })

  it('aborts the request a filter change replaces', async () => {
    const user = userEvent.setup({ delay: null })
    api.fetchProductReviews.mockResolvedValueOnce(page())
    renderReviews()
    await screen.findByText('4.3')
    api.fetchProductReviews.mockReturnValue(new Promise(() => {}))
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    const first = api.fetchProductReviews.mock.calls.at(-1)![2].signal as AbortSignal
    expect(first.aborted).toBe(false)
    await user.click(screen.getByRole('button', { name: '3 stars' }))
    expect(first.aborted).toBe(true)
  })

  it('says there are no reviews yet and links to the orders', async () => {
    api.fetchProductReviews.mockResolvedValue(page({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 1 }, summary: { averageRating: 0, totalReviews: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } }))
    renderReviews()
    expect(await screen.findByText('No reviews yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your orders' })).toHaveAttribute('href', '/orders')
  })

  it('names the filter that matches nothing and clears it', async () => {
    const user = userEvent.setup({ delay: null })
    api.fetchProductReviews.mockResolvedValueOnce(page())
    renderReviews()
    await screen.findByText('4.3')
    api.fetchProductReviews.mockResolvedValueOnce(page({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 1 } }))
    await user.click(screen.getByRole('button', { name: '1 star' }))
    expect(await screen.findByText('No 1-star reviews')).toBeInTheDocument()
    api.fetchProductReviews.mockResolvedValueOnce(page())
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Anne Santos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 star' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('explains a failure inside the section and recovers on Try again', async () => {
    const user = userEvent.setup({ delay: null })
    api.fetchProductReviews.mockRejectedValueOnce({ kind: 'network' })
    renderReviews()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the reviews")
    expect(alert).toHaveTextContent(/connection dropped/)
    api.fetchProductReviews.mockResolvedValueOnce(page())
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Anne Santos')).toBeInTheDocument()
  })
})
