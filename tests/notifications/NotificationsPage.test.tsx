import { act, configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationsBell } from '../../src/components/NotificationsBell'
import { clearSession, setSession } from '../../src/service/session'
import { NotificationsPage } from '../../src/views/private/NotificationsPage'
import { customerOrder } from '../fixtures/orders'

const api = vi.hoisted(() => ({
  loadAllOrders: vi.fn(),
  getCachedOrders: vi.fn(() => null),
  onOrdersChanged: vi.fn(() => () => {}),
}))
vi.mock('../../src/service/ordersApi', async (original) => ({ ...(await original<typeof import('../../src/service/ordersApi')>()), ...api }))

const EMAIL = 'anne@example.com'
const KEY = 'silhoufit-notifications-seen'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const order = (n: number, over = {}) =>
  customerOrder({ id: id(n), orderNumber: `SHF-${n}`, createdAt: new Date(Date.UTC(2026, 0, 1) + n * 3_600_000).toISOString(), ...over })
const orders = (count: number) => Array.from({ length: count }, (_, i) => order(i + 1))

beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  act(() => setSession({ name: 'Anne Santos', email: EMAIL }))
  api.loadAllOrders.mockResolvedValue(orders(3))
})
afterEach(() => act(() => clearSession()))

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{pathname + search}</span>
}
const renderPage = (withBell = false) =>
  render(
    <MemoryRouter initialEntries={['/notifications']}>
      <Where />
      {withBell && <NotificationsBell email={EMAIL} />}
      <Routes>
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="*" element={<p>another page</p>} />
      </Routes>
    </MemoryRouter>,
  )
const where = () => screen.getByTestId('where').textContent

describe('NotificationsPage', () => {
  it('sends a signed-out visitor to login and back here', async () => {
    act(() => clearSession())
    renderPage()
    await waitFor(() => expect(where()).toMatch(/^\/login\?next=/))
    expect(new URLSearchParams(where()!.split('?')[1]).get('next')).toBe('/notifications')
  })

  it('has a unique title and a 150-160 character description', async () => {
    renderPage()
    await screen.findByText('SHF-1')
    expect(document.title).toBe('Notifications — SilhouFit')
    const description = document.querySelector('meta[name="description"]')!.getAttribute('content')!
    expect(description.length).toBeGreaterThanOrEqual(150)
    expect(description.length).toBeLessThanOrEqual(160)
  })

  it('shows a skeleton while loading', () => {
    api.loadAllOrders.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading notifications' })).toBeInTheDocument()
  })

  it('lists newest first, links each row to its order, and shows an unread count', async () => {
    renderPage()
    const links = await screen.findAllByRole('link', { name: /SHF-/ })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([`/orders/${id(3)}`, `/orders/${id(2)}`, `/orders/${id(1)}`])
    expect(links[0]).toHaveTextContent('Unread.')
    expect(links[0]).toHaveTextContent('Your order is waiting for payment')
    expect(links[0].querySelector('time')).toHaveAttribute('datetime')
    expect(screen.getByRole('status')).toHaveTextContent('3 unread')
  })

  it('shows every order past the dropdown limit of 10, 20 at a time with Show more', async () => {
    api.loadAllOrders.mockResolvedValue(orders(45))
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('SHF-45')
    expect(screen.getAllByRole('link', { name: /SHF-/ })).toHaveLength(20)
    expect(screen.getByText('Showing 20 of 45')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    expect(screen.getAllByRole('link', { name: /SHF-/ })).toHaveLength(40)
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    expect(screen.getAllByRole('link', { name: /SHF-/ })).toHaveLength(45)
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  it('filters to unread, and says when everything is read', async () => {
    localStorage.setItem(KEY, JSON.stringify({ email: EMAIL, seen: { [id(1)]: 'PENDING_PAYMENT', [id(2)]: 'PENDING_PAYMENT' } }))
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('SHF-3')
    expect(screen.getByRole('button', { name: 'All 3' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Unread 1' }))
    expect(screen.getAllByRole('link', { name: /SHF-/ })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all' }))
    expect(screen.getAllByRole('link', { name: /SHF-/ })).toHaveLength(3)
  })

  it('marks all read, saves it, and keeps the bell badge in step', async () => {
    const user = userEvent.setup()
    renderPage(true)
    expect(await screen.findByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument()
    const markAll = screen.getByRole('button', { name: 'Mark all read' })
    await user.click(markAll)
    expect(markAll).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('0 unread')
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(KEY)!).seen).toEqual({ [id(1)]: 'PENDING_PAYMENT', [id(2)]: 'PENDING_PAYMENT', [id(3)]: 'PENDING_PAYMENT' })
  })

  it('marks only the opened order as seen and goes to it', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('link', { name: /SHF-2/ }))
    expect(where()).toBe(`/orders/${id(2)}`)
    expect(JSON.parse(localStorage.getItem(KEY)!).seen).toEqual({ [id(2)]: 'PENDING_PAYMENT' })
  })

  it('says what went wrong and retries', async () => {
    api.loadAllOrders.mockRejectedValue(new Error('down'))
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Your notifications did not load')
    api.loadAllOrders.mockResolvedValue(orders(3))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('SHF-3')).toBeInTheDocument()
  })

  it('says there is nothing yet and points to the shop', async () => {
    api.loadAllOrders.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/shop')
  })
})
