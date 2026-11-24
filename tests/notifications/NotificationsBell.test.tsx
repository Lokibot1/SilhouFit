import { act, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationsBell } from '../../src/components/NotificationsBell'
import { ToastContext } from '../../src/components/toast/useToast'
import { apiNotification, orderId } from '../fixtures/notifications'
import { fakeNotifications } from './fakeNotifications'

const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../src/service/fetchProductList', async (original) => ({ ...(await original<typeof import('../../src/service/fetchProductList')>()), ...api }))

const sound = vi.hoisted(() => ({ playNotification: vi.fn() }))
vi.mock('../../src/utils/sound', () => sound)

const live = vi.hoisted(() => ({ notify: (() => {}) as (n: unknown) => void, status: (() => {}) as (s: string) => void, unsubscribe: vi.fn(), poll: vi.fn() }))
vi.mock('../../src/service/notificationsRealtime', () => ({
  subscribeToNotifications: (onNotification: (n: unknown) => void, onStatus: (s: string) => void) => {
    live.notify = onNotification
    live.status = onStatus
    return live.unsubscribe
  },
}))
vi.mock('../../src/hooks/useLivePoll', () => ({ useLivePoll: (_refresh: unknown, options: { enabled: boolean }) => live.poll(options.enabled) }))

const toast = { show: vi.fn(), dismiss: vi.fn() }
let server = fakeNotifications([])
const seed = () => fakeNotifications([apiNotification(1), apiNotification(2, { type: 'SHIPMENT_STATUS_CHANGED', title: 'Out for delivery', body: null, data: null })])

beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  server = seed()
  api.request.mockImplementation((method: string, path: string) => server.handle(method, path))
})
afterEach(() => vi.restoreAllMocks())

const renderBell = () =>
  render(
    <ToastContext.Provider value={toast}>
      <MemoryRouter>
        <NotificationsBell />
      </MemoryRouter>
    </ToastContext.Provider>,
  )
const bell = (name: string | RegExp = /^Notifications/) => screen.getByRole('button', { name })
const panel = () => screen.getByRole('group', { name: 'Notifications' })
const gone = () => waitFor(() => expect(screen.queryByRole('group', { name: 'Notifications' })).toBeNull())

describe('NotificationsBell', () => {
  it('shows the unread count from the server in the badge and the label, and reads no list while closed', async () => {
    renderBell()
    const button = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    expect(button).toHaveTextContent('2')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).not.toHaveAttribute('title')
    expect(server.calls).toEqual(['GET /notifications/unread-count'])
  })

  it('says nothing on first load, then toasts and chimes once for a broadcast, but not with the panel open', async () => {
    renderBell()
    await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    expect(toast.show).not.toHaveBeenCalled()
    expect(sound.playNotification).not.toHaveBeenCalled()

    const arrived = apiNotification(3, { type: 'PAYMENT_FAILED', title: 'Payment failed', body: 'Order SHF-3 was declined.' })
    server.items.push(arrived)
    act(() => live.notify(arrived))
    await waitFor(() => expect(toast.show).toHaveBeenCalledTimes(1))
    expect(toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'danger', title: 'Payment failed', message: 'Order SHF-3 was declined.', action: expect.objectContaining({ label: 'View' }) }),
    )
    expect(sound.playNotification).toHaveBeenCalledTimes(1)

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 3 unread' }))
    await screen.findByText('Payment failed')
    const next = apiNotification(4)
    server.items.push(next)
    act(() => live.notify(next))
    await screen.findByRole('button', { name: 'Notifications, 4 unread' })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(toast.show).toHaveBeenCalledTimes(1)
    expect(sound.playNotification).toHaveBeenCalledTimes(1)
  })

  it('announces the same notification once, and a burst as one toast for the newest with "and 1 more" and one chime', async () => {
    renderBell()
    await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    const one = apiNotification(3, { title: 'Third' })
    server.items.push(one)
    act(() => {
      live.notify(one)
      live.notify(one)
    })
    await waitFor(() => expect(toast.show).toHaveBeenCalledTimes(1))
    expect(toast.show).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Third' }))
    expect(String(toast.show.mock.lastCall?.[0].message)).not.toContain('and 1 more') // the duplicate is not counted as a second arrival
    await screen.findByRole('button', { name: 'Notifications, 3 unread' })

    const two = apiNotification(4, { title: 'Fourth', body: 'Body.' })
    const three = apiNotification(5, { title: 'Fifth', body: 'Body.' })
    server.items.push(two, three)
    act(() => {
      live.notify(two)
      live.notify(three)
    })
    await waitFor(() => expect(toast.show).toHaveBeenCalledTimes(2))
    expect(toast.show).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Fifth', message: 'Body. and 1 more' }))
    await new Promise((resolve) => setTimeout(resolve, 400))
    act(() => live.notify(one)) // the same id delivered again in a later burst
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(toast.show).toHaveBeenCalledTimes(2)
    expect(sound.playNotification).toHaveBeenCalledTimes(2)
  })

  it('shows no pop-up and plays no chime when both are turned off on this device, but the badge still counts', async () => {
    localStorage.setItem('silhoufit-notify-popup', 'off')
    localStorage.setItem('silhoufit-notify-sound', 'off')
    renderBell()
    await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    const arrived = apiNotification(3, { type: 'PAYMENT_FAILED', title: 'Payment failed', body: 'Order SHF-3 was declined.' })
    server.items.push(arrived)
    act(() => live.notify(arrived))
    await screen.findByRole('button', { name: 'Notifications, 3 unread' })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(toast.show).not.toHaveBeenCalled()
    expect(sound.playNotification).not.toHaveBeenCalled()
  })

  it('counts silently when the channel connects, and polls only while it is not subscribed', async () => {
    renderBell()
    await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    expect(live.poll).toHaveBeenLastCalledWith(true)
    server.items.push(apiNotification(3))
    act(() => live.status('SUBSCRIBED'))
    await screen.findByRole('button', { name: 'Notifications, 3 unread' })
    expect(live.poll).toHaveBeenLastCalledWith(false)
    act(() => live.status('CHANNEL_ERROR'))
    expect(live.poll).toHaveBeenLastCalledWith(true)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(toast.show).not.toHaveBeenCalled()
    expect(sound.playNotification).not.toHaveBeenCalled()
  })

  it('stops listening when it unmounts', async () => {
    const { unmount } = renderBell()
    await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    unmount()
    expect(live.unsubscribe).toHaveBeenCalled()
  })

  it('hides the badge until the count is known', () => {
    api.request.mockReturnValue(new Promise(() => {}))
    renderBell()
    expect(bell('Notifications')).not.toHaveTextContent(/\d/)
  })

  it('opens with a row per notification, a plain row without an order, a footer link, and focus inside', async () => {
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    const open = within(panel())
    expect(open.getByText('2 unread')).toBeInTheDocument()
    expect(await open.findByText('Payment received 1')).toBeInTheDocument()
    expect(server.calls).toContain('GET /notifications?page=1&limit=20')
    const links = open.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([`/orders/${orderId(1)}`, '/notifications'])
    expect(links[0]).toHaveTextContent('Order SHF-1 is paid.')
    expect(links[0]).toHaveTextContent('Unread')
    expect(open.getByText('Out for delivery').closest('a')).toBeNull()
    expect(open.getByRole('button', { name: 'Mark all read' })).toHaveFocus()
  })

  it('marks everything read on the server when the panel closes, and not again when nothing is unread', async () => {
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await user.click(document.body)
    await gone()
    expect(bell('Notifications')).not.toHaveTextContent(/\d/)
    await waitFor(() => expect(server.calls).toContain('POST /notifications/read-all'))
    expect(server.items.every((n) => n.readAt)).toBe(true)

    await user.click(bell('Notifications'))
    await user.keyboard('{Escape}')
    await gone()
    expect(server.calls.filter((c) => c === 'POST /notifications/read-all')).toHaveLength(1)
  })

  it('marks all read from the button, with the rows staying until it closes', async () => {
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await screen.findByText('Payment received 1')
    const markAll = within(panel()).getByRole('button', { name: 'Mark all read' })
    await user.click(markAll)
    expect(within(panel()).getByText('0 unread')).toBeInTheDocument()
    expect(markAll).toBeDisabled()
    expect(within(panel()).queryByText('Unread')).toBeNull()
  })

  it('puts the count back and says so when marking read fails', async () => {
    server.fail = (_method, path) => path === '/notifications/read-all'
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await screen.findByText('Payment received 1')
    await user.click(within(panel()).getByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', message: expect.stringMatching(/couldn.t mark your notifications as read/) })))
    expect(within(panel()).getByText('2 unread')).toBeInTheDocument()
    expect(within(panel()).getAllByText('Unread.', { exact: false })).toHaveLength(2)
  })

  it('closes on Escape and returns focus to the bell', async () => {
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await user.keyboard('{Escape}')
    await gone()
    expect(bell(/^Notifications/)).toHaveFocus()
  })

  it('walks the rows with the arrow keys', async () => {
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await screen.findByText('Payment received 1')
    const open = within(panel())
    await user.keyboard('{ArrowDown}')
    expect(open.getAllByRole('link')[0]).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(open.getByRole('link', { name: 'View all notifications' })).toHaveFocus()
  })

  it('shows a skeleton while the list loads', async () => {
    api.request.mockImplementation((method: string, path: string) => (path.startsWith('/notifications?') ? new Promise(() => {}) : server.handle(method, path)))
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    expect(within(panel()).getByRole('status', { name: 'Loading notifications' })).toBeInTheDocument()
  })

  it('says there is nothing yet and points to the shop', async () => {
    server = fakeNotifications([])
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(await within(panel()).findByText('No notifications yet')).toBeInTheDocument()
    expect(within(panel()).getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/shop')
    expect(within(panel()).getByRole('button', { name: 'Mark all read' })).toBeDisabled()
  })

  it('says what went wrong, keeps the bell working and retries', async () => {
    server.fail = (_method, path) => path.startsWith('/notifications?')
    const user = userEvent.setup()
    renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    expect(await within(panel()).findByText(/connection dropped/)).toBeInTheDocument()
    server.fail = undefined
    await user.click(within(panel()).getByRole('button', { name: 'Try again' }))
    expect(await within(panel()).findByText('Payment received 1')).toBeInTheDocument()
  })
})
