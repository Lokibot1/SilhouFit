import { ProductListError, request } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'
import { VAT_CLASSES, type VatClass } from '../utils/invoiceTax'

export const PAYMENT_METHODS = ['cash', 'gcash', 'card', 'cod'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** A business buyer, present only when the buyer's TIN was supplied. Orders without one are walk-in sales. */
export interface Buyer {
  name: string
  tin: string
  address: string
}

/** Why a customer sent an order back. */
export const RETURN_REASONS = ['Wrong size', 'Defective item', 'Not as described', 'Changed mind', 'Damaged on delivery'] as const
export type ReturnReason = (typeof RETURN_REASONS)[number]

export interface TransactionListItem {
  id: string
  /** The number staff and customers read out, e.g. "SF-10187". */
  orderNo: string
  customerName: string
  /** ISO time. */
  placedAt: string
  itemCount: number
  total: number
  /** Set only on a returned order: the customer sent the product back and was refunded in full. The three fields come together, and `refundAmount` equals `total`. */
  returnedAt?: string
  returnReason?: ReturnReason
  refundAmount?: number
}

export interface TransactionLine {
  productId: string
  name: string
  category: string
  units: number
  unitPrice: number
  /** How the line is taxed; a missing value is 'vatable'. */
  vatClass?: VatClass
}

export interface TransactionDetail extends TransactionListItem {
  lines: TransactionLine[]
  subtotal: number
  paymentMethod?: PaymentMethod
  buyer?: Buyer
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
  const { returnedAt, returnReason, refundAmount } = value
  if (returnedAt === undefined && returnReason === undefined && refundAmount === undefined) return { id, orderNo, customerName, placedAt, itemCount, total }
  // All or nothing, and only a full refund after the sale: a partial return is not part of this contract.
  if (typeof returnedAt !== 'string' || !(Date.parse(returnedAt) >= Date.parse(placedAt)) || !RETURN_REASONS.some((r) => r === returnReason) || refundAmount !== total)
    throw new ProductListError('server')
  return { id, orderNo, customerName, placedAt, itemCount, total, returnedAt, returnReason: returnReason as ReturnReason, refundAmount }
}

/**
 * GET /orders. Staff only; the API caps `limit` at 100. The backend has no Order model yet, so this is the contract Transactions expects:
 *   ?search=&from=&to=&sortBy=placedAt|total|customerName&sortOrder=asc|desc&page=&limit=
 *   { data: [{ id, orderNo, customerName, placedAt, itemCount, total, returnedAt?, returnReason?, refundAmount? }], meta: { total, page, limit, totalPages, hasNextPage, hasPreviousPage } }
 * A returned order carries all of `returnedAt` (ISO, not before `placedAt`), `returnReason` (one of RETURN_REASONS) and `refundAmount` (equal to `total`: returns are refunded in full); an active order carries none.
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
 *   { lines: [{ productId, name, category, units, unitPrice, vatClass? }], subtotal, paymentMethod?, buyer?: { name, tin, address } }
 * `vatClass` is 'vatable' | 'exempt' | 'zero'; `paymentMethod` is 'cash' | 'gcash' | 'card' | 'cod'.
 * A missing order is a 404, which reads as 'not-found'.
 */
export async function fetchTransactionDetail(id: string, { signal }: RequestOptions = {}): Promise<TransactionDetail> {
  const body = await request('GET', `/orders/${encodeURIComponent(id)}`, undefined, signal)
  if (!isRecord(body) || !Array.isArray(body.lines) || !isCount(body.subtotal)) throw new ProductListError('server')
  const { paymentMethod, buyer } = body
  if (paymentMethod !== undefined && !PAYMENT_METHODS.some((m) => m === paymentMethod)) throw new ProductListError('server')
  if (buyer !== undefined && (!isRecord(buyer) || typeof buyer.name !== 'string' || typeof buyer.tin !== 'string' || typeof buyer.address !== 'string'))
    throw new ProductListError('server')
  return {
    ...toListItem(body),
    subtotal: body.subtotal,
    ...(paymentMethod !== undefined && { paymentMethod: paymentMethod as PaymentMethod }),
    ...(buyer !== undefined && { buyer: buyer as unknown as Buyer }),
    lines: body.lines.map((value): TransactionLine => {
      if (!isRecord(value)) throw new ProductListError('server')
      const { productId, name, category, units, unitPrice, vatClass } = value
      if (typeof productId !== 'string' || typeof name !== 'string' || typeof category !== 'string') throw new ProductListError('server')
      if (!isCount(units) || !isCount(unitPrice)) throw new ProductListError('server')
      if (vatClass !== undefined && !VAT_CLASSES.some((c) => c === vatClass)) throw new ProductListError('server')
      return { productId, name, category, units, unitPrice, ...(vatClass !== undefined && { vatClass: vatClass as VatClass }) }
    }),
  }
}

/** One row of the CSV export. `vat` is the 12% portion of `total`; `invoiceNo` is set once the order's invoice was first downloaded or printed (previewing issues none), otherwise it is left out and the CSV cell is empty. */
export interface TransactionExportRow extends TransactionListItem {
  vat: number
  invoiceNo?: string
}

/** The same filters as the list, without paging. */
export type TransactionFilterParams = Omit<TransactionListParams, 'page' | 'limit'>

export interface TransactionSummary {
  count: number
  /** Sum of the totals of the orders that were not returned, VAT included. */
  gross: number
  /** The 12% VAT portion of `gross`, summed per order. */
  vat: number
  /** How many of the `count` orders were returned. They are in `count` but not in `gross` or `vat`. */
  returnedCount: number
}

/**
 * GET /orders/export. Staff only; every order the filters match (the API caps it at 10,000), in the list's sort order:
 *   ?search=&from=&to=&sortBy=&sortOrder=
 *   { data: [{ id, orderNo, customerName, placedAt, itemCount, total, vat, invoiceNo?, returnedAt?, returnReason?, refundAmount? }] }
 */
export async function fetchTransactionExport(params: TransactionFilterParams, { signal }: RequestOptions = {}): Promise<TransactionExportRow[]> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value))
  const body = await request('GET', `/orders/export?${query}`, undefined, signal)
  if (!isRecord(body) || !Array.isArray(body.data)) throw new ProductListError('server')
  return body.data.map((value): TransactionExportRow => {
    if (!isRecord(value) || !isCount(value.vat) || (value.invoiceNo !== undefined && typeof value.invoiceNo !== 'string')) throw new ProductListError('server')
    return { ...toListItem(value), vat: value.vat, ...(value.invoiceNo !== undefined && { invoiceNo: value.invoiceNo }) }
  })
}

/**
 * GET /orders/summary. The totals of every order the filters match, whatever the page. `count` is all of them; `gross` and `vat` are net of
 * returned orders (which are refunded in full), and `returnedCount` says how many of the `count` those were:
 *   ?search=&from=&to=   ->   { count, gross, vat, returnedCount }
 */
export async function fetchTransactionSummary(params: Pick<TransactionFilterParams, 'search' | 'from' | 'to'>, { signal }: RequestOptions = {}): Promise<TransactionSummary> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value))
  const body = await request('GET', `/orders/summary?${query}`, undefined, signal)
  if (!isRecord(body) || !isCount(body.count) || !isCount(body.gross) || !isCount(body.vat) || !isCount(body.returnedCount)) throw new ProductListError('server')
  if (!Number.isInteger(body.returnedCount) || body.returnedCount < 0 || body.returnedCount > body.count) throw new ProductListError('server')
  return { count: body.count, gross: body.gross, vat: body.vat, returnedCount: body.returnedCount }
}
