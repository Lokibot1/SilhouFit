import { isTime, REMOVED, toCustomer, type AdminOrderDetail } from './adminOrdersApi'
import type { TransactionDetail, TransactionLine } from './fetchTransactions'
import { ProductListError, request } from './fetchProductList'
import { isMoney, isRecord, ORDER_STATUSES, oneOf, PAYMENT_STATUSES, type OrderStatus, type PaymentStatus } from './ordersApi'
import type { RequestOptions } from './simulateRequest'

// Staff payment records: the API's /admin/transactions endpoints (staff role or above). The API rejects query keys it does not know,
// so only the keys below are ever sent. No cache and no polling: every read goes to the server.

export interface AdminTransactionRow {
  /** The payment's own ID (not the order's). */
  id: string
  orderId: string
  orderNumber: string
  orderStatus: OrderStatus
  /** The customer's name, or "Customer account removed" once the account is gone. */
  customerName: string
  customerEmail: string | null
  /** The gateway, e.g. paymongo. */
  provider: string
  /** The gateway's own payment ID. */
  reference: string
  /** The API's PaymentMethod, e.g. GCASH. */
  method: string
  status: PaymentStatus
  amount: number
  /** What the gateway kept; null until it reports one. */
  fee: number | null
  net: number | null
  /** ISO time. */
  at: string
}

export interface AdminTransactionDetail extends AdminTransactionRow {
  orderTotal: number
  /** ISO time. */
  updatedAt: string
  /** The gateway's record, as received. Show it through `redactPayload`. */
  payload: Record<string, unknown>
}

export interface AdminTransactionsPage {
  data: AdminTransactionRow[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface AdminTransactionsParams {
  page?: number
  /** The API allows 100 at most. */
  limit?: number
  status?: PaymentStatus
  /** The API's PaymentMethod, e.g. GCASH. */
  method?: string
  /** Any case. */
  provider?: string
  /** One order's payments. */
  orderId?: string
  /** Inclusive dates, YYYY-MM-DD in Asia/Manila. */
  from?: string
  to?: string
  /** The gateway reference, order number, customer email or name. */
  search?: string
  sortBy?: 'createdAt' | 'amount'
  sortOrder?: 'asc' | 'desc'
}

/** Counts and volumes across every payment, whatever the list is filtered to. The three volumes count paid payments only. */
export interface AdminTransactionMetrics {
  totalTransactions: number
  paidCount: number
  refundedCount: number
  failedCount: number
  pendingCount: number
  totalGrossVolume: number
  totalFeeVolume: number
  totalNetVolume: number
}

const bad = () => new ProductListError('server')

function toRow(value: unknown): AdminTransactionRow {
  if (!isRecord(value)) throw bad()
  const { id, orderId, provider, externalPaymentId, amount, paymentMethod, status, createdAt, order } = value
  if (typeof id !== 'string' || typeof orderId !== 'string' || typeof provider !== 'string' || typeof externalPaymentId !== 'string' || typeof paymentMethod !== 'string') throw bad()
  if (!isMoney(amount) || !oneOf(PAYMENT_STATUSES, status) || !isTime(createdAt)) throw bad()
  if (!isRecord(order) || typeof order.orderNumber !== 'string' || !oneOf(ORDER_STATUSES, order.status)) throw bad()
  const customer = toCustomer(value.customer)
  return {
    id,
    orderId,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    customerName: customer?.name ?? REMOVED,
    customerEmail: customer?.email ?? null,
    provider,
    reference: externalPaymentId,
    method: paymentMethod,
    status,
    amount,
    fee: isMoney(value.fee) ? value.fee : null,
    net: isMoney(value.netAmount) ? value.netAmount : null,
    at: createdAt,
  }
}

function toDetail(body: unknown): AdminTransactionDetail {
  const row = toRow(body)
  const { updatedAt, rawPayload, order } = body as Record<string, unknown>
  const { totalAmount } = order as Record<string, unknown>
  if (!isTime(updatedAt) || !isMoney(totalAmount)) throw bad()
  return { ...row, orderTotal: totalAmount, updatedAt, payload: isRecord(rawPayload) ? rawPayload : {} }
}

const SECRET_KEY = /secret|token|key|signature|password|authorization/i

/** A copy of the gateway's record with the value of every secret-looking key (at any depth) replaced, so a key never reaches the screen. */
export function redactPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPayload)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, SECRET_KEY.test(key) ? '[hidden]' : redactPayload(inner)]))
}

/** Feature: Staff transactions – List transactions */
/** GET /admin/transactions. The dates become Manila day bounds, because the API reads a date-only end as midnight UTC. */
export async function fetchAdminTransactions(
  { page = 1, limit = 25, status, method, provider, orderId, from, to, search, sortBy, sortOrder }: AdminTransactionsParams,
  { signal }: RequestOptions = {},
): Promise<AdminTransactionsPage> {
  const query = new URLSearchParams({ page: String(page), limit: String(Math.min(limit, 100)) })
  if (status) query.set('status', status)
  if (method) query.set('paymentMethod', method)
  if (provider) query.set('provider', provider)
  if (orderId) query.set('orderId', orderId)
  if (from) query.set('startDate', `${from}T00:00:00+08:00`)
  if (to) query.set('endDate', `${to}T23:59:59.999+08:00`)
  if (search) query.set('search', search)
  if (sortBy) query.set('sortBy', sortBy)
  if (sortOrder) query.set('sortOrder', sortOrder)
  const body = await request('GET', `/admin/transactions?${query}`, undefined, signal)
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || !isMoney(meta.total)) throw bad()
  return {
    data: body.data.map(toRow),
    meta: { total: meta.total, page: Number(meta.page) || page, limit: Number(meta.limit) || limit, totalPages: Number(meta.totalPages) || 0 },
  }
}

/** Feature: Staff transactions – View transaction */
/** GET /admin/transactions/:id. A missing payment is a 404, which reads as 'not-found'. */
export async function fetchAdminTransaction(id: string, { signal }: RequestOptions = {}): Promise<AdminTransactionDetail> {
  return toDetail(await request('GET', `/admin/transactions/${encodeURIComponent(id)}`, undefined, signal))
}

const INVOICE_METHOD: Record<string, string> = { GCASH: 'GCash', PAYMAYA: 'Maya', CARD: 'Card', GRAB_PAY: 'GrabPay', BILLEASE: 'BillEase', OTHER: 'Online payment' }

/**
 * The order as an invoice reads it, so the sheet, PDF and JSON need nothing new. The order's items carry no category, so each reads 'Apparel';
 * the delivery fee and the discount are lines of their own, which makes the lines add up to the order's total.
 */
export function orderToTransactionDetail(order: AdminOrderDetail, method: string): TransactionDetail {
  const lines: TransactionLine[] = order.items.map((item) => ({
    productId: item.id,
    name: item.name,
    category: 'Apparel',
    units: item.qty,
    unitPrice: item.unitPrice,
    ...(item.imageUrl && { imageUrl: item.imageUrl }),
  }))
  if (order.shipping > 0) lines.push({ productId: 'delivery-fee', name: 'Delivery fee', category: 'Delivery', units: 1, unitPrice: order.shipping })
  if (order.discount > 0) lines.push({ productId: 'discount', name: 'Discount', category: 'Discount', units: 1, unitPrice: -order.discount })
  const { customer, address } = order
  return {
    id: order.id,
    orderNo: order.orderNumber,
    customerName: customer?.name ?? REMOVED,
    placedAt: order.createdAt,
    itemCount: order.items.reduce((sum, item) => sum + item.qty, 0),
    total: order.total,
    subtotal: order.subtotal,
    paymentLabel: INVOICE_METHOD[method] ?? 'Online payment',
    lines,
    ...(customer && { customer: { email: customer.email, phone: address.phone, address: `${address.line}, ${address.city} ${address.postalCode}` } }),
  }
}

/** Feature: Staff transactions – Metrics */
/** GET /admin/transactions/metrics. Ignores every filter. */
export async function fetchAdminTransactionMetrics({ signal }: RequestOptions = {}): Promise<AdminTransactionMetrics> {
  const body = await request('GET', '/admin/transactions/metrics', undefined, signal)
  if (!isRecord(body)) throw bad()
  const { totalTransactions, paidCount, refundedCount, failedCount, pendingCount, totalGrossVolume, totalFeeVolume, totalNetVolume } = body
  if (![totalTransactions, paidCount, refundedCount, failedCount, pendingCount, totalGrossVolume, totalFeeVolume, totalNetVolume].every(isMoney)) throw bad()
  return { totalTransactions, paidCount, refundedCount, failedCount, pendingCount, totalGrossVolume, totalFeeVolume, totalNetVolume } as AdminTransactionMetrics
}
