import type { CustomerOrder, OrderStatus, PaymentStatus, ShipmentStatus } from '../service/ordersApi'
import type { PlacedOrder } from './checkout'

export type OrderTab = 'all' | 'to-pay' | 'to-ship' | 'to-receive' | 'completed' | 'cancelled'

/** The status tabs. A tab with `statuses: null` shows everything (a refunded order appears there only). */
export const ORDER_TABS: { id: OrderTab; label: string; statuses: OrderStatus[] | null }[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'to-pay', label: 'To pay', statuses: ['PENDING_PAYMENT', 'PAYMENT_FAILED'] },
  { id: 'to-ship', label: 'To ship', statuses: ['PAID', 'PROCESSING'] },
  { id: 'to-receive', label: 'To receive', statuses: ['DISPATCHED', 'OUT_FOR_DELIVERY'] },
  { id: 'completed', label: 'Completed', statuses: ['DELIVERED'] },
  { id: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED'] },
]

/** The tab named in the URL, or 'all' for anything else. */
export const parseTab = (value: string | null): OrderTab => ORDER_TABS.find((tab) => tab.id === value)?.id ?? 'all'

export const tabLabel = (tab: OrderTab) => ORDER_TABS.find((t) => t.id === tab)!.label

export function matchesTab(order: CustomerOrder, tab: OrderTab) {
  const statuses = ORDER_TABS.find((t) => t.id === tab)!.statuses
  return !statuses || statuses.includes(order.status)
}

export function tabCounts(orders: CustomerOrder[]): Record<OrderTab, number> {
  return Object.fromEntries(ORDER_TABS.map((tab) => [tab.id, orders.filter((order) => matchesTab(order, tab.id)).length])) as Record<OrderTab, number>
}

/** Orders in a tab whose number or any product name holds the typed text (plain text, ignoring case). */
export function filterOrders(orders: CustomerOrder[], tab: OrderTab, query: string) {
  const needle = query.trim().toLowerCase()
  return orders.filter(
    (order) =>
      matchesTab(order, tab) &&
      (!needle || order.orderNumber.toLowerCase().includes(needle) || order.items.some((item) => item.name.toLowerCase().includes(needle))),
  )
}

/** Only an unpaid order waiting for payment can still be cancelled. */
export const canCancel = (order: Pick<CustomerOrder, 'status' | 'paymentStatus'>) => order.status === 'PENDING_PAYMENT' && order.paymentStatus !== 'PAID'

/** The API opens a payment page for an unpaid order, or one whose last payment failed. */
export const canPay = (order: Pick<CustomerOrder, 'status' | 'paymentStatus'>) => (order.status === 'PENDING_PAYMENT' || order.status === 'PAYMENT_FAILED') && order.paymentStatus !== 'PAID'

// What staff can do to an order. The API refuses a move for an unpaid order and out of a closed one; these rules only offer what it will take.
type Actionable = Pick<CustomerOrder, 'status' | 'paymentStatus'> & { shipment: { status: ShipmentStatus; externalOrderId: string | null } | null }

const CLOSED: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'REFUNDED']
/** Delivered, cancelled and refunded orders cannot change status. */
export const isClosed = (order: Pick<CustomerOrder, 'status'>) => CLOSED.includes(order.status)

export interface AdvanceAction {
  label: string
  status: OrderStatus
  /** The success message. */
  done: string
}

const PREPARING: AdvanceAction = { label: 'Mark as preparing', status: 'PROCESSING', done: 'Order marked as preparing' }
const OUT: AdvanceAction = { label: 'Mark out for delivery', status: 'OUT_FOR_DELIVERY', done: 'Order marked out for delivery' }
const DELIVERED: AdvanceAction = { label: 'Mark delivered', status: 'DELIVERED', done: 'Order marked delivered' }

/** The status moves staff can make by hand, paid orders only. A rider is booked with Book rider, never by setting Shipped. */
export function advanceActions(order: Pick<CustomerOrder, 'status' | 'paymentStatus'>): AdvanceAction[] {
  if (order.paymentStatus !== 'PAID') return []
  if (order.status === 'PAID') return [PREPARING]
  if (order.status === 'DISPATCHED') return [OUT, DELIVERED]
  if (order.status === 'OUT_FOR_DELIVERY') return [DELIVERED]
  return []
}

const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  QUOTED: 'Not booked yet',
  PENDING_DISPATCH: 'Ready to book',
  DISPATCHING: 'Booking a rider',
  ASSIGNING_DRIVER: 'Finding a driver',
  ON_GOING: 'Driver on the way',
  PICKED_UP: 'Picked up',
  COMPLETED: 'Delivered',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
}
export const shipmentStatusLabel = (status: ShipmentStatus) => SHIPMENT_LABEL[status]

const BOOKABLE: ShipmentStatus[] = ['QUOTED', 'PENDING_DISPATCH', 'CANCELLED', 'FAILED']

/** Why Book rider is off, or null when a rider can be booked. */
export function dispatchBlock(order: Actionable): string | null {
  if (isClosed(order)) return 'This order is closed.'
  if (order.paymentStatus !== 'PAID') return 'Book a rider once the payment is confirmed.'
  if (order.status === 'DISPATCHED' || order.status === 'OUT_FOR_DELIVERY') return 'A rider is already booked for this order.'
  if (order.status !== 'PAID' && order.status !== 'PROCESSING') return 'This order is not ready for a rider.'
  if (!order.shipment) return 'This order has no delivery to book.'
  if (order.shipment.status === 'DISPATCHING') return 'A rider is being booked for this order.'
  return BOOKABLE.includes(order.shipment.status) ? null : 'A rider is already booked for this order.'
}

// A booking with the courier that has not finished or been cancelled.
const hasActiveBooking = (order: Pick<Actionable, 'shipment'>) =>
  !!order.shipment?.externalOrderId && order.shipment.status !== 'COMPLETED' && order.shipment.status !== 'CANCELLED'

/** Why Cancel order is off, or null when it can be cancelled. Cancelling does not cancel a rider, so the delivery goes first. */
export function cancelOrderBlock(order: Actionable): string | null {
  if (isClosed(order)) return 'This order is closed.'
  if (order.shipment?.status === 'DISPATCHING') return 'A rider is being booked. Wait for it to finish.'
  return hasActiveBooking(order) ? 'Cancel the delivery first.' : null
}

/** A rider is booked and the order is not delivered yet. */
export const canCancelDelivery = (order: Actionable) => hasActiveBooking(order) && order.status !== 'DELIVERED'

export type ChipTone = 'alert' | 'outline' | 'filled' | 'muted'

/** How each status reads on a chip: the words, and which of the four looks it gets. */
export const STATUS_CHIP: Record<OrderStatus, { label: string; tone: ChipTone }> = {
  PENDING_PAYMENT: { label: 'Awaiting payment', tone: 'alert' },
  PAYMENT_FAILED: { label: 'Payment failed', tone: 'alert' },
  PAID: { label: 'Paid', tone: 'outline' },
  PROCESSING: { label: 'Preparing', tone: 'outline' },
  DISPATCHED: { label: 'Shipped', tone: 'filled' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tone: 'filled' },
  DELIVERED: { label: 'Delivered', tone: 'outline' },
  CANCELLED: { label: 'Cancelled', tone: 'muted' },
  REFUNDED: { label: 'Refunded', tone: 'muted' },
}

export const itemCount = (order: CustomerOrder) => order.items.reduce((sum, item) => sum + item.qty, 0)

/** "Linen Camp Shirt", or "Linen Camp Shirt + 2 more". */
export function orderTitle(order: CustomerOrder) {
  const [first, ...rest] = order.items
  if (!first) return order.orderNumber
  return rest.length ? `${first.name} + ${rest.length} more` : first.name
}

export type StepState = 'done' | 'current' | 'upcoming' | 'cancelled'

export interface TimelineStep {
  key: string
  label: string
  /** An ISO time, when the API has one for this step. */
  at: string | null
  state: StepState
  /** Extra words under the step (why it was cancelled). */
  note?: string
}

const FLOW = [
  { key: 'placed', label: 'Placed' },
  { key: 'paid', label: 'Paid' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'out', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
]

// The step each live status is working on; steps before it are done. A delivered order has none left.
const CURRENT_STEP: Partial<Record<OrderStatus, number>> = { PENDING_PAYMENT: 1, PAYMENT_FAILED: 1, PAID: 2, PROCESSING: 2, DISPATCHED: 3, OUT_FOR_DELIVERY: 4 }

/** The order's journey as steps. A cancelled order stops at Cancelled; a refunded one shows what happened, then Refunded. */
export function buildTimeline(order: CustomerOrder): TimelineStep[] {
  const stamps = [order.createdAt, order.paidAt, null, order.shipment?.pickupTime ?? null, null, order.shipment?.deliveredAt ?? null]
  const placed: TimelineStep = { key: 'placed', label: 'Placed', at: order.createdAt, state: 'done' }

  if (order.status === 'CANCELLED') {
    return [placed, { key: 'cancelled', label: 'Cancelled', at: order.cancelledAt, state: 'cancelled', note: order.cancellationReason ?? undefined }]
  }
  if (order.status === 'REFUNDED') {
    const reached = order.shipment?.deliveredAt ? 6 : order.shipment?.pickupTime ? 4 : order.paidAt ? 2 : 1
    const done = FLOW.slice(0, reached).map((step, i): TimelineStep => ({ ...step, at: stamps[i], state: 'done' }))
    return [...done, { key: 'refunded', label: 'Refunded', at: null, state: 'current' }]
  }
  const current = CURRENT_STEP[order.status]
  return FLOW.map((step, i): TimelineStep => {
    const state: StepState = current === undefined || i < current ? 'done' : i === current ? 'current' : 'upcoming'
    const failed = step.key === 'paid' && order.status === 'PAYMENT_FAILED'
    return { ...step, label: failed ? 'Payment failed' : step.label, at: state === 'upcoming' ? null : stamps[i], state }
  })
}

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  UNPAID: 'Awaiting payment',
  PENDING: 'Payment pending',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
}
export const paymentStatusLabel = (status: PaymentStatus) => PAYMENT_LABEL[status]

/** An order as the receipt page and the PDF read it. There is no delivery estimate yet, so `eta` is empty and left off. */
export function adaptOrderToReceipt(order: CustomerOrder): PlacedOrder {
  return {
    orderId: order.orderNumber,
    placedAt: order.createdAt,
    items: order.items.map((item) => ({ name: item.name, size: item.size ?? '', color: item.color ?? '', qty: item.qty, price: item.unitPrice, arReady: false })),
    total: order.total,
    shipping: order.shipping,
    payment: PAYMENT_LABEL[order.paymentStatus],
    fulfilment: 'Delivery',
    eta: '',
    recipient: order.address.recipientName,
    address: [order.address.line, `${order.address.city} ${order.address.postalCode}`.trim()].filter(Boolean).join(', '),
    phone: order.address.phone,
    note: order.note ?? undefined,
  }
}

/** Delivered, cancelled and refunded orders can be bought again. */
export const canBuyAgain = (order: Pick<CustomerOrder, 'status'>) => order.status === 'DELIVERED' || order.status === 'CANCELLED' || order.status === 'REFUNDED'

const SHIPPED: OrderStatus[] = ['DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED']

/** From dispatch on, the order has a courier to show. */
export const hasShipped = (order: Pick<CustomerOrder, 'status' | 'shipment'>) => SHIPPED.includes(order.status) && order.shipment !== null

/** The courier's tracking page, for an order on its way; only a web address is ever linked. */
export function trackingLink(order: Pick<CustomerOrder, 'status' | 'shipment'>): string | null {
  const url = order.shipment?.trackingUrl
  return (order.status === 'DISPATCHED' || order.status === 'OUT_FOR_DELIVERY') && url && /^https?:\/\//i.test(url) ? url : null
}
