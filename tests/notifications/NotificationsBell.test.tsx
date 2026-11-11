import { act, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationsBell } from '../../src/components/NotificationsBell'
import { customerOrder } from '../fixtures/orders'

const api = vi.hoisted(() => ({
  loadAllOrders: vi.fn(),
  getCachedOrders: vi.fn(() => null),
  onOrdersChanged: vi.fn(() => () => {}),
}))
vi.mock('../../src/service/ordersApi', async (original) => ({ ...(await original<typeof import('../../src/service/ordersApi')>()), ...api }))

const EMAIL = 'ana@example.com'
const KEY = 'silhoufit-notifications-seen'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const order = (n: number, over = {}) => customerOrder({ id: id(n), orderNumber: `SHF-${n}`, createdAt: `2026-10-${String(n).padStart(2, '0')}T02:00:00.000Z`, ...over })
const ORDERS = [order(1), order(2, { status: 'DELIVERED', paymentStatus: 'PAID' })]

beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  api.loadAllOrders.mockResolvedValue(ORDERS)
})
afterEach(() => vi.restoreAllMocks())

const renderBell = () =>
  render(
    <MemoryRouter>
      <NotificationsBell email={EMAIL} />
    </MemoryRouter>,
  )
const bell = (name: string | RegExp = /^Notifications/) => screen.getByRole('button', { name })
const panel = () => screen.getByRole('group', { name: 'Notifications' })
const gone = () => waitFor(() => expect(screen.queryByRole('group', { name: 'Notifications' })).toBeNull())

describe('NotificationsBell', () => {
  it('shows the unread count in the badge and the label', async () => {
    renderBell()
    const button = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    expect(button).toHaveTextContent('2')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).not.toHaveAttribute('title')
  })

  it('opens with a row per order linking to it, a footer link, and focus inside', async () => {
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    expect(bell()).toHaveAttribute('aria-expanded', 'true')
    const open = within(panel())
    expect(open.getByText('2 unread')).toBeInTheDocument()
    const links = open.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([`/orders/${id(2)}`, `/orders/${id(1)}`, '/orders'])
    expect(links[0]).toHaveTextContent('SHF-2')
    expect(links[0]).toHaveTextContent('Your order was delivered')
    expect(links[0]).toHaveTextContent('Unread')
    expect(links[1]).toHaveTextContent('Your order is waiting for payment')
    expect(links[2]).toHaveTextContent('View all orders')
    expect(open.getByRole('button', { name: 'Mark all read' })).toHaveFocus()
  })

  it('marks everything read when the panel closes, and keeps it read next time', async () => {
    const user = userEvent.setup()
    const { unmount } = renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await user.click(document.body)
    await gone()
    expect(bell('Notifications')).not.toHaveTextContent(/\d/)
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ email: EMAIL, seen: { [id(1)]: 'PENDING_PAYMENT', [id(2)]: 'DELIVERED' } })

    unmount()
    renderBell()
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('is unread again when an order changes status', async () => {
    localStorage.setItem(KEY, JSON.stringify({ email: EMAIL, seen: { [id(1)]: 'PENDING_PAYMENT', [id(2)]: 'PAID' } }))
    renderBell()
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument()
  })

  it('does not use another account\'s seen list', async () => {
    localStorage.setItem(KEY, JSON.stringify({ email: 'bo@example.com', seen: { [id(1)]: 'PENDING_PAYMENT', [id(2)]: 'DELIVERED' } }))
    renderBell()
    expect(await screen.findByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument()
  })

  it('marks all read from the button, with the rows staying until it closes', async () => {
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    const markAll = within(panel()).getByRole('button', { name: 'Mark all read' })
    await user.click(markAll)
    expect(within(panel()).getByText('0 unread')).toBeInTheDocument()
    expect(markAll).toBeDisabled()
    expect(bell('Notifications')).toBeInTheDocument()
    expect(within(panel()).queryByText('Unread')).toBeNull()
  })

  it('closes on Escape and returns focus to the bell', async () => {
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await user.keyboard('{Escape}')
    await gone()
    expect(bell('Notifications')).toHaveFocus()
  })

  it('walks the rows with the arrow keys', async () => {
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    const open = within(panel())
    await user.keyboard('{ArrowDown}')
    expect(open.getAllByRole('link')[0]).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(open.getByRole('link', { name: 'View all orders' })).toHaveFocus()
  })

  it('shows a skeleton while the orders load', async () => {
    api.loadAllOrders.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderBell()
    await user.click(bell('Notifications'))
    expect(within(panel()).getByRole('status', { name: 'Loading notifications' })).toBeInTheDocument()
  })

  it('says there is nothing yet and points to the shop', async () => {
    api.loadAllOrders.mockResolvedValue([])
    const user = userEvent.setup()
    renderBell()
    await waitFor(() => expect(api.loadAllOrders).toHaveBeenCalled())
    await act(async () => {})
    await user.click(bell('Notifications'))
    expect(within(panel()).getByText('No notifications yet')).toBeInTheDocument()
    expect(within(panel()).getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/shop')
    expect(within(panel()).getByRole('button', { name: 'Mark all read' })).toBeDisabled()
  })

  it('says what went wrong, keeps the bell working and retries', async () => {
    api.loadAllOrders.mockRejectedValue(new Error('down'))
    const user = userEvent.setup()
    renderBell()
    await waitFor(() => expect(api.loadAllOrders).toHaveBeenCalledTimes(1))
    await act(async () => {})
    await user.click(bell('Notifications'))
    expect(await within(panel()).findByText(/We couldn.t load your orders/)).toBeInTheDocument()
    api.loadAllOrders.mockResolvedValue(ORDERS)
    await user.click(within(panel()).getByRole('button', { name: 'Try again' }))
    expect(await within(panel()).findByText('SHF-2')).toBeInTheDocument()
  })
})
