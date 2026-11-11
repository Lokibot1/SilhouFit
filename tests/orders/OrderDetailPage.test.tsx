import { act, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { peekLoginNotice, takeLoginNotice } from '../../src/service/loginNotice'
import { clearSession, setSession } from '../../src/service/session'
import { OrderDetailPage } from '../../src/views/private/OrderDetailPage'
import { customerOrder, ORDER_ID, shipment } from '../fixtures/orders'

const api = vi.hoisted(() => ({
  fetchOrder: vi.fn(),
  cancelOrder: vi.fn(),
  getCachedOrders: vi.fn(() => null),
  getCachedOrder: vi.fn(() => null),
  onOrdersChanged: vi.fn(() => () => {}),
  usesSampleOrders: vi.fn(() => false),
}))
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
})
afterEach(() => act(() => clearSession()))

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
})
