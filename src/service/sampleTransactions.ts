import { buildOrderHistory, getSampleProducts, loadSampleProducts, seedOf, type HistoryOrder } from './fetchStaffAnalytics'
import { ADDRESSES } from '../data/mockAccounts'
import { computeTotals, toCentavos } from '../utils/invoiceTax'
import { getAccounts } from './accountStore'
import type { AdminTransactionDetail, AdminTransactionMetrics, AdminTransactionRow, AdminTransactionsPage, AdminTransactionsParams } from './adminTransactionsApi'
import { RETURN_REASONS, type CustomerContact, type TransactionDetail, type TransactionListItem, type TransactionSummary } from './fetchTransactions'
import type { PaymentStatus } from './ordersApi'
import { simulateRequest, type RequestOptions } from './simulateRequest'

// A UUID-shaped id made from the order number, so the same order always has the same id.
const idOf = (orderNo: string) => `00000000-0000-4000-8000-${orderNo.slice(3).padStart(12, '0')}`
/** The id of the order's one payment: the same shape, so it never equals an order id. */
const paymentIdOf = (orderNo: string) => idOf(orderNo).replace('-8000-', '-9000-')

const HOUR = 3_600_000

/**
 * About 7% of orders were returned, fixed by hash so the same orders always are. The return comes 1 to 168 hours after the sale; an order
 * whose return would fall in the future is simply not returned yet, so older orders never change. Returns live only here, not in the
 * dashboard's analytics, so its figures stay as they were.
 */
export function returnOf({ placedAt, total }: HistoryOrder): Pick<TransactionListItem, 'returnedAt' | 'returnReason' | 'refundAmount'> {
  if (seedOf(`${placedAt}:return`) % 100 >= 7) return {}
  const returnedAt = Date.parse(placedAt) + (1 + (seedOf(`${placedAt}:return-after`) % 168)) * HOUR
  if (returnedAt > Date.now()) return {}
  return { returnedAt: new Date(returnedAt).toISOString(), returnReason: RETURN_REASONS[seedOf(`${placedAt}:return-why`) % RETURN_REASONS.length], refundAmount: total }
}

const toListItem = (order: HistoryOrder): TransactionListItem => ({
  id: idOf(order.orderId),
  orderNo: order.orderId,
  customerName: order.customerName,
  placedAt: order.placedAt,
  itemCount: order.itemCount,
  total: order.total,
  paymentMethod: order.paymentMethod,
  ...returnOf(order),
})

const METHOD = { gcash: 'GCASH', maya: 'PAYMAYA', cod: 'OTHER' } as const
const PROVIDER = 'paymongo'
const referenceOf = (order: HistoryOrder) => `pay_${order.orderId}`
const statusOf = (order: HistoryOrder): PaymentStatus => (returnOf(order).returnedAt ? 'REFUNDED' : 'PAID')

/** The orders the filters match, in the requested sort. Rows that tie fall back to order number, in the sort's direction. */
function matching(params: AdminTransactionsParams) {
  const needle = params.search?.trim().toLowerCase()
  const sign = params.sortOrder === 'asc' ? 1 : -1
  const compare = params.sortBy === 'amount' ? (a: HistoryOrder, b: HistoryOrder) => a.total - b.total : (a: HistoryOrder, b: HistoryOrder) => a.placedAt.localeCompare(b.placedAt)
  return buildOrderHistory()
    .filter((order) => (!params.from || order.date >= params.from) && (!params.to || order.date <= params.to))
    .filter((order) => !params.status || statusOf(order) === params.status)
    .filter((order) => !params.method || METHOD[order.paymentMethod] === params.method)
    .filter(() => !params.provider || params.provider.toLowerCase() === PROVIDER)
    .filter((order) => !params.orderId || idOf(order.orderId) === params.orderId)
    .filter((order) => !needle || [order.orderId, order.customerName, referenceOf(order)].some((value) => value.toLowerCase().includes(needle)))
    .map((order, index) => ({ order, index }))
    .sort((a, b) => sign * (compare(a.order, b.order) || a.index - b.index))
}

/** The saved account with this name, else a contact made from the name (the same each time), so every order has someone to reach. */
function contactOf(name: string): CustomerContact {
  const saved = getAccounts().customers.find((c) => `${c.firstName} ${c.lastName}` === name)
  if (saved) return { email: saved.email, phone: saved.phone, ...(saved.address && { address: saved.address }) }
  const seed = seedOf(name)
  return {
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
    phone: `+63917${String(1000000 + (seed % 9000000))}`,
    address: ADDRESSES[seed % ADDRESSES.length],
  }
}

const toRow = (order: HistoryOrder): AdminTransactionRow => {
  const status = statusOf(order)
  return {
    id: paymentIdOf(order.orderId),
    orderId: idOf(order.orderId),
    orderNumber: order.orderId,
    orderStatus: status === 'REFUNDED' ? 'REFUNDED' : 'PAID',
    customerName: order.customerName,
    customerEmail: contactOf(order.customerName).email,
    provider: PROVIDER,
    reference: referenceOf(order),
    method: METHOD[order.paymentMethod],
    status,
    amount: order.total,
    fee: null,
    net: null,
    at: order.placedAt,
  }
}

/** The same query the API takes, answered from the generated order history: one payment per order, paid or (once returned) refunded. */
export async function sampleAdminTransactions(params: AdminTransactionsParams, { signal, delayMs = 500 }: RequestOptions = {}): Promise<AdminTransactionsPage> {
  await simulateRequest(delayMs, signal, () => false)
  await loadSampleProducts()
  const matched = matching(params)
  const limit = Math.min(params.limit ?? 25, 100)
  const page = params.page ?? 1
  return {
    data: matched.slice((page - 1) * limit, page * limit).map(({ order }) => toRow(order)),
    meta: { total: matched.length, page, limit, totalPages: Math.ceil(matched.length / limit) },
  }
}

export async function sampleAdminTransaction(id: string, { signal, delayMs = 400 }: RequestOptions = {}): Promise<AdminTransactionDetail> {
  await simulateRequest(delayMs, signal, () => false)
  await loadSampleProducts()
  const order = buildOrderHistory().find((o) => paymentIdOf(o.orderId) === id)
  if (!order) throw Object.assign(new Error('Transaction not found.'), { kind: 'not-found' })
  return { ...toRow(order), orderTotal: order.total, updatedAt: order.placedAt, payload: { sample: true } }
}

/** The counts of every payment, and the gross of the paid ones (the sample has no gateway fees). */
export async function sampleAdminTransactionMetrics({ signal, delayMs = 450 }: RequestOptions = {}): Promise<AdminTransactionMetrics> {
  await simulateRequest(delayMs, signal, () => false)
  await loadSampleProducts()
  const orders = buildOrderHistory()
  const paid = orders.filter((o) => statusOf(o) === 'PAID')
  const gross = paid.reduce((sum, o) => sum + toCentavos(o.total), 0) / 100
  return {
    totalTransactions: orders.length,
    paidCount: paid.length,
    refundedCount: orders.length - paid.length,
    failedCount: 0,
    pendingCount: 0,
    totalGrossVolume: gross,
    totalFeeVolume: 0,
    totalNetVolume: gross,
  }
}

export async function sampleTransactionDetail(id: string, { signal, delayMs = 400 }: RequestOptions = {}): Promise<TransactionDetail> {
  await simulateRequest(delayMs, signal, () => false)
  await loadSampleProducts()
  const order = buildOrderHistory().find((o) => idOf(o.orderId) === id)
  if (!order) throw Object.assign(new Error('Order not found.'), { kind: 'not-found' })
  const images = new Map(getSampleProducts().map((p) => [p.id, p.imageUrl]))
  const lines = order.lines.map(({ productId, name, category, units, price, vatClass }) => {
    const imageUrl = images.get(productId)
    return { productId, name, category, units, unitPrice: price, ...(vatClass && { vatClass }), ...(imageUrl && { imageUrl }) }
  })
  return { ...toListItem(order), customer: contactOf(order.customerName), paymentMethod: order.paymentMethod, ...(order.buyer && { buyer: order.buyer }), lines, subtotal: lines.reduce((sum, l) => sum + l.units * l.unitPrice, 0) }
}

/** The 12% VAT in an order's total, in centavos. */
const vatOf = (order: HistoryOrder) =>
  computeTotals(order.lines.map((l) => ({ amount: l.units * toCentavos(l.price), vatClass: l.vatClass ?? 'vatable' }))).vatAmount

/** The count of every order the dates match, and the gross and VAT of those not returned. */
export async function sampleTransactionSummary(params: Pick<AdminTransactionsParams, 'from' | 'to'>, { signal, delayMs = 450 }: RequestOptions = {}): Promise<TransactionSummary> {
  await simulateRequest(delayMs, signal, () => false)
  await loadSampleProducts()
  const orders = matching(params).map(({ order }) => order)
  const kept = orders.filter((o) => !returnOf(o).returnedAt)
  return {
    count: orders.length,
    gross: kept.reduce((sum, o) => sum + toCentavos(o.total), 0) / 100,
    vat: kept.reduce((sum, o) => sum + vatOf(o), 0) / 100,
    returnedCount: orders.length - kept.length,
  }
}
