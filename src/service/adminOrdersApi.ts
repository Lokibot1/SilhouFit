import { ProductListError, request } from './fetchProductList'
import {
  isMoney,
  isRecord,
  ORDER_STATUSES,
  oneOf,
  PAYMENT_STATUSES,
  SHIPMENT_STATUSES,
  text,
  toOrder,
  type CustomerOrder,
  type CustomerOrderItem,
  type CustomerShipment,
  type OrderStatus,
  type PaymentStatus,
  type ShipmentStatus,
} from './ordersApi'
import type { RequestOptions } from './simulateRequest'

// Staff order management: the API's /admin/orders endpoints (staff role or above). The API rejects query keys it does not know,
// so only the keys below are ever sent. It has no sort: lists come newest first.

export interface AdminOrderRow {
  id: string
  orderNumber: string
  /** The customer's name, or "Customer account removed" once the account is gone. */
  customerName: string
  customerEmail: string | null
  status: OrderStatus
  paymentStatus: PaymentStatus
  total: number
  /** Order lines, not units. */
  itemCount: number
  shipmentStatus: ShipmentStatus | null
  /** ISO time. */
  placedAt: string
}

export interface AdminOrdersPage {
  data: AdminOrderRow[]
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean }
}

export interface AdminOrdersParams {
  page?: number
  /** The API allows 100 at most. */
  limit?: number
  status?: OrderStatus
  paymentStatus?: PaymentStatus
  /** Inclusive dates, YYYY-MM-DD in Asia/Manila. */
  from?: string
  to?: string
  /** Order number, customer name or email. */
  search?: string
}

export interface AdminOrderItem extends CustomerOrderItem {
  /** Pieces of the variant in stock now; null once the variant was deleted. */
  stock: number | null
}

export interface AdminShipment extends CustomerShipment {
  /** The courier's booking; null until a rider is booked. */
  externalOrderId: string | null
}

export interface AdminPayment {
  id: string
  provider: string
  /** The API's PaymentMethod, e.g. GCASH. */
  method: string
  amount: number
  fee: number | null
  net: number | null
  status: PaymentStatus
  at: string
}

export interface AdminShipmentEvent {
  id: string
  /** What the courier reported, e.g. ASSIGNING_DRIVER. */
  label: string
  reason: string | null
  at: string
}

export interface AdminOrderDetail extends CustomerOrder {
  customer: { name: string; email: string } | null
  adminNotes: string | null
  items: AdminOrderItem[]
  shipment: AdminShipment | null
  payments: AdminPayment[]
  /** Oldest first. */
  events: AdminShipmentEvent[]
}

export interface AdminOrderMetrics {
  pendingPaymentCount: number
  processingCount: number
  dispatchedCount: number
  deliveredTodayCount: number
  totalRevenue: number
}

const bad = () => new ProductListError('server')
export const isTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))

export const REMOVED = 'Customer account removed'

export function toCustomer(value: unknown): { name: string; email: string } | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value) || typeof value.email !== 'string') throw bad()
  return { name: text(value.fullName) ?? value.email, email: value.email }
}

function toRow(value: unknown): AdminOrderRow {
  if (!isRecord(value)) throw bad()
  const { id, orderNumber, status, paymentStatus, totalAmount, itemsCount, createdAt, shipmentStatus } = value
  if (typeof id !== 'string' || typeof orderNumber !== 'string' || !isTime(createdAt)) throw bad()
  if (!oneOf(ORDER_STATUSES, status) || !oneOf(PAYMENT_STATUSES, paymentStatus) || !isMoney(totalAmount) || !isMoney(itemsCount)) throw bad()
  if (shipmentStatus !== null && shipmentStatus !== undefined && !oneOf(SHIPMENT_STATUSES, shipmentStatus)) throw bad()
  const customer = toCustomer(value.customer)
  return {
    id,
    orderNumber,
    customerName: customer?.name ?? REMOVED,
    customerEmail: customer?.email ?? null,
    status,
    paymentStatus,
    total: totalAmount,
    itemCount: itemsCount,
    shipmentStatus: shipmentStatus ?? null,
    placedAt: createdAt,
  }
}

function toPayment(value: unknown): AdminPayment {
  if (!isRecord(value)) throw bad()
  const { id, provider, amount, paymentMethod, status, createdAt } = value
  if (typeof id !== 'string' || typeof provider !== 'string' || !isMoney(amount) || typeof paymentMethod !== 'string' || !oneOf(PAYMENT_STATUSES, status) || !isTime(createdAt)) throw bad()
  return { id, provider, method: paymentMethod, amount, fee: isMoney(value.fee) ? value.fee : null, net: isMoney(value.netAmount) ? value.netAmount : null, status, at: createdAt }
}

function toEvent(value: unknown): AdminShipmentEvent {
  if (!isRecord(value)) throw bad()
  const { id, eventType, courierStatus, eventTimestamp } = value
  if (typeof id !== 'string' || !isTime(eventTimestamp)) throw bad()
  return { id, label: text(courierStatus) ?? text(eventType) ?? 'Update', reason: text(value.reason), at: eventTimestamp }
}

function toDetail(body: unknown): AdminOrderDetail {
  if (!isRecord(body)) throw bad()
  const order = toOrder(body)
  if (!Array.isArray(body.items) || !Array.isArray(body.paymentTransactions) || !Array.isArray(body.shipmentEvents)) throw bad()
  const stocks = body.items.map((item): number | null => (isRecord(item) && isMoney(item.variantStock) ? item.variantStock : null))
  return {
    ...order,
    customer: toCustomer(body.customer),
    adminNotes: text(body.adminNotes),
    items: order.items.map((item, i) => ({ ...item, stock: stocks[i] })),
    shipment: order.shipment && isRecord(body.shipment) ? { ...order.shipment, externalOrderId: text(body.shipment.externalOrderId) } : null,
    payments: body.paymentTransactions.map(toPayment),
    events: body.shipmentEvents.map(toEvent).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
  }
}

const base = (id: string) => `/admin/orders/${encodeURIComponent(id)}`

/** Feature: Staff orders – List orders */
/** GET /admin/orders, newest first. The dates become Manila day bounds, because the API reads a date-only end as midnight UTC. */
export async function fetchAdminOrders(
  { page = 1, limit = 25, status, paymentStatus, from, to, search }: AdminOrdersParams,
  { signal }: RequestOptions = {},
): Promise<AdminOrdersPage> {
  const query = new URLSearchParams({ page: String(page), limit: String(Math.min(limit, 100)) })
  if (status) query.set('status', status)
  if (paymentStatus) query.set('paymentStatus', paymentStatus)
  if (from) query.set('startDate', `${from}T00:00:00+08:00`)
  if (to) query.set('endDate', `${to}T23:59:59.999+08:00`)
  if (search) query.set('search', search)
  const body = await request('GET', `/admin/orders?${query}`, undefined, signal)
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || !isMoney(meta.total)) throw bad()
  return {
    data: body.data.map(toRow),
    meta: { total: meta.total, page: Number(meta.page) || page, limit: Number(meta.limit) || limit, totalPages: Number(meta.totalPages) || 0, hasNextPage: meta.hasNextPage === true },
  }
}

/** Feature: Staff orders – Metrics */
/** GET /admin/orders/metrics. Counts every order, whatever the list is filtered to. */
export async function fetchAdminOrderMetrics({ signal }: RequestOptions = {}): Promise<AdminOrderMetrics> {
  const body = await request('GET', '/admin/orders/metrics', undefined, signal)
  if (!isRecord(body)) throw bad()
  const { pendingPaymentCount, processingCount, dispatchedCount, deliveredTodayCount, totalRevenue } = body
  if (![pendingPaymentCount, processingCount, dispatchedCount, deliveredTodayCount, totalRevenue].every(isMoney)) throw bad()
  return { pendingPaymentCount, processingCount, dispatchedCount, deliveredTodayCount, totalRevenue } as AdminOrderMetrics
}

/** Feature: Staff orders – View order */
/** GET /admin/orders/:id. */
export async function fetchAdminOrder(id: string, { signal }: RequestOptions = {}): Promise<AdminOrderDetail> {
  return toDetail(await request('GET', base(id), undefined, signal))
}

// Changes made here, so polling can stand aside while one is on its way.
let changesStarted = 0
let changesRunning = 0

async function change<T>(run: () => Promise<T>): Promise<T> {
  changesStarted += 1
  changesRunning += 1
  try {
    return await run()
  } finally {
    changesRunning -= 1
  }
}

/**
 * shortcut: polling; replace with a realtime channel when the backend broadcasts order changes
 * A background read for polling: skipped while a change (cancel, book rider, save notes) is in flight, and its answer dropped
 * (undefined) when one started meanwhile, so it never fights the result the screen already shows.
 */
export async function quietRead<T>(read: () => Promise<T>): Promise<T | undefined> {
  if (changesRunning > 0) return undefined
  const mark = changesStarted
  const answer = await read()
  return changesRunning > 0 || changesStarted !== mark ? undefined : answer
}

/** Feature: Staff orders – Update order */
/** PATCH /admin/orders/:id/status. Moves the order to `status` and/or saves the notes. Cancelling puts the stock back and expires the payment link. */
export async function updateAdminOrder(id: string, changes: { status?: OrderStatus; adminNotes?: string; cancellationReason?: string }): Promise<AdminOrderDetail> {
  return change(async () => toDetail(await request('PATCH', `${base(id)}/status`, changes)))
}

/** Feature: Staff orders – Book rider */
/** POST /admin/orders/:id/dispatch. Books a Lalamove rider; the caller reads the order again for the result. */
export async function dispatchOrder(id: string): Promise<void> {
  await change(() => request('POST', `${base(id)}/dispatch`, undefined))
}

/** Feature: Staff orders – Cancel delivery */
/** POST /admin/orders/:id/cancel-delivery. Cancels the rider and puts the order back to Preparing. */
export async function cancelDelivery(id: string): Promise<void> {
  await change(() => request('POST', `${base(id)}/cancel-delivery`, undefined))
}

const failureOf = (error: unknown) => error as { kind?: string; detail?: string; status?: number } | null

/** Why a change failed, in words a staff member can act on. The server's own sentence is used for a refusal (400, 409); never a provider's. */
export function explainFailure(error: unknown): string {
  const { kind, detail } = failureOf(error) ?? {}
  if ((kind === 'validation' || kind === 'conflict') && detail) return detail
  if (kind === 'network') return 'The connection dropped before we got a response. Check your connection, then try again.'
  if (kind === 'forbidden') return 'Your session ended or your account is not allowed to do this. Sign in again, or ask an admin for access.'
  return 'Something went wrong on our side. Try again in a moment.'
}

/** The toast for a failed Book rider. `retry` is false when trying again cannot help. */
export function dispatchFailure(error: unknown): { message: string; retry: boolean } {
  const { kind, detail } = failureOf(error) ?? {}
  if (kind === 'rate-limit') return { message: 'Too many requests right now, so no rider was booked. Wait a minute, then try again.', retry: true }
  if (kind === 'conflict') return { message: 'This order is already being dispatched.', retry: false }
  if (kind === 'validation') return { message: detail ?? 'The server did not accept this booking.', retry: false }
  if (kind === 'forbidden') return { message: explainFailure(error), retry: false }
  if (kind === 'network') return { message: `No rider was booked. ${explainFailure(error)}`, retry: true }
  return { message: "Lalamove didn't answer, so no rider was booked. Try again in a few minutes.", retry: true }
}

/** The inline error for a failed Cancel delivery. */
export function cancelDeliveryFailure(error: unknown): string {
  if (failureOf(error)?.kind === 'conflict') return 'Lalamove only lets you cancel while it is finding a driver or within 5 minutes of a match. Contact Lalamove support to cancel this delivery.'
  return `The delivery was not cancelled. ${explainFailure(error)}`
}
