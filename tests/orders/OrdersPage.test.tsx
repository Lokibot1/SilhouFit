import { act, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { peekLoginNotice, takeLoginNotice } from '../../src/service/loginNotice'
import { clearSession, setSession } from '../../src/service/session'
import { OrdersPage } from '../../src/views/private/OrdersPage'
import { customerOrder, orderItem } from '../fixtures/orders'

const api = vi.hoisted(() => ({
  loadAllOrders: vi.fn(),
  cancelOrder: vi.fn(),
  getCachedOrders: vi.fn(() => null),
  getCachedOrder: vi.fn(() => null),
  onOrdersChanged: vi.fn(() => () => {}),
  usesSampleOrders: vi.fn(() => false),
}))
vi.mock('../../src/service/ordersApi', async (original) => ({ ...(await original<typeof import('../../src/service/ordersApi')>()), ...api }))
vi.mock('../../src/hooks/useBuyAgain', () => ({ useBuyAgain: () => ({ busy: null, buyAgain: vi.fn() }) }))

const { OrdersError } = await import('../../src/service/ordersApi')

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const order = (n: number, over = {}) => customerOrder({ id: id(n), orderNumber: `SHF-${n}`, ...over })

beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  vi.clearAllMocks()
  act(() => setSession({ name: 'Anne Santos', email: 'anne@example.com' }))
  api.loadAllOrders.mockResolvedValue([order(1), order(2, { status: 'CANCELLED', paymentStatus: 'UNPAID', items: [orderItem({ name: 'Garden Dress' })] }), order(3, { status: 'DELIVERED', paymentStatus: 'PAID' })])
})
afterEach(() => act(() => clearSession()))

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{pathname + search}</span>
}
const renderPage = (url = '/orders') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Where />
        <Routes>
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="*" element={<p>another page</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
const where = () => screen.getByTestId('where').textContent

describe('OrdersPage states', () => {
  it('sends a signed-out visitor to login and back here', async () => {
    act(() => clearSession())
    renderPage('/orders?tab=cancelled')
    await waitFor(() => expect(where()).toMatch(/^\/login\?next=/))
    expect(new URLSearchParams(where()!.split('?')[1]).get('next')).toBe('/orders?tab=cancelled')
  })

  it('shows a skeleton, then the orders, with a unique title and a 150-160 character description', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'My orders' })).toBeInTheDocument()
    expect(await screen.findByText('SHF-1')).toBeInTheDocument()
    expect(document.title).toBe('My orders — SilhouFit')
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content
    expect(description.length).toBeGreaterThanOrEqual(150)
    expect(description.length).toBeLessThanOrEqual(160)
    expect(screen.getByRole('status')).toHaveTextContent('3 orders')
  })

  it('explains a failed load and recovers on Try again', async () => {
    const user = userEvent.setup({ delay: null })
    api.loadAllOrders.mockRejectedValueOnce(new OrdersError('network'))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your orders did not load')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('SHF-1')).toBeInTheDocument()
    expect(api.loadAllOrders).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }))
  })

  it('ends the session and sends the shopper to sign in, back here, when the orders are refused', async () => {
    api.loadAllOrders.mockRejectedValueOnce(new OrdersError('forbidden', 'Your session ended. Sign in again.', 401))
    renderPage('/orders?tab=cancelled')
    await waitFor(() => expect(where()).toMatch(/^\/login\?next=/))
    expect(new URLSearchParams(where()!.split('?')[1]).get('next')).toBe('/orders?tab=cancelled')
    expect(peekLoginNotice()).toBe('session-ended')
    expect(screen.queryByText(/connection dropped/)).toBeNull()
    takeLoginNotice()
  })

  it('does the same when a cancel is refused', async () => {
    const user = userEvent.setup({ delay: null })
    api.cancelOrder.mockRejectedValueOnce(new OrdersError('forbidden', undefined, 401))
    renderPage()
    await screen.findByText('SHF-1')
    await user.click(screen.getByRole('button', { name: /Cancel order/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel order' }))
    await waitFor(() => expect(where()).toMatch(/^\/login\?next=/))
    expect(peekLoginNotice()).toBe('session-ended')
    takeLoginNotice()
  })

  it('says there are no orders yet, with a way to the shop', async () => {
    api.loadAllOrders.mockResolvedValue([])
    renderPage()
    expect(await screen.findByRole('heading', { name: 'No orders yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to shop' })).toHaveAttribute('href', '/shop')
    expect(screen.queryByRole('group', { name: 'Order status' })).toBeNull()
  })
})

describe('OrdersPage tabs and search', () => {
  it('filters by tab, keeps it in the URL and marks the pressed tab', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await screen.findByText('SHF-1')
    const tabs = within(screen.getByRole('group', { name: 'Order status' }))
    expect(tabs.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(tabs.getByRole('button', { name: /^Cancelled/ }))
    expect(where()).toBe('/orders?tab=cancelled')
    expect(screen.getByText('SHF-2')).toBeInTheDocument()
    expect(screen.queryByText('SHF-1')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('1 order in Cancelled')
  })

  it('opens on the tab named in the URL', async () => {
    renderPage('/orders?tab=completed')
    expect(await screen.findByText('SHF-3')).toBeInTheDocument()
    expect(screen.queryByText('SHF-1')).toBeNull()
  })

  it('says what an empty tab is for, and offers all orders or the shop', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage('/orders?tab=to-ship')
    expect(await screen.findByRole('heading', { name: 'Nothing being prepared' })).toBeInTheDocument()
    expect(screen.getByText(/Once you have paid, your order shows here/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/shop')
    await user.click(screen.getByRole('button', { name: 'View all orders' }))
    expect(await screen.findByText('SHF-1')).toBeInTheDocument()
  })

  it('searches by number or product, and suggests clearing a search that finds nothing', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await screen.findByText('SHF-1')
    await user.type(screen.getByRole('searchbox', { name: /Search orders/ }), 'garden')
    await waitFor(() => expect(screen.queryByText('SHF-1')).toBeNull())
    expect(screen.getByText('SHF-2')).toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: /Search orders/ }))
    await user.type(screen.getByRole('searchbox', { name: /Search orders/ }), 'zzz')
    expect(await screen.findByRole('heading', { name: 'No orders match your search' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(await screen.findByText('SHF-1')).toBeInTheDocument()
  })

  it('pages after ten orders and keeps the page in the URL', async () => {
    const user = userEvent.setup({ delay: null })
    api.loadAllOrders.mockResolvedValue(Array.from({ length: 12 }, (_, i) => order(i + 1)))
    renderPage()
    await screen.findByText('SHF-1')
    expect(screen.queryByText('SHF-11')).toBeNull()
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(where()).toBe('/orders?page=2')
    expect(await screen.findByText('SHF-11')).toBeInTheDocument()
  })
})

describe('OrdersPage cancelling', () => {
  it('asks "Are you sure?", cancels with the reason, and reads the orders again', async () => {
    const user = userEvent.setup({ delay: null })
    api.cancelOrder.mockResolvedValue(order(1, { status: 'CANCELLED' }))
    renderPage()
    await screen.findByText('SHF-1')
    await user.click(screen.getByRole('button', { name: /Cancel order/ }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Cancel this order?' }))
    expect(dialog.getByText('Are you sure?')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Keep order' })).toHaveFocus()
    await user.type(dialog.getByRole('textbox', { name: /Reason/ }), 'Wrong size')
    await user.click(dialog.getByRole('button', { name: 'Cancel order' }))
    await waitFor(() => expect(api.cancelOrder).toHaveBeenCalledWith(id(1), 'Wrong size'))
    expect(await screen.findByText(/Order SHF-1 cancelled/)).toBeInTheDocument()
    expect(api.loadAllOrders).toHaveBeenCalledTimes(2)
  })

  it('keeps the order when Keep order is pressed', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await screen.findByText('SHF-1')
    await user.click(screen.getByRole('button', { name: /Cancel order/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Keep order' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.cancelOrder).not.toHaveBeenCalled()
  })

  it('says why a cancel failed, inside the dialog, and lets the shopper try again', async () => {
    const user = userEvent.setup({ delay: null })
    api.cancelOrder.mockRejectedValueOnce(new OrdersError('network'))
    renderPage()
    await screen.findByText('SHF-1')
    await user.click(screen.getByRole('button', { name: /Cancel order/ }))
    const dialog = within(await screen.findByRole('dialog'))
    await user.click(dialog.getByRole('button', { name: 'Cancel order' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(/connection dropped/)
    expect(dialog.getByRole('button', { name: 'Cancel order' })).toBeEnabled()
  })
})
