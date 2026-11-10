import { simulateRequest, type RequestOptions } from './simulateRequest'

// Stand-in for the staff notifications endpoints behind the top bar's bell. The backend has no notifications module yet.
// Swap fetchStaffNotifications for its call when it exists:
//   fetchStaffNotifications -> GET /notifications (newest first; per item: message, createdAt, read)
//   marking all as read     -> PATCH /notifications/read (the bell keeps that state locally until then)
// Until then the list is a fixed sample, dated from now so it always reads as recent.

/** True while the notifications are placeholders; the panel says so. Set to false when the real endpoint is wired. */
export const NOTIFICATIONS_SAMPLE_DATA = true

/** What the notification is about: a product that is low (`low`) or sold out (`out`), or an order. */
export type NotificationKind = 'low' | 'out' | 'order'

export interface StaffNotification {
  id: string
  kind: NotificationKind
  message: string
  /** ISO time. */
  createdAt: string
  read: boolean
}

// Dev-only hooks: /staff?fail=notifications for the error state, /staff?fail=empty for the empty one.
const failParam = () => (import.meta.env.DEV ? new URLSearchParams(location.search).get('fail') : null)

const SAMPLE: { kind: NotificationKind; message: string; minutesAgo: number; read: boolean }[] = [
  { kind: 'low', message: 'Fence-Line Blazer is low on stock: 4 left', minutesAgo: 12, read: false },
  { kind: 'out', message: 'Washed Black Tee is sold out', minutesAgo: 47, read: false },
  { kind: 'order', message: 'New order SF-10187 from Maria Santos', minutesAgo: 95, read: false },
  { kind: 'low', message: 'Heritage Polo is low on stock: 6 left', minutesAgo: 26 * 60, read: true },
  { kind: 'order', message: 'Online order SF-10184 is ready to pack', minutesAgo: 30 * 60, read: true },
]

/** The latest notifications, newest first. */
export async function fetchStaffNotifications({ signal, delayMs = 600 }: RequestOptions = {}): Promise<StaffNotification[]> {
  await simulateRequest(delayMs, signal, () => failParam() === 'notifications').catch((error: Error) => {
    throw error.name === 'AbortError' ? error : Object.assign(error, { kind: 'network' })
  })
  if (failParam() === 'empty') return []
  const now = Date.now()
  return SAMPLE.map(({ kind, message, minutesAgo, read }, n) => ({
    id: `n${n + 1}`,
    kind,
    message,
    createdAt: new Date(now - minutesAgo * 60_000).toISOString(),
    read,
  }))
}
