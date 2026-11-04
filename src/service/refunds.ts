// The Returns & Refunds page's requests, kept in this tab's memory until the orders backend can take them.
// Requests are made from the generated order history, so an approved one is an order Transactions shows as "Returned".
import { MOCK_ADMINS, MOCK_STAFF } from '../data/mockAccounts'
import { formatPeso } from '../utils/format'
import { addDays, manilaToday } from '../utils/period'
import { REFUND_LIMITS } from '../utils/refundValidation'
import { buildOrderHistory, failParam, seedOf, type HistoryOrder } from './fetchStaffAnalytics'
import type { ReturnReason } from './fetchTransactions'
import { simulateRequest, type RequestOptions } from './simulateRequest'
import { returnOf } from './sampleTransactions'

/** Dev-only: /admin/refunds?fail=refund-summary (or refund-list, refund-decide) fails that request. */
const wait = (section: string, delayMs: number, signal?: AbortSignal) =>
  simulateRequest(delayMs, signal, () => failParam() === section).catch((error: Error) => {
    throw error.name === 'AbortError' ? error : Object.assign(error, { kind: 'network' })
  })

export type RefundStatus = 'pending' | 'approved' | 'rejected'
export type RefundReason = 'wrong-size' | 'defective' | 'not-as-described' | 'changed-mind' | 'other'
export type RefundSort = 'requestNo' | 'orderNo' | 'customerName' | 'requestedBy' | 'reason' | 'amount' | 'requestedAt' | 'status' | 'decidedAt'
export type RefundDir = 'asc' | 'desc'

export const REFUND_REASONS: RefundReason[] = ['wrong-size', 'defective', 'not-as-described', 'changed-mind', 'other']
export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  'wrong-size': 'Wrong size',
  defective: 'Defective item',
  'not-as-described': 'Not as described',
  'changed-mind': 'Changed mind',
  other: 'Other',
}

/** An item of the order, kept on the request so the sheet needs no order request. */
export interface RefundItem {
  name: string
  category: string
  units: number
  unitPrice: number
}

export interface RefundRequest {
  id: string
  /** "RR-0001", numbered from the oldest request. */
  requestNo: string
  orderNo: string
  /** ISO time. */
  orderPlacedAt: string
  orderTotal: number
  customerName: string
  /** "Customer", or the name of the staff member who took the request. */
  requestedBy: string
  reason: RefundReason
  reasonText: string
  /** Pesos asked for: the order total, or less for a partial refund. */
  amount: number
  items: RefundItem[]
  requestedAt: string
  status: RefundStatus
  decidedBy: string | null
  decidedAt: string | null
  /** Pesos given back; null until approved. */
  approvedAmount: number | null
  /** The approver's note, or the reason it was rejected. */
  decisionNote: string | null
}

export interface RefundSummary {
  pending: number
  approved: number
  rejected: number
  /** Pesos given back so far, across every approved request. */
  refundedTotal: number
}

export interface RefundPage {
  data: RefundRequest[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface RefundQuery {
  search?: string
  status?: RefundStatus
  sort?: RefundSort
  dir?: RefundDir
  page?: number
  limit?: number
}

export type RefundDecision = { kind: 'approve'; amount: number; note?: string } | { kind: 'reject'; reason: string }

export const REFUND_PER_PAGE = 10
export const REFUND_PER_PAGE_OPTIONS = [10, 25, 50]
export const MAX_REFUND_SEARCH = 60

const HOUR = 3_600_000
const pad = (n: number) => String(n).padStart(4, '0')

const REASON_OF: Record<ReturnReason, RefundReason> = {
  'Wrong size': 'wrong-size',
  'Defective item': 'defective',
  'Not as described': 'not-as-described',
  'Changed mind': 'changed-mind',
  'Damaged on delivery': 'defective',
}
const REASON_TEXTS: Record<RefundReason, string[]> = {
  'wrong-size': ['The size runs smaller than the chart says, so it does not fit.', 'Ordered my usual size but it is too loose on me.'],
  defective: ['The stitching came apart at the seam after the first wear.', 'There is a small tear near the hem that was not there in the photos.'],
  'not-as-described': ['The colour is darker than it looked on the product page.', 'The fabric feels thinner than the description says.'],
  'changed-mind': ['I decided I do not need this anymore and it is unworn.', 'It does not go with the rest of my outfit.'],
  other: ['I received two of the same item by mistake.', 'The gift was for someone who already bought one.'],
}
const REJECT_NOTES = [
  'The item shows signs of wear and washing, which is outside the return policy.',
  'The request came after the return window closed.',
  'The tags were removed, so the item cannot be resold.',
  'The photos sent do not show the defect described.',
]

function seedRefunds(): RefundRequest[] {
  const now = Date.now()
  const today = manilaToday().date
  const orders = buildOrderHistory()
  const admins = MOCK_ADMINS.map((a) => `${a.firstName} ${a.lastName}`)
  const staff = MOCK_STAFF.filter((s) => s.status === 'active')
    .slice(0, 4)
    .map((s) => `${s.firstName} ${s.lastName}`)
  const pick = <T>(list: T[], key: string) => list[seedOf(key) % list.length]
  // Hash order, so the picks spread over the days instead of being the newest.
  const byHash = (list: HistoryOrder[], key: string) => [...list].sort((a, b) => seedOf(`${a.orderId}:${key}`) - seedOf(`${b.orderId}:${key}`))
  const requestedBy = (orderNo: string) => {
    const n = seedOf(`${orderNo}:by`) % (staff.length + 2)
    return n < 2 ? 'Customer' : staff[n - 2]
  }
  const make = (order: HistoryOrder, reason: RefundReason, requestedAt: number): Omit<RefundRequest, 'id' | 'requestNo' | 'status' | 'decidedBy' | 'decidedAt' | 'approvedAmount' | 'decisionNote'> => ({
    orderNo: order.orderId,
    orderPlacedAt: order.placedAt,
    orderTotal: order.total,
    customerName: order.customerName,
    requestedBy: requestedBy(order.orderId),
    reason,
    reasonText: pick(REASON_TEXTS[reason], `${order.orderId}:text`),
    amount: order.total,
    items: order.lines.map(({ name, category, units, price }) => ({ name, category, units, unitPrice: price })),
    requestedAt: new Date(requestedAt).toISOString(),
  })
  // 1 to 4 hours after the order, so a request is never in the future and its time is the same on every load (the orders it comes from are at least 4 hours old).
  const requestedAfter = (order: HistoryOrder) => Date.parse(order.placedAt) + (1 + (seedOf(`${order.orderId}:after`) % 4)) * HOUR
  const decided = { decidedBy: null, decidedAt: null, approvedAmount: null, decisionNote: null }

  const approved = orders
    .filter((o) => returnOf(o).returnedAt)
    .slice(-10)
    .map((o): Omit<RefundRequest, 'id' | 'requestNo'> => {
      const { returnedAt, returnReason } = returnOf(o)
      const placed = Date.parse(o.placedAt)
      const requestedAt = placed + Math.round((Date.parse(returnedAt!) - placed) / 2)
      return { ...make(o, REASON_OF[returnReason!], requestedAt), status: 'approved', decidedBy: pick(admins, `${o.orderId}:admin`), decidedAt: returnedAt!, approvedAmount: o.total, decisionNote: null }
    })

  const fresh = orders.filter((o) => !returnOf(o).returnedAt && Date.parse(o.placedAt) + 4 * HOUR <= now)
  const pendingOrders = byHash(fresh.filter((o) => o.date >= addDays(today, -14)), 'pending').slice(0, 12)
  const pending = pendingOrders.map((o, n): Omit<RefundRequest, 'id' | 'requestNo'> => ({
    ...make(o, pick(REFUND_REASONS, `${o.orderId}:reason`), requestedAfter(o)),
    // One request asks for half the order, so a partial refund can be seen.
    ...(n === 3 && { amount: Math.max(1, Math.floor(o.total / 2)) }),
    status: 'pending',
    ...decided,
  }))

  const taken = new Set(pendingOrders)
  // Decided up to 47 hours after they were asked, so these orders are old enough for that to be in the past.
  const rejected = byHash(fresh.filter((o) => o.date >= addDays(today, -60) && Date.parse(o.placedAt) + 52 * HOUR <= now && !taken.has(o)), 'rejected')
    .slice(0, 8)
    .map((o): Omit<RefundRequest, 'id' | 'requestNo'> => {
      const requestedAt = requestedAfter(o)
      const decidedAt = requestedAt + (2 + (seedOf(`${o.orderId}:decided`) % 46)) * HOUR
      return {
        ...make(o, pick(REFUND_REASONS, `${o.orderId}:reason`), requestedAt),
        status: 'rejected',
        decidedBy: pick(admins, `${o.orderId}:admin`),
        decidedAt: new Date(decidedAt).toISOString(),
        approvedAmount: null,
        decisionNote: pick(REJECT_NOTES, `${o.orderId}:note`),
      }
    })

  return [...approved, ...pending, ...rejected]
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.orderNo.localeCompare(b.orderNo))
    .map((request, n) => ({ ...request, id: `refund-${pad(n + 1)}`, requestNo: `RR-${pad(n + 1)}` }))
}

let store: RefundRequest[] | null = null
const ensure = () => (store ??= seedRefunds())
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export const getRefunds = ensure

/** Test seam: replaces every request. */
export function setRefunds(next: RefundRequest[]) {
  store = next
  notify()
}

/** Called after every change, so a list can load again. */
export function subscribeRefunds(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const conflict = () => Object.assign(new Error('conflict'), { kind: 'conflict' })
const notFound = () => Object.assign(new Error('not-found'), { kind: 'not-found' })
/** A rule broken by the request itself: `field` names the form field it belongs to. */
const invalid = (message: string, field: 'amount' | 'note' | 'reason') => Object.assign(new Error(message), { kind: 'validation', field })

const cents = (amount: number) => Math.round(amount * 100) / 100

/** REPLACE: GET /refunds/summary -> RefundSummary (counts by status across all requests, and the pesos given back by approved ones). */
export async function getRefundSummary({ signal, delayMs = 700 }: RequestOptions = {}): Promise<RefundSummary> {
  await wait('refund-summary', delayMs, signal)
  const summary: RefundSummary = { pending: 0, approved: 0, rejected: 0, refundedTotal: 0 }
  for (const r of ensure()) {
    summary[r.status] += 1
    summary.refundedTotal += r.approvedAmount ?? 0
  }
  summary.refundedTotal = cents(summary.refundedTotal)
  return summary
}

const STATUS_RANK: Record<RefundStatus, number> = { pending: 0, approved: 1, rejected: 2 }

const sortValue = (r: RefundRequest, sort: RefundSort): string | number | null => {
  if (sort === 'customerName' || sort === 'requestedBy') return r[sort].toLowerCase()
  if (sort === 'reason') return REFUND_REASON_LABELS[r.reason]
  if (sort === 'status') return STATUS_RANK[r.status]
  return r[sort]
}

/** REPLACE: GET /refunds?search=&status=&sort=&dir=&page=&limit= -> RefundPage (search matches request number, order number, customer and requested-by, ignoring case). */
export async function listRefunds({ signal, delayMs = 600, search, status, sort = 'requestedAt', dir = 'desc', page = 1, limit = REFUND_PER_PAGE }: RefundQuery & RequestOptions = {}): Promise<RefundPage> {
  await wait('refund-list', delayMs, signal)
  const needle = search?.trim().toLowerCase().slice(0, MAX_REFUND_SEARCH)
  const matched = ensure()
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !status || row.status === status)
    .filter(({ row }) => !needle || [row.requestNo, row.orderNo, row.customerName, row.requestedBy].some((text) => text.toLowerCase().includes(needle)))
    .sort((a, b) => {
      const x = sortValue(a.row, sort)
      const y = sortValue(b.row, sort)
      // A request not decided yet has no decision time: it goes last whichever way the column is sorted.
      if (x === null || y === null) return x === y ? a.index - b.index : x === null ? 1 : -1
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })
      return (dir === 'asc' ? 1 : -1) * order || a.index - b.index
    })
    .map(({ row }) => row)
  return { data: matched.slice((page - 1) * limit, page * limit), meta: { total: matched.length, page, limit, totalPages: Math.ceil(matched.length / limit) } }
}

/** The request, only if it is still waiting: a decision is final. */
function pendingRequest(id: string) {
  const current = ensure().find((r) => r.id === id)
  if (!current) throw notFound()
  if (current.status !== 'pending') {
    // Someone else decided it: whoever is looking at it should load the latest status.
    notify()
    throw conflict()
  }
  return current
}

function save(decided: RefundRequest) {
  store = ensure().map((r) => (r.id === decided.id ? decided : r))
  notify()
  return decided
}

/** REPLACE: POST /refunds/:id/approve with { amount, note? } -> RefundRequest (the approver is the signed-in admin); 409 when it was already decided, 422 when the amount is 0, over the order total or has more than 2 decimals. */
export async function approveRefund(id: string, { amount, note, decidedBy }: { amount: number; note?: string; decidedBy: string }, { signal, delayMs = 700 }: RequestOptions = {}): Promise<RefundRequest> {
  await wait('refund-decide', delayMs, signal)
  const current = pendingRequest(id)
  if (!Number.isFinite(amount) || amount <= 0) throw invalid('The refund must be more than ₱0.00.', 'amount')
  if (amount > current.orderTotal) throw invalid(`Enter an amount of at most ${formatPeso(current.orderTotal)}, the order total.`, 'amount')
  if (cents(amount) !== amount) throw invalid('Use pesos with at most 2 decimals, such as 1250 or 1250.50.', 'amount')
  if (note && note.length > REFUND_LIMITS.noteMax) throw invalid(`The note can be at most ${REFUND_LIMITS.noteMax} characters.`, 'note')
  return save({ ...current, status: 'approved', decidedBy, decidedAt: new Date().toISOString(), approvedAmount: amount, decisionNote: note?.trim() || null })
}

/** REPLACE: POST /refunds/:id/reject with { reason } -> RefundRequest (the customer is told the reason); 409 when it was already decided, 422 when the reason is too short or too long. */
export async function rejectRefund(id: string, { reason, decidedBy }: { reason: string; decidedBy: string }, { signal, delayMs = 700 }: RequestOptions = {}): Promise<RefundRequest> {
  await wait('refund-decide', delayMs, signal)
  const current = pendingRequest(id)
  const text = reason.trim()
  if (text.length < REFUND_LIMITS.reasonMin || text.length > REFUND_LIMITS.reasonMax) {
    throw invalid(`Use ${REFUND_LIMITS.reasonMin} to ${REFUND_LIMITS.reasonMax} characters for the reason.`, 'reason')
  }
  return save({ ...current, status: 'rejected', decidedBy, decidedAt: new Date().toISOString(), approvedAmount: null, decisionNote: text })
}
