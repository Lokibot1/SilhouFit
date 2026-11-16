import { ProductListError, request } from './fetchProductList'
import { isRecord, text } from './ordersApi'

const PAGE_SIZE = 20

export interface ServerNotification {
  id: string
  type: string
  /** Display-ready English from the server. */
  title: string
  body: string | null
  data: Record<string, unknown> | null
  readAt: string | null
  createdAt: string
}

/** The trust boundary: an entry without an id, title and time is dropped, the rest is coerced. */
export function toNotification(value: unknown): ServerNotification | null {
  if (!isRecord(value)) return null
  const { id, title, createdAt } = value
  if (typeof id !== 'string' || typeof title !== 'string' || typeof createdAt !== 'string') return null
  return { id, type: text(value.type) ?? '', title, body: text(value.body), data: isRecord(value.data) && !Array.isArray(value.data) ? value.data : null, readAt: text(value.readAt), createdAt }
}

const listeners = new Set<() => void>()

/** Calls `run` after a notification was marked read, so the bell and the page can read the list again. Returns the unsubscribe. */
export function onNotificationsChanged(run: () => void): () => void {
  listeners.add(run)
  return () => {
    listeners.delete(run)
  }
}

export async function fetchNotifications({ page, unreadOnly }: { page: number; unreadOnly: boolean }, { signal }: { signal?: AbortSignal } = {}) {
  const body = await request('GET', `/notifications?page=${page}&limit=${PAGE_SIZE}${unreadOnly ? '&unreadOnly=true' : ''}`, undefined, signal)
  if (!isRecord(body) || !Array.isArray(body.data)) throw new ProductListError('server')
  const items = body.data.flatMap((entry) => toNotification(entry) ?? [])
  const meta = isRecord(body.meta) ? body.meta : {}
  return { items, total: typeof meta.total === 'number' ? meta.total : items.length, hasNextPage: meta.hasNextPage === true }
}

export async function fetchUnreadCount({ signal }: { signal?: AbortSignal } = {}) {
  const body = await request('GET', '/notifications/unread-count', undefined, signal)
  if (!isRecord(body) || typeof body.count !== 'number' || !Number.isFinite(body.count)) throw new ProductListError('server')
  return body.count
}

export async function markNotificationRead(id: string) {
  await request('POST', `/notifications/${encodeURIComponent(id)}/read`, undefined)
  listeners.forEach((run) => run())
}

export async function markAllNotificationsRead() {
  await request('POST', '/notifications/read-all', undefined)
  listeners.forEach((run) => run())
}

/** Where a notification leads: the order it is about, when it names one. */
export const notificationHref = (n: ServerNotification) => (typeof n.data?.orderId === 'string' && n.data.orderId ? `/orders/${n.data.orderId}` : null)
