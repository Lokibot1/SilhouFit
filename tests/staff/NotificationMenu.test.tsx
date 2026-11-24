import { act, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationMenu } from '../../src/components/staff/NotificationMenu'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { apiNotification, orderId } from '../fixtures/notifications'
import { fakeNotifications } from '../notifications/fakeNotifications'

const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../src/service/fetchProductList', async (original) => ({ ...(await original<typeof import('../../src/service/fetchProductList')>()), ...api }))

const placed = (n: number, over: Record<string, unknown> = {}) =>
  apiNotification(n, { type: 'ORDER_CREATED', title: 'New order placed', body: `Order SHF-${n} has been placed.`, data: { orderId: orderId(n), orderNumber: `SHF-${n}` }, ...over })
let server = fakeNotifications([])
const seed = () => fakeNotifications([placed(1), placed(2), placed(3, { readAt: '2026-01-02T00:00:00.000Z' }), apiNotification(4, { type: 'STAFF_INVITED', title: 'Staff invited', body: null, data: null })])

beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 })
  MotionGlobalConfig.skipAnimations = true
})
beforeEach(() => {
  server = seed()
  api.request.mockImplementation((method: string, path: string) => server.handle(method, path))
})
afterEach(() => vi.clearAllMocks())

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

function renderBell() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <NotificationMenu area="admin" />
        <Where />
      </MemoryRouter>
    </ToastProvider>,
  )
}

describe('NotificationMenu', () => {
  it('toasts a new order arrival, and View opens Online Orders for it', async () => {
    renderBell()
    await screen.findByRole('button', { name: 'Notifications, 3 unread' })
    server.items.push(placed(9))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(await screen.findByText('Order SHF-9 has been placed.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/online-orders?q=SHF-9')
  })

  it('shows a skeleton while loading, then the list with times in 12-hour form', async () => {
    let answer: () => void = () => {}
    api.request.mockImplementation(async (method: string, path: string) => {
      if (path.startsWith('/notifications?')) await new Promise<void>((resolve) => (answer = resolve))
      return server.handle(method, path)
    })
    renderBell()
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }))
    expect(screen.getByRole('status', { name: 'Loading notifications' })).toBeInTheDocument()
    act(() => answer())
    const panel = await screen.findByRole('group', { name: 'Notifications' })
    expect(await within(panel).findAllByText('New order placed')).toHaveLength(3)
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument()
    expect(within(panel).getAllByRole('listitem')).toHaveLength(4)
    expect(within(panel).getAllByText(/\d{1,2}:\d{2}\s(AM|PM)/, { selector: 'time' })).toHaveLength(4)
    expect(within(panel).queryByText('Sample data')).not.toBeInTheDocument()
  })

  it('counts the unread notifications on the bell, and marks them New in the list', async () => {
    renderBell()
    const bell = await screen.findByRole('button', { name: 'Notifications, 3 unread' })
    expect(bell).toHaveTextContent('3')
    await userEvent.click(bell)
    const panel = await screen.findByRole('group', { name: 'Notifications' })
    expect(await within(panel).findAllByText('New')).toHaveLength(3)
  })

  it('opens an order notification on the Online Orders page for that order, marks it read and closes', async () => {
    renderBell()
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 3 unread' }))
    const link = await screen.findByRole('link', { name: /Order SHF-2 has been placed/ })
    expect(link).toHaveAttribute('href', '/admin/online-orders?q=SHF-2')
    await userEvent.click(link)
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/online-orders?q=SHF-2')
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Notifications' })).toBeNull())
    expect(server.calls).toContain(`POST /notifications/${apiNotification(2).id}/read`)
    expect(await screen.findByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument()
  })

  it('opens a sold-out alert on Inventory for that product and marks it read', async () => {
    const id = orderId(9)
    const alert = apiNotification(5, {
      type: 'PRODUCT_SOLD_OUT',
      title: 'Product sold out',
      data: { productId: id, productName: 'X', previousStock: 1, currentStock: 0, threshold: 5, occurredAt: '2026-11-20T00:00:00.000Z' },
    })
    server = fakeNotifications([alert])
    renderBell()
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }))
    const link = await screen.findByRole('link', { name: /Product sold out/ })
    expect(link).toHaveAttribute('href', `/admin/inventory?q=${id}`)
    await userEvent.click(link)
    expect(screen.getByTestId('where')).toHaveTextContent(`/admin/inventory?q=${id}`)
    expect(server.calls).toContain(`POST /notifications/${alert.id}/read`)
  })

  it('shows a notification with no order as a plain row', async () => {
    renderBell()
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))
    const panel = await screen.findByRole('group', { name: 'Notifications' })
    expect(await within(panel).findByText('Staff invited')).toBeInTheDocument()
    expect(within(panel).getAllByRole('link')).toHaveLength(3)
  })

  it('marks all as read, with a toast, and clears the badge', async () => {
    renderBell()
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 3 unread' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }))
    expect(await screen.findByText('All notifications marked as read')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.queryByText('New')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('explains a failed load and retries', async () => {
    server.fail = (_method, path) => path.startsWith('/notifications?')
    renderBell()
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText("We couldn't load notifications.")).toBeInTheDocument()
    server.fail = undefined
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect((await screen.findAllByText('New order placed')).length).toBeGreaterThan(0)
  })

  it('says when there is nothing new', async () => {
    server = fakeNotifications([])
    renderBell()
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }))
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument()
  })

  it('closes on Escape and puts focus back on the bell', async () => {
    renderBell()
    const bell = await screen.findByRole('button', { name: 'Notifications, 3 unread' })
    await userEvent.click(bell)
    await screen.findByRole('group', { name: 'Notifications' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Notifications' })).toBeNull())
    expect(bell).toHaveFocus()
  })

  it('closes on an outside click, and when Tab leaves the last link', async () => {
    renderBell()
    const bell = await screen.findByRole('button', { name: 'Notifications, 3 unread' })
    await userEvent.click(bell)
    await screen.findByRole('group', { name: 'Notifications' })
    await userEvent.click(document.body)
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Notifications' })).toBeNull())
    act(() => bell.focus())
    await userEvent.click(bell)
    expect(await screen.findByRole('button', { name: 'Mark all as read' })).toHaveFocus()
    const links = await screen.findAllByRole('link')
    act(() => links[links.length - 1].focus())
    await userEvent.tab()
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Notifications' })).toBeNull())
    expect(bell).toHaveFocus()
  })
})
