import { act, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { peekLoginNotice, takeLoginNotice } from '../../src/service/loginNotice'
import type { PendingReview, Review } from '../../src/service/reviewsApi'
import { clearSession, setSession } from '../../src/service/session'
import { OrderDetailPage } from '../../src/views/private/OrderDetailPage'
import { customerOrder, ORDER_ID, shipment } from '../fixtures/orders'

const api = vi.hoisted(() => ({
  fetchOrder: vi.fn(),
  cancelOrder: vi.fn(),
  createCheckoutSession: vi.fn(),
  getCachedOrders: vi.fn(() => null),
  getCachedOrder: vi.fn(() => null),
  onOrdersChanged: vi.fn(() => () => {}),
  usesSampleOrders: vi.fn(() => false),
}))
const reviews = vi.hoisted(() => ({ fetchPendingReviews: vi.fn(), fetchMyReviews: vi.fn(), createReview: vi.fn(), updateReview: vi.fn() }))
vi.mock('../../src/service/reviewsApi', async (original) => ({ ...(await original<typeof import('../../src/service/reviewsApi')>()), ...reviews }))
const storage = vi.hoisted(() => ({ uploadAvatar: vi.fn(), deleteAvatar: vi.fn() }))
vi.mock('../../src/service/uploadAvatar', async (original) => ({ ...(await original<typeof import('../../src/service/uploadAvatar')>()), ...storage }))
vi.mock('../../src/service/fetchMe', async (original) => ({ ...(await original<typeof import('../../src/service/fetchMe')>()), fetchMe: async () => ({ id: 'u-1' }) }))
vi.mock('../../src/service/ordersApi', async (original) => ({ ...(await original<typeof import('../../src/service/ordersApi')>()), ...api }))
vi.mock('../../src/hooks/useBuyAgain', () => ({ useBuyAgain: () => ({ busy: null, buyAgain: vi.fn() }) }))

const { OrdersError } = await import('../../src/service/ordersApi')

beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  vi.clearAllMocks()
  act(() => setSession({ name: 'Anne Santos', email: 'anne@example.com' }))
  api.fetchOrder.mockResolvedValue(customerOrder())
  reviews.fetchPendingReviews.mockResolvedValue([])
  reviews.fetchMyReviews.mockResolvedValue([])
})
afterEach(() => {
  window.history.replaceState({}, '', '/')
  act(() => clearSession())
})

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{pathname + search}</span>
}
const renderPage = (target = ORDER_ID) =>
  render(
    <MemoryRouter initialEntries={[`/orders/${target}`]}>
      <ToastProvider>
        <Where />
        <Routes>
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="*" element={<p>another page</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )

describe('OrderDetailPage', () => {
  it('follows a status change from the server without a reload, announces it, and stops once the order is closed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      api.fetchOrder.mockResolvedValueOnce(customerOrder({ status: 'DISPATCHED', paymentStatus: 'PAID' }))
      renderPage()
      expect(await screen.findByText('Shipped', { selector: 'span[data-status]' })).toBeInTheDocument()
      expect(api.fetchOrder).toHaveBeenCalledTimes(1)

      api.fetchOrder.mockResolvedValue(customerOrder({ status: 'OUT_FOR_DELIVERY', paymentStatus: 'PAID' }))
      await act(() => vi.advanceTimersByTimeAsync(23_000))
      expect(await screen.findByText('Out for delivery', { selector: 'span[data-status]' })).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Your order is out for delivery.')
      expect(api.fetchOrder).toHaveBeenCalledTimes(2)

      api.fetchOrder.mockResolvedValue(customerOrder({ status: 'DELIVERED', paymentStatus: 'PAID' }))
      await act(() => vi.advanceTimersByTimeAsync(23_000))
      expect(await screen.findByText('Delivered', { selector: 'span[data-status]' })).toBeInTheDocument()
      await act(() => vi.advanceTimersByTimeAsync(120_000))
      expect(api.fetchOrder).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the order on screen when a background refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderPage()
      expect(await screen.findByRole('heading', { level: 1, name: 'SHF-20261026-ABC123' })).toBeInTheDocument()
      api.fetchOrder.mockRejectedValue(new OrdersError('network'))
      await act(() => vi.advanceTimersByTimeAsync(23_000))
      expect(api.fetchOrder).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('heading', { level: 1, name: 'SHF-20261026-ABC123' })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('tells the shopper their payment was received when the payment service says the order is already paid', async () => {
    api.createCheckoutSession.mockRejectedValue(new OrdersError('already-paid'))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Pay now' }))
    expect(await screen.findByText(/We received your payment/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pay now' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull()
    expect(screen.queryByText(/couldn't open the payment page/)).toBeNull()
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
  })

  it('sends a signed-out visitor to login and back here', async () => {
    act(() => clearSession())
    renderPage()
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/login\?next=/))
  })

  it('shows the order: number, chip, progress, items, summary, address and a unique title', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'SHF-20261026-ABC123' })).toHaveFocus()
    expect(screen.getByText('Awaiting payment', { selector: 'span[data-status]' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Order progress' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
    const summary = screen.getByRole('complementary')
    expect(summary).toHaveTextContent('₱3,780.00')
    expect(summary).toHaveTextContent('₱3,879.00')
    expect(summary).toHaveTextContent('12 Rizal Avenue')
    expect(summary).toHaveTextContent('Online payment is coming soon')
    expect(document.title).toBe('Order SHF-20261026-ABC123 — SilhouFit')
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content
    expect(description.length).toBeGreaterThanOrEqual(150)
    expect(description.length).toBeLessThanOrEqual(160)
  })

  it('says "We can\'t find this order" for a 404 and for an id that is not an id, without asking for the latter', async () => {
    api.fetchOrder.mockRejectedValueOnce(new OrdersError('not-found'))
    const first = renderPage()
    expect(await screen.findByRole('heading', { name: "We can't find this order" })).toBeInTheDocument()
    first.unmount()

    api.fetchOrder.mockClear()
    renderPage('not-an-id')
    expect(await screen.findByRole('heading', { name: "We can't find this order" })).toBeInTheDocument()
    expect(api.fetchOrder).not.toHaveBeenCalled()
  })

  it('explains a failed load and recovers on Try again', async () => {
    const user = userEvent.setup({ delay: null })
    api.fetchOrder.mockRejectedValueOnce(new OrdersError('network'))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This order did not load')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'SHF-20261026-ABC123' })).toBeInTheDocument()
  })

  it('ends the session and sends the shopper to sign in, back to this order, when it is refused', async () => {
    api.fetchOrder.mockRejectedValueOnce(new OrdersError('forbidden', 'Your session ended. Sign in again.', 401))
    renderPage()
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/login\?next=/))
    expect(new URLSearchParams(screen.getByTestId('where').textContent!.split('?')[1]).get('next')).toBe(`/orders/${ORDER_ID}`)
    expect(peekLoginNotice()).toBe('session-ended')
    expect(screen.queryByText(/connection dropped/)).toBeNull()
    takeLoginNotice()
  })

  it('cancels an unpaid order after asking, and shows it as cancelled', async () => {
    const user = userEvent.setup({ delay: null })
    api.cancelOrder.mockResolvedValue(customerOrder({ status: 'CANCELLED', cancelledAt: '2026-10-26T05:00:00.000Z', cancellationReason: 'Wrong size' }))
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'SHF-20261026-ABC123' })
    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel order' }))
    expect(await screen.findByText('This order was cancelled')).toBeInTheDocument()
    expect(screen.getByText(/Reason: Wrong size/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Buy again' })).toBeInTheDocument()
  })

  it('offers no cancel for a paid or shipped order, and tracks and calls only when it is on its way', async () => {
    api.fetchOrder.mockResolvedValue(customerOrder({ status: 'OUT_FOR_DELIVERY', paymentStatus: 'PAID', paidAt: '2026-10-26T03:00:00.000Z', shipment: shipment() }))
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'SHF-20261026-ABC123' })
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Track delivery/ })).toBeNull()
    expect(screen.getByTitle('Live delivery map')).toHaveAttribute('src', 'https://example.com/track/123')
    expect(screen.getByRole('link', { name: /Open it in a new tab/ })).toHaveAttribute('href', 'https://example.com/track/123')
    expect(screen.getByRole('link', { name: '+639171112222' })).toHaveAttribute('href', 'tel:+639171112222')
  })

  it('puts the delivery section above the order progress', async () => {
    api.fetchOrder.mockResolvedValue(customerOrder({ status: 'DISPATCHED', paymentStatus: 'PAID', shipment: shipment() }))
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'SHF-20261026-ABC123' })
    const delivery = screen.getByRole('heading', { level: 2, name: 'Delivery' })
    const progress = screen.getByRole('heading', { level: 2, name: 'Order progress' })
    expect(delivery.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('hides the driver phone before the last leg', async () => {
    api.fetchOrder.mockResolvedValue(customerOrder({ status: 'DISPATCHED', paymentStatus: 'PAID', shipment: shipment() }))
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'SHF-20261026-ABC123' })
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument()
    expect(screen.queryByText('+639171112222')).toBeNull()
  })

  describe('review section', () => {
    const delivered = () => api.fetchOrder.mockResolvedValue(customerOrder({ status: 'DELIVERED', paymentStatus: 'PAID' }))
    const section = async () => (await screen.findByRole('heading', { level: 2, name: 'Your reviews' })).closest('section')!
    const waiting = (): PendingReview => ({
      orderId: ORDER_ID,
      orderNumber: 'SHF-20261026-ABC123',
      deliveredAt: null,
      product: { id: 'p-1', name: 'Heritage Polo', slug: 'heritage-polo', primaryImage: null },
      variations: [{ orderItemId: 'oi-1', variantId: 'v-1', size: 'M', color: 'Navy', quantity: 2 }],
    })
    const done = (over: Partial<Review> = {}): Review => ({
      id: 'r-1',
      orderId: ORDER_ID,
      productId: 'p-1',
      rating: 4,
      comment: 'Fits very well, fast delivery.',
      user: { id: 'u-1', name: 'Anne Santos', avatarUrl: null },
      images: [{ id: 'i-1', url: 'https://img/a.jpg' }],
      purchasedVariants: [{ size: 'M', color: 'Navy', sku: 'POLO-M-NAVY' }],
      adminReply: null,
      adminRepliedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...over,
    })

    it('is shown only for a delivered order', async () => {
      renderPage()
      await screen.findByRole('heading', { level: 1, name: 'SHF-20261026-ABC123' })
      expect(screen.queryByRole('heading', { name: 'Your reviews' })).toBeNull()
    })

    it('is left out for a sample account, whose order ids the reviews API would reject', async () => {
      delivered()
      api.usesSampleOrders.mockReturnValue(true)
      renderPage()
      await screen.findByRole('heading', { level: 1, name: 'SHF-20261026-ABC123' })
      expect(screen.queryByRole('heading', { name: 'Your reviews' })).toBeNull()
      api.usesSampleOrders.mockReturnValue(false)
    })

    it('loads one row per product after the items: a Review button for the unreviewed one, the saved review for the other', async () => {
      delivered()
      reviews.fetchPendingReviews.mockResolvedValue([waiting()])
      reviews.fetchMyReviews.mockResolvedValue([done({ id: 'r-2', productId: 'p-2', purchasedVariants: [{ size: null, color: null, sku: 'OTHER' }] }), done({ orderId: 'other-order' })])
      renderPage()
      const card = await section()
      expect(within(card).getByRole('status', { name: 'Loading your reviews' })).toBeInTheDocument()
      expect(await within(card).findByRole('button', { name: 'Review Heritage Polo' })).toBeInTheDocument()
      expect(within(card).getAllByRole('listitem').filter((li) => li.tagName === 'LI' && li.querySelector('h3'))).toHaveLength(2)
      expect(within(card).getByRole('img', { name: 'Rated 4 out of 5' })).toBeInTheDocument()
      expect(within(card).getByAltText('Photo 1: Product')).toHaveAttribute('src', 'https://img/a.jpg')
      expect(within(card).queryByText('Sample data')).toBeNull()
      const items = screen.getByRole('heading', { level: 2, name: /^Items/ })
      expect(items.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('says so when nothing on the order can be reviewed', async () => {
      delivered()
      renderPage()
      expect(await screen.findByText(/nothing to review on this order/)).toBeInTheDocument()
    })

    it('explains a failed load without hiding the order, and recovers on Try again', async () => {
      const user = userEvent.setup({ delay: null })
      delivered()
      reviews.fetchPendingReviews.mockRejectedValueOnce(new Error('down'))
      renderPage()
      const card = await section()
      const alert = await within(card).findByRole('alert')
      expect(alert).toHaveTextContent("We couldn't load your reviews")
      expect(screen.getByRole('heading', { level: 1, name: 'SHF-20261026-ABC123' })).toBeInTheDocument()
      reviews.fetchPendingReviews.mockResolvedValue([waiting()])
      await user.click(within(alert).getByRole('button', { name: 'Try again' }))
      expect(await within(card).findByRole('button', { name: 'Review Heritage Polo' })).toBeInTheDocument()
    })

    it('posts, then edits a review, with a toast and focus kept at each step', async () => {
      const user = userEvent.setup({ delay: null })
      delivered()
      reviews.fetchPendingReviews.mockResolvedValue([waiting()])
      reviews.createReview.mockResolvedValue(done())
      renderPage()
      const card = await section()
      await user.click(await within(card).findByRole('button', { name: 'Review Heritage Polo' }))

      let dialog = await screen.findByRole('dialog', { name: 'Review Heritage Polo' })
      await user.click(within(dialog).getByRole('radio', { name: '4 stars: Very good' }))
      await user.type(within(dialog).getByRole('textbox', { name: 'Your review' }), 'Fits very well, fast delivery.')
      reviews.fetchPendingReviews.mockResolvedValue([])
      reviews.fetchMyReviews.mockResolvedValue([done({ images: [] })])
      await user.click(within(dialog).getByRole('button', { name: 'Post review' }))
      expect(reviews.createReview).toHaveBeenCalledWith(ORDER_ID, 'p-1', { rating: 4, comment: 'Fits very well, fast delivery.' })
      expect(await within(card).findByRole('img', { name: 'Rated 4 out of 5' }, { timeout: 4000 })).toBeInTheDocument()
      expect(screen.getByText('Review posted.')).toBeInTheDocument()
      expect(within(card).getByText(/^Reviewed .*(AM|PM)$/)).toBeInTheDocument()
      await waitFor(() => expect(within(card).getByRole('button', { name: 'Edit review of Heritage Polo' })).toHaveFocus())
      expect(within(card).queryByRole('button', { name: /^Delete/ })).toBeNull()

      reviews.updateReview.mockResolvedValue(done({ rating: 2 }))
      await user.click(within(card).getByRole('button', { name: 'Edit review of Heritage Polo' }))
      dialog = await screen.findByRole('dialog', { name: 'Edit review: Heritage Polo' })
      expect(within(dialog).getByRole('radio', { name: '4 stars: Very good' })).toBeChecked()
      await user.click(within(dialog).getByRole('radio', { name: '2 stars: Fair' }))
      reviews.fetchMyReviews.mockResolvedValue([done({ rating: 2, images: [] })])
      await user.click(within(dialog).getByRole('button', { name: 'Save review' }))
      expect(reviews.updateReview).toHaveBeenCalledWith('r-1', { rating: 2, comment: 'Fits very well, fast delivery.', imageUrls: [] })
      expect(await within(card).findByRole('img', { name: 'Rated 2 out of 5' }, { timeout: 4000 })).toBeInTheDocument()
    })

    it('offers no edit once the 30 days have passed', async () => {
      delivered()
      reviews.fetchMyReviews.mockResolvedValue([done({ createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() })])
      renderPage()
      const card = await section()
      expect(await within(card).findByText(/edited for 30 days/)).toBeInTheDocument()
      expect(within(card).queryByRole('button', { name: /^Edit review/ })).toBeNull()
    })

    it('uploads new photos to the reviews bucket first and sends their URLs with the kept ones', async () => {
      const user = userEvent.setup({ delay: null, applyAccept: false })
      delivered()
      reviews.fetchMyReviews.mockResolvedValue([done()])
      storage.uploadAvatar.mockResolvedValue('https://store/reviews/u-1/new.jpg')
      reviews.updateReview.mockResolvedValue(done())
      renderPage()
      const card = await section()
      await user.click(await within(card).findByRole('button', { name: 'Edit review of Heritage Polo' }))
      const dialog = await screen.findByRole('dialog', { name: 'Edit review: Heritage Polo' })
      const file = new File(['x'], 'look.jpg', { type: 'image/jpeg' })
      await user.upload(within(dialog).getByLabelText('Choose photo files'), file)
      await user.click(within(dialog).getByRole('button', { name: 'Save review' }))
      await waitFor(() => expect(reviews.updateReview).toHaveBeenCalled())
      expect(storage.uploadAvatar).toHaveBeenCalledWith(file, 'u-1', expect.any(Function), undefined, 'reviews')
      expect(reviews.updateReview).toHaveBeenCalledWith('r-1', expect.objectContaining({ imageUrls: ['https://img/a.jpg', 'https://store/reviews/u-1/new.jpg'] }))
    })

    it('keeps the dialog open with the reason when saving fails, and removes the photos it just uploaded', async () => {
      const user = userEvent.setup({ delay: null, applyAccept: false })
      delivered()
      reviews.fetchPendingReviews.mockResolvedValue([waiting()])
      storage.uploadAvatar.mockResolvedValue('https://store/reviews/u-1/new.jpg')
      const { ReviewsError } = await import('../../src/service/reviewsApi')
      reviews.createReview.mockRejectedValue(new ReviewsError('already-reviewed', 'You already reviewed this product on this order, possibly from another tab.'))
      renderPage()
      const card = await section()
      await user.click(await within(card).findByRole('button', { name: 'Review Heritage Polo' }))
      const dialog = await screen.findByRole('dialog', { name: 'Review Heritage Polo' })
      await user.click(within(dialog).getByRole('radio', { name: '5 stars: Excellent' }))
      await user.type(within(dialog).getByRole('textbox', { name: 'Your review' }), 'Fits very well, fast delivery.')
      await user.upload(within(dialog).getByLabelText('Choose photo files'), new File(['x'], 'look.jpg', { type: 'image/jpeg' }))
      await user.click(within(dialog).getByRole('button', { name: 'Post review' }))
      expect(await within(dialog).findByText(/already reviewed this product/)).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Post review' })).toBeEnabled()
      expect(storage.deleteAvatar).toHaveBeenCalledWith('https://store/reviews/u-1/new.jpg', 'u-1', 'reviews')
    })
  })
})
