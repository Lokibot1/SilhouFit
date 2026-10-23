import { buildOrderHistory, seedOf, type HistoryOrder } from './fetchStaffAnalytics'
import { computeTotals, toCentavos } from '../utils/invoiceTax'
import {
  RETURN_REASONS,
  type PaginatedTransactions,
  type TransactionDetail,
  type TransactionExportRow,
  type TransactionFilterParams,
  type TransactionListItem,
  type TransactionListParams,
  type TransactionSummary,
} from './fetchTransactions'
import { invoiceNoFor } from './sampleInvoices'
import { simulateRequest, type RequestOptions } from './simulateRequest'

/** True while Transactions lists the dashboard's generated orders (the last 12 months) instead of GET /orders. Set to false when the backend has orders. */
export const TRANSACTIONS_SAMPLE_DATA = true

// A UUID-shaped id made from the order number, so the same order always has the same id.
const idOf = (orderNo: string) => `00000000-0000-4000-8000-${orderNo.slice(3).padStart(12, '0')}`

const HOUR = 3_600_000

/**
 * About 7% of orders were returned, fixed by hash so the same orders always are. The return comes 1 to 168 hours after the sale; an order
 * whose return would fall in the future is simply not returned yet, so older orders never change. Returns live only here, not in the
 * dashboard's analytics, so its figures stay as they were.
 */
function returnOf({ placedAt, total }: HistoryOrder): Pick<TransactionListItem, 'returnedAt' | 'returnReason' | 'refundAmount'> {
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
  ...returnOf(order),
})

const COMPARE = {
  placedAt: (a: HistoryOrder, b: HistoryOrder) => a.placedAt.localeCompare(b.placedAt),
  total: (a: HistoryOrder, b: HistoryOrder) => a.total - b.total,
  customerName: (a: HistoryOrder, b: HistoryOrder) => a.customerName.localeCompare(b.customerName),
}

/** The orders the filters match, in the requested sort. Rows that tie fall back to order number, in the sort's direction. */
function matching(params: TransactionFilterParams) {
  const needle = params.search?.trim().toLowerCase()
  const sign = params.sortOrder === 'asc' ? 1 : -1
  const compare = COMPARE[params.sortBy ?? 'placedAt']
  return buildOrderHistory()
    .filter((order) => (!params.from || order.date >= params.from) && (!params.to || order.date <= params.to))
    .filter((order) => !needle || order.orderId.toLowerCase().includes(needle) || order.customerName.toLowerCase().includes(needle))
    .map((order, index) => ({ order, index }))
    .sort((a, b) => sign * (compare(a.order, b.order) || a.index - b.index))
}

/** The same query the API takes, answered from the generated order history. */
export async function sampleTransactionList(params: TransactionListParams, { signal, delayMs = 500 }: RequestOptions = {}): Promise<PaginatedTransactions> {
  await simulateRequest(delayMs, signal, () => false)
  const matched = matching(params)
  const limit = params.limit ?? 25
  const page = params.page ?? 1
  const totalPages = Math.ceil(matched.length / limit)
  return {
    data: matched.slice((page - 1) * limit, page * limit).map(({ order }) => toListItem(order)),
    meta: { total: matched.length, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
  }
}

export async function sampleTransactionDetail(id: string, { signal, delayMs = 400 }: RequestOptions = {}): Promise<TransactionDetail> {
  await simulateRequest(delayMs, signal, () => false)
  const order = buildOrderHistory().find((o) => idOf(o.orderId) === id)
  if (!order) throw Object.assign(new Error('Order not found.'), { kind: 'not-found' })
  const lines = order.lines.map(({ productId, name, category, units, price, vatClass }) => ({ productId, name, category, units, unitPrice: price, ...(vatClass && { vatClass }) }))
  return { ...toListItem(order), paymentMethod: order.paymentMethod, ...(order.buyer && { buyer: order.buyer }), lines, subtotal: lines.reduce((sum, l) => sum + l.units * l.unitPrice, 0) }
}

/** The 12% VAT in an order's total, in centavos. */
const vatOf = (order: HistoryOrder) =>
  computeTotals(order.lines.map((l) => ({ amount: l.units * toCentavos(l.price), vatClass: l.vatClass ?? 'vatable' }))).vatAmount

/** Every order the filters match, unpaged, for the CSV. */
export async function sampleTransactionExport(params: TransactionFilterParams, { signal, delayMs = 600 }: RequestOptions = {}): Promise<TransactionExportRow[]> {
  await simulateRequest(delayMs, signal, () => false)
  return matching(params).map(({ order }) => {
    const item = toListItem(order)
    const invoiceNo = invoiceNoFor(item.id)
    return { ...item, vat: vatOf(order) / 100, ...(invoiceNo && { invoiceNo }) }
  })
}

/** The count of every order the filters match, and the gross and VAT of those not returned. */
export async function sampleTransactionSummary(params: Pick<TransactionFilterParams, 'search' | 'from' | 'to'>, { signal, delayMs = 450 }: RequestOptions = {}): Promise<TransactionSummary> {
  await simulateRequest(delayMs, signal, () => false)
  const orders = matching(params).map(({ order }) => order)
  const kept = orders.filter((o) => !returnOf(o).returnedAt)
  return {
    count: orders.length,
    gross: kept.reduce((sum, o) => sum + toCentavos(o.total), 0) / 100,
    vat: kept.reduce((sum, o) => sum + vatOf(o), 0) / 100,
    returnedCount: orders.length - kept.length,
  }
}
