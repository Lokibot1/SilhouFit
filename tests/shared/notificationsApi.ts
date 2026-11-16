import type { Page, Route } from '@playwright/test'
import type { ApiNotification } from '../fixtures/notifications'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const PAGE_ORIGIN = 'http://localhost:5173'

export { apiNotification as notification, orderId } from '../fixtures/notifications'

export interface NotificationsMock {
  /** The server's notifications; the list answers them newest first. Push to it to add one. */
  items: ApiNotification[]
  /** The query strings of GET /notifications, in order. */
  lists: URLSearchParams[]
  /** Every POST /notifications/:id/read (the id) and POST /notifications/read-all ('all'), in order. */
  marks: string[]
  /** Overrides for the next list or mark request: return a reply, or undefined to answer normally. */
  on: { list?: () => { status: number; json: unknown } | undefined; mark?: () => { status: number; json: unknown } | undefined }
}

/**
 * Stands in for the notifications API (GET /notifications, GET /notifications/unread-count, POST /notifications/:id/read,
 * POST /notifications/read-all) with an in-memory list: newest first, 20 a page, `unreadOnly`, `{ data, meta }`.
 * Register it after mockAuth. Only requests to another origin than the page are answered (the dev server also serves /notifications and /src/.../notifications/*).
 */
export async function mockNotifications(page: Page, initial: ApiNotification[] = []): Promise<NotificationsMock> {
  const mock: NotificationsMock = { items: [...initial], lists: [], marks: [], on: {} }
  const handle = async (route: Route) => {
    const request = route.request()
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(request.url())
    const reply = (status: number, json: unknown) => route.fulfill({ status, json, headers: CORS })
    const unread = mock.items.filter((n) => !n.readAt)
    const [, , id = null, action = null] = url.pathname.split('/')

    if (method === 'GET' && !id) {
      mock.lists.push(url.searchParams)
      const override = mock.on.list?.()
      if (override) return reply(override.status, override.json)
      const pageNo = Number(url.searchParams.get('page')) || 1
      const matched = (url.searchParams.get('unreadOnly') === 'true' ? unread : mock.items).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const totalPages = Math.ceil(matched.length / 20)
      return reply(200, {
        data: matched.slice((pageNo - 1) * 20, pageNo * 20),
        meta: { total: matched.length, page: pageNo, limit: 20, totalPages, hasNextPage: pageNo < totalPages, hasPreviousPage: pageNo > 1 },
      })
    }
    if (method === 'GET' && id === 'unread-count') return reply(200, { count: unread.length })

    if (method === 'POST' && id) {
      mock.marks.push(id === 'read-all' ? 'all' : id)
      const override = mock.on.mark?.()
      if (override) return reply(override.status, override.json)
      if (id === 'read-all') {
        unread.forEach((n) => (n.readAt = '2026-11-04T02:00:00.000Z'))
        return reply(201, { updated: unread.length })
      }
      const found = mock.items.find((n) => n.id === id)
      if (!found || action !== 'read') return reply(404, { statusCode: 404, message: 'Notification not found', error: 'Not Found' })
      found.readAt ??= '2026-11-04T02:00:00.000Z'
      return reply(201, found)
    }
    return reply(405, {})
  }

  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/notifications(\/|$)/.test(url.pathname), handle)
  return mock
}
