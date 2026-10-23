import { buildOrderHistory, type HistoryOrder } from './fetchStaffAnalytics'
import type { PaginatedTransactions, TransactionDetail, TransactionListItem, TransactionListParams } from './fetchTransactions'
import { simulateRequest, type RequestOptions } from './simulateRequest'

/** True while Transactions lists the dashboard's generated orders (the last 12 months) instead of GET /orders. Set to false when the backend has orders. */
export const TRANSACTIONS_SAMPLE_DATA = true

// A UUID-shaped id made from the order number, so the same order always has the same id.
const idOf = (orderNo: string) => `00000000-0000-4000-8000-${orderNo.slice(3).padStart(12, '0')}`

const toListItem = ({ orderId, customerName, placedAt, itemCount, total }: HistoryOrder): TransactionListItem => ({
  id: idOf(orderId),
  orderNo: orderId,
  customerName,
  placedAt,
  itemCount,
  total,
})

const COMPARE = {
  placedAt: (a: HistoryOrder, b: HistoryOrder) => a.placedAt.localeCompare(b.placedAt),
  total: (a: HistoryOrder, b: HistoryOrder) => a.total - b.total,
  customerName: (a: HistoryOrder, b: HistoryOrder) => a.customerName.localeCompare(b.customerName),
}

/** The same query the API takes, answered from the generated order history. Rows that tie fall back to order number, in the sort's direction. */
export async function sampleTransactionList(params: TransactionListParams, { signal, delayMs = 500 }: RequestOptions = {}): Promise<PaginatedTransactions> {
  await simulateRequest(delayMs, signal, () => false)
  const needle = params.search?.trim().toLowerCase()
  const sign = params.sortOrder === 'asc' ? 1 : -1
  const compare = COMPARE[params.sortBy ?? 'placedAt']
  const matched = buildOrderHistory()
    .filter((order) => (!params.from || order.date >= params.from) && (!params.to || order.date <= params.to))
    .filter((order) => !needle || order.orderId.toLowerCase().includes(needle) || order.customerName.toLowerCase().includes(needle))
    .map((order, index) => ({ order, index }))
    .sort((a, b) => sign * (compare(a.order, b.order) || a.index - b.index))
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
  const lines = order.lines.map(({ productId, name, category, units, price }) => ({ productId, name, category, units, unitPrice: price }))
  return { ...toListItem(order), lines, subtotal: lines.reduce((sum, l) => sum + l.units * l.unitPrice, 0) }
}
