import { ProductListError, request } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'

export interface TransactionListItem {
  id: string
  /** The number staff and customers read out, e.g. "SF-10187". */
  orderNo: string
  customerName: string
  /** ISO time. */
  placedAt: string
  itemCount: number
  total: number
}

export interface TransactionLine {
  productId: string
  name: string
  category: string
  units: number
  unitPrice: number
}

export interface TransactionDetail extends TransactionListItem {
  lines: TransactionLine[]
  subtotal: number
}

export interface PaginatedTransactions {
  data: TransactionListItem[]
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean }
}

export interface TransactionListParams {
  /** Order number or customer name. */
  search?: string
  /** Inclusive dates, YYYY-MM-DD in Asia/Manila. */
  from?: string
  to?: string
  sortBy?: 'placedAt' | 'total' | 'customerName'
  sortOrder?: 'asc' | 'desc'
  page?: number
  limit?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function toListItem(value: unknown): TransactionListItem {
  if (!isRecord(value)) throw new ProductListError('server')
  const { id, orderNo, customerName, placedAt, itemCount, total } = value
  if (typeof id !== 'string' || typeof orderNo !== 'string' || typeof customerName !== 'string') throw new ProductListError('server')
  if (typeof placedAt !== 'string' || Number.isNaN(Date.parse(placedAt)) || !isCount(itemCount) || !isCount(total)) throw new ProductListError('server')
  return { id, orderNo, customerName, placedAt, itemCount, total }
}

/**
 * GET /orders. Staff only; the API caps `limit` at 100. The backend has no Order model yet, so this is the contract Transactions expects:
 *   ?search=&from=&to=&sortBy=placedAt|total|customerName&sortOrder=asc|desc&page=&limit=
 *   { data: [{ id, orderNo, customerName, placedAt, itemCount, total }], meta: { total, page, limit, totalPages, hasNextPage, hasPreviousPage } }
 * `search` matches the order number and the customer name; `from` and `to` are inclusive Manila dates.
 */
export async function fetchTransactionList(params: TransactionListParams, { signal }: RequestOptions = {}): Promise<PaginatedTransactions> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value))
  const body = await request('GET', `/orders?${query}`, undefined, signal)
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || !isCount(meta.total)) throw new ProductListError('server')
  return {
    data: body.data.map(toListItem),
    meta: {
      total: meta.total,
      page: Number(meta.page) || 1,
      limit: Number(meta.limit) || 0,
      totalPages: Number(meta.totalPages) || 0,
      hasNextPage: meta.hasNextPage === true,
      hasPreviousPage: meta.hasPreviousPage === true,
    },
  }
}

/**
 * GET /orders/:id. The list item's fields plus
 *   { lines: [{ productId, name, category, units, unitPrice }], subtotal }
 * A missing order is a 404, which reads as 'not-found'.
 */
export async function fetchTransactionDetail(id: string, { signal }: RequestOptions = {}): Promise<TransactionDetail> {
  const body = await request('GET', `/orders/${encodeURIComponent(id)}`, undefined, signal)
  if (!isRecord(body) || !Array.isArray(body.lines) || !isCount(body.subtotal)) throw new ProductListError('server')
  return {
    ...toListItem(body),
    subtotal: body.subtotal,
    lines: body.lines.map((value): TransactionLine => {
      if (!isRecord(value)) throw new ProductListError('server')
      const { productId, name, category, units, unitPrice } = value
      if (typeof productId !== 'string' || typeof name !== 'string' || typeof category !== 'string') throw new ProductListError('server')
      if (!isCount(units) || !isCount(unitPrice)) throw new ProductListError('server')
      return { productId, name, category, units, unitPrice }
    }),
  }
}
