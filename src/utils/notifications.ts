import type { CustomerOrder, OrderStatus } from '../service/ordersApi'
import { formatOrderTime, manilaDay } from './format'

export const NOTIFICATION_LIMIT = 10

/** What each status says about the order, to follow "Your order". */
const SENTENCE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'is waiting for payment',
  PAYMENT_FAILED: 'had a failed payment',
  PAID: 'was paid',
  PROCESSING: 'is being prepared',
  DISPATCHED: 'is on its way',
  OUT_FOR_DELIVERY: 'is out for delivery',
  DELIVERED: 'was delivered',
  CANCELLED: 'was cancelled',
  REFUNDED: 'was refunded',
}

export const notificationSentence = (status: OrderStatus) => `Your order ${SENTENCE[status]}`

export interface Notification {
  id: string
  orderNumber: string
  status: OrderStatus
  sentence: string
  /** The best time we have for the order's current status, an ISO string. */
  at: string
  /** The first item's photo and name, for the picture beside the entry. */
  imageUrl: string | null
  itemName: string
}

/** When the order reached its current status, falling back to when it was placed. */
function stamp(order: CustomerOrder) {
  const shipment = order.shipment
  switch (order.status) {
    case 'DELIVERED':
      return shipment?.deliveredAt ?? order.createdAt
    case 'CANCELLED':
      return order.cancelledAt ?? order.createdAt
    case 'DISPATCHED':
    case 'OUT_FOR_DELIVERY':
      return shipment?.pickupTime ?? order.paidAt ?? order.createdAt
    case 'PAID':
    case 'PROCESSING':
    case 'REFUNDED':
      return order.paidAt ?? order.createdAt
    default:
      return order.createdAt
  }
}

/** One entry per order for the latest orders, newest first. */
export function buildNotifications(orders: CustomerOrder[], limit = NOTIFICATION_LIMIT): Notification[] {
  return [...orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      sentence: notificationSentence(order.status),
      at: stamp(order),
      imageUrl: order.items[0]?.imageUrl ?? null,
      itemName: order.items[0]?.name ?? 'Your order',
    }))
}

/** "Just now", "5 min ago", "3 hr ago", "Yesterday", then "Oct 22, 3:45 PM" (Manila time, 12-hour). */
export function relativeTime(iso: string, now = new Date()) {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  const day = manilaDay(iso)
  if (day === manilaDay(now.toISOString())) return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} hr ago`
  if (day === manilaDay(new Date(now.getTime() - 86_400_000).toISOString())) return 'Yesterday'
  return formatOrderTime(iso)
}

// shortcut: kept per browser; move to the server when a notifications endpoint exists
const KEY = 'silhoufit-notifications-seen'

/** The status each order had when it was last seen: order id to status. */
export type Seen = Record<string, string>

/** An entry is unread when its status is not the one last seen (a new order has none). */
export const isUnread = (entry: Pick<Notification, 'id' | 'status'>, seen: Seen) => seen[entry.id] !== entry.status

export const unreadCount = (entries: Notification[], seen: Seen) => entries.filter((entry) => isUnread(entry, seen)).length

/** Everything shown, as seen. Orders no longer shown drop out. */
export const markSeen = (entries: Pick<Notification, 'id' | 'status'>[]): Seen => Object.fromEntries(entries.map((entry) => [entry.id, entry.status]))

/** What this email last saw; nothing when there is no email, the data is unreadable, or it is someone else's. */
export function loadSeen(email: string | undefined): Seen {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { email?: unknown; seen?: unknown } | null
    if (!email || !raw || typeof raw !== 'object' || raw.email !== email || !raw.seen || typeof raw.seen !== 'object' || Array.isArray(raw.seen)) return {}
    return Object.fromEntries(Object.entries(raw.seen).filter((pair): pair is [string, string] => typeof pair[1] === 'string'))
  } catch {
    return {}
  }
}

const listeners = new Set<() => void>()

/** Runs when the seen list is saved here or in another tab, so the bell and the notifications page stay in step. */
export function onSeenChanged(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

export function saveSeen(email: string | undefined, seen: Seen) {
  if (!email) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ email, seen }))
    listeners.forEach((listener) => listener())
  } catch {
    // Storage blocked: the entries show as unread again next visit.
  }
}
