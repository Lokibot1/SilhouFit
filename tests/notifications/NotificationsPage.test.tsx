import { act, configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationsBell } from '../../src/components/NotificationsBell'
import { ToastContext } from '../../src/components/toast/useToast'
import { ProductListError } from '../../src/service/fetchProductList'
import { clearSession, setSession } from '../../src/service/session'
import { NotificationsPage } from '../../src/views/private/NotificationsPage'
import { apiNotification, orderId } from '../fixtures/notifications'
import { fakeNotifications } from './fakeNotifications'

const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../src/service/fetchProductList', async (original) => ({ ...(await original<typeof import('../../src/service/fetchProductList')>()), ...api }))

const toast = { show: vi.fn(), dismiss: vi.fn() }
const many = (count: number) => Array.from({ length: count }, (_, i) => apiNotification(i + 1))
let server = fakeNotifications([])
const serve = (count: number) => {
  server = fakeNotifications(many(count))
}

beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  vi.clearAllMocks()
  act(() => setSession({ name: 'Anne Santos', email: 'anne@example.com' }))
  serve(3)
  api.request.mockImplementation((method: string, path: string) => server.handle(method, path))
})
afterEach(() => act(() => clearSession()))

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{pathname + search}</span>
}
const renderPage = (withBell = false) =>
  render(
    <ToastContext.Provider value={toast}>
      <MemoryRouter initialEntries={['/notifications']}>
        <Where />
        {withBell && <NotificationsBell />}
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="*" element={<p>another page</p>} />
        </Routes>
      </MemoryRouter>
    </ToastContext.Provider>,
  )
const where = () => screen.getByTestId('where').textContent
const rows = () => screen.getAllByRole('link', { name: /Payment received/ })

describe('NotificationsPage', () => {
  it('sends a signed-out visitor to login and back here', async () => {
    act(() => clearSession())
    renderPage()
    await waitFor(() => expect(where()).toMatch(/^\/login\?next=/))
    expect(new URLSearchParams(where()!.split('?')[1]).get('next')).toBe('/notifications')
    expect(api.request).not.toHaveBeenCalled()
  })

  it('has a unique title and a 150-160 character description', async () => {
    renderPage()
    await screen.findByText('Payment received 1')
    expect(document.title).toBe('Notifications — SilhouFit')
    const description = document.querySelector('meta[name="description"]')!.getAttribute('content')!
    expect(description.length).toBeGreaterThanOrEqual(150)
    expect(description.length).toBeLessThanOrEqual(160)
  })

  it('shows a skeleton while loading', () => {
    api.request.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading notifications' })).toBeInTheDocument()
  })

  it('lists newest first, links each row to its order, with no photo, and shows the server counts', async () => {
    renderPage()
    await screen.findByText('Payment received 3')
    expect(rows().map((link) => link.getAttribute('href'))).toEqual([`/orders/${orderId(3)}`, `/orders/${orderId(2)}`, `/orders/${orderId(1)}`])
    expect(rows()[0]).toHaveTextContent('Unread.')
    expect(rows()[0]).toHaveTextContent('Order SHF-3 is paid.')
    expect(rows()[0].querySelector('time')).toHaveAttribute('datetime')
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('3 unread')
    expect(screen.getByRole('button', { name: 'All 3' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a notification with no order as a plain row', async () => {
    server.items[2].data = null as never
    renderPage()
    await screen.findByText('Payment received 3')
    expect(screen.getByText('Payment received 3').closest('a')).toBeNull()
  })

  it('loads the next page of 20 with Show more, from the server total', async () => {
    serve(45)
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Payment received 45')
    expect(rows()).toHaveLength(20)
    expect(screen.getByText('Showing 20 of 45')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(rows()).toHaveLength(40))
    expect(server.calls).toContain('GET /notifications?page=2&limit=20')
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(rows()).toHaveLength(45))
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  it('asks the server for unread only, and says when everything is read', async () => {
    server.items[0].readAt = server.items[1].readAt = '2026-01-02T00:00:00.000Z'
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Payment received 3')
    await user.click(screen.getByRole('button', { name: 'Unread 1' }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(server.calls).toContain('GET /notifications?page=1&limit=20&unreadOnly=true')
    expect(screen.getByRole('button', { name: 'All 3' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all' }))
    await waitFor(() => expect(rows()).toHaveLength(3))
  })

  it('marks all read on the server, thanks the shopper, and keeps the bell badge in step', async () => {
    const user = userEvent.setup()
    renderPage(true)
    expect(await screen.findByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument()
    await screen.findByText('Payment received 3')
    const markAll = screen.getByRole('button', { name: 'Mark all read' })
    await user.click(markAll)
    expect(markAll).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('0 unread')
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(server.calls).toContain('POST /notifications/read-all')
    expect(toast.show).toHaveBeenCalledWith({ kind: 'success', message: 'All notifications marked as read.' })
  })

  it('marks only the opened notification read and goes to its order', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('link', { name: /Payment received 2/ }))
    expect(where()).toBe(`/orders/${orderId(2)}`)
    await waitFor(() => expect(server.calls.filter((c) => c.startsWith('POST'))).toEqual([`POST /notifications/${server.items[1].id}/read`]))
    expect(server.items.map((n) => !!n.readAt)).toEqual([false, true, false])
  })

  it('rolls the row back and says so when marking one read fails', async () => {
    server.fail = (method) => method === 'POST'
    const user = userEvent.setup()
    renderPage()
    const link = await screen.findByRole('link', { name: /Payment received 2/ })
    link.addEventListener('click', (event) => event.preventDefault())
    await user.click(link)
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', message: expect.stringMatching(/couldn.t mark that notification/) })))
    expect(screen.getByRole('status')).toHaveTextContent('3 unread')
  })

  it('rolls everything back and says so when mark all read fails', async () => {
    server.fail = (method) => method === 'POST'
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Payment received 3')
    await user.click(screen.getByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' })))
    expect(screen.getByRole('status')).toHaveTextContent('3 unread')
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeEnabled()
    expect(toast.show).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }))
  })

  it('says what went wrong and retries', async () => {
    server.fail = () => true
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('connection dropped')
    server.fail = undefined
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Payment received 3')).toBeInTheDocument()
  })

  it('tells a refused session to sign in again', async () => {
    api.request.mockRejectedValue(new ProductListError('forbidden', undefined, 401))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in again')
  })

  it('makes the shopper wait out a 429 before trying again', async () => {
    api.request.mockRejectedValue(new ProductListError('rate-limit', undefined, 429, undefined, 30_000))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Try again in 30s' })).toBeDisabled()
  })

  it('says there is nothing yet and points to the shop', async () => {
    serve(0)
    renderPage()
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/shop')
  })
})
