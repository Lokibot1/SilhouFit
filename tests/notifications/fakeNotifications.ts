import { ProductListError } from '../../src/service/fetchProductList'
import type { ApiNotification } from '../fixtures/notifications'

/**
 * An in-memory notifications API for `request()` (mock it with `api.request.mockImplementation(server.handle)`): newest first,
 * 20 a page, the four endpoints. `fail` makes a call reject like a dropped connection.
 */
export function fakeNotifications(initial: ApiNotification[]) {
  const server = {
    items: [...initial],
    calls: [] as string[],
    fail: undefined as ((method: string, path: string) => boolean) | undefined,
    handle: async (method: string, path: string): Promise<unknown> => {
      server.calls.push(`${method} ${path}`)
      if (server.fail?.(method, path)) throw new ProductListError('network')
      const url = new URL(path, 'http://api.test')
      const unread = server.items.filter((n) => !n.readAt)
      if (method === 'GET' && url.pathname === '/notifications/unread-count') return { count: unread.length }
      if (method === 'GET' && url.pathname === '/notifications') {
        const page = Number(url.searchParams.get('page'))
        const matched = (url.searchParams.get('unreadOnly') === 'true' ? unread : server.items).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        const totalPages = Math.ceil(matched.length / 20)
        return { data: matched.slice((page - 1) * 20, page * 20), meta: { total: matched.length, page, limit: 20, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } }
      }
      if (method === 'POST' && url.pathname === '/notifications/read-all') {
        unread.forEach((n) => (n.readAt = '2026-11-04T02:00:00.000Z'))
        return { updated: unread.length }
      }
      const read = /^\/notifications\/([^/]+)\/read$/.exec(url.pathname)
      const found = read && server.items.find((n) => n.id === read[1])
      if (method === 'POST' && found) {
        found.readAt ??= '2026-11-04T02:00:00.000Z'
        return found
      }
      throw new ProductListError('not-found')
    },
  }
  return server
}
