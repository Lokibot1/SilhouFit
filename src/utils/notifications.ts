import type { ProductListError } from '../service/fetchProductList'
import type { OrderStatus } from '../service/ordersApi'
import { formatOrderTime, manilaDay } from './format'

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

export type Tone = 'success' | 'info' | 'warning' | 'danger'

const TONES: Record<string, Tone> = {
  ORDER_PAID: 'success',
  REFUND_SUCCEEDED: 'success',
  MESSAGING_UNBLOCKED: 'success',
  PRODUCT_LOW_STOCK: 'warning',
  REFUND_ACTION_REQUIRED: 'warning',
  PAYMENT_FAILED: 'danger',
  ORDER_CANCELLED: 'danger',
  PRODUCT_SOLD_OUT: 'danger',
  MESSAGING_BLOCKED: 'danger',
}

/** The accent a notification's toast takes; anything not listed is plain info. */
export const notificationTone = (type: string): Tone => TONES[type] ?? 'info'

/** "Just now", "5 min ago", "3 hr ago", "Yesterday", then "Oct 22, 3:45 PM" (Manila time, 12-hour). */
export function relativeTime(iso: string, now = new Date()) {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  const day = manilaDay(iso)
  if (day === manilaDay(now.toISOString())) return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} hr ago`
  if (day === manilaDay(new Date(now.getTime() - 86_400_000).toISOString())) return 'Yesterday'
  return formatOrderTime(iso)
}

/** What went wrong and what to do about it, for a failed read of the notifications. */
export function failureCopy(error: ProductListError | null) {
  if (error?.kind === 'forbidden') return 'Your session has ended, so we could not read your notifications. Sign in again, then come back.'
  if (error?.kind === 'rate-limit') return 'Too many requests were sent just now, so the notifications did not load. Wait for the countdown, then try again.'
  if (error?.kind === 'network') return 'The connection dropped before the notifications loaded. Check your connection, then try again.'
  return 'The server had a problem loading your notifications. Try again in a moment.'
}
