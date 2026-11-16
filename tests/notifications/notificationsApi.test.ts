import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError } from '../../src/service/fetchProductList'
import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead, notificationHref, onNotificationsChanged, toNotification } from '../../src/service/notificationsApi'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}))

const fetchMock = vi.fn()
const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status, headers }))
const called = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { path: url.replace(String(import.meta.env.VITE_API_URL), ''), method: init.method }
}

beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

const entry = (over: object = {}) => ({ id: 'n1', type: 'ORDER_PAID', title: 'Payment received', body: 'We got it.', data: { orderId: 'o1' }, readAt: null, createdAt: '2026-11-04T01:00:00.000Z', ...over })

describe('toNotification', () => {
  it('keeps a well-formed entry', () => {
    expect(toNotification(entry())).toEqual(entry())
  })

  it('coerces a missing body, read time and data', () => {
    expect(toNotification(entry({ body: '', readAt: 3, data: [1] }))).toMatchObject({ body: null, readAt: null, data: null })
  })

  it.each([null, 'x', {}, entry({ id: 1 }), entry({ title: null }), entry({ createdAt: undefined })])('drops %j', (value) => {
    expect(toNotification(value)).toBeNull()
  })
})

describe('notificationHref', () => {
  it('links to the order named in the data, and nowhere without one', () => {
    expect(notificationHref(toNotification(entry())!)).toBe('/orders/o1')
    expect(notificationHref(toNotification(entry({ data: null }))!)).toBeNull()
    expect(notificationHref(toNotification(entry({ data: { orderId: 7 } }))!)).toBeNull()
  })
})

describe('fetchNotifications', () => {
  const meta = { total: 45, page: 2, limit: 20, totalPages: 3, hasNextPage: true, hasPreviousPage: true }

  it('asks for a page of 20, newest first, and reads the total', async () => {
    reply({ data: [entry()], meta })
    expect(await fetchNotifications({ page: 2, unreadOnly: false })).toEqual({ items: [entry()], total: 45, hasNextPage: true })
    expect(called()).toEqual({ path: '/notifications?page=2&limit=20', method: 'GET' })
  })

  it('adds unreadOnly only when asked', async () => {
    reply({ data: [], meta })
    await fetchNotifications({ page: 1, unreadOnly: true })
    expect(called().path).toBe('/notifications?page=1&limit=20&unreadOnly=true')
  })

  it('drops a bad entry and keeps the rest', async () => {
    reply({ data: [entry({ id: 5 }), entry({ id: 'n2' })], meta })
    expect((await fetchNotifications({ page: 1, unreadOnly: false })).items.map((n) => n.id)).toEqual(['n2'])
  })

  it('rejects a body that is not a list', async () => {
    reply({ data: 'nope' })
    await expect(fetchNotifications({ page: 1, unreadOnly: false })).rejects.toMatchObject({ kind: 'server' })
  })

  it('carries the Retry-After of a 429', async () => {
    reply({ message: 'slow down' }, 429, { 'Retry-After': '30' })
    const failure = await fetchNotifications({ page: 1, unreadOnly: false }).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(ProductListError)
    expect(failure).toMatchObject({ kind: 'rate-limit', retryAfterMs: 30_000 })
  })

  it('maps 401 and 403 to forbidden', async () => {
    reply({}, 401)
    await expect(fetchNotifications({ page: 1, unreadOnly: false })).rejects.toMatchObject({ kind: 'forbidden', status: 401 })
  })
})

describe('fetchUnreadCount', () => {
  it('reads the count', async () => {
    reply({ count: 3 })
    expect(await fetchUnreadCount()).toBe(3)
    expect(called()).toEqual({ path: '/notifications/unread-count', method: 'GET' })
  })

  it('rejects anything but a number', async () => {
    reply({ count: '3' })
    await expect(fetchUnreadCount()).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('marking read', () => {
  it('posts to the id and tells the listeners', async () => {
    const run = vi.fn()
    const off = onNotificationsChanged(run)
    reply(entry({ readAt: '2026-11-04T02:00:00.000Z' }))
    await markNotificationRead('n 1')
    expect(called()).toEqual({ path: '/notifications/n%201/read', method: 'POST' })
    expect(run).toHaveBeenCalledTimes(1)
    off()
  })

  it('posts read-all and tells the listeners', async () => {
    const run = vi.fn()
    const off = onNotificationsChanged(run)
    reply({ updated: 2 })
    await markAllNotificationsRead()
    expect(called()).toEqual({ path: '/notifications/read-all', method: 'POST' })
    expect(run).toHaveBeenCalledTimes(1)
    off()
  })

  it('does not tell the listeners when it fails', async () => {
    const run = vi.fn()
    const off = onNotificationsChanged(run)
    reply({}, 500)
    await expect(markAllNotificationsRead()).rejects.toMatchObject({ kind: 'server' })
    expect(run).not.toHaveBeenCalled()
    off()
  })
})
