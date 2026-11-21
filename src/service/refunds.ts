import { isTime, REMOVED, toCustomer } from './adminOrdersApi'
import { ProductListError, request } from './fetchProductList'
import { isMoney, isRecord, oneOf, text } from './ordersApi'
import { REFUND_REASONS, REFUND_STATUSES, REFUND_TRIGGERS, type RefundReason, type RefundStatus, type RefundTrigger } from './refundEntries'
import type { RequestOptions } from './simulateRequest'

// Staff refunds: the API's /admin/refunds endpoints (staff role or above to read, admin or above to retry, sync and mark as refunded). The API rejects query keys it does not know,
// so only the keys below are ever sent. No cache and no polling: every read goes to the server.

export { REFUND_REASON_LABELS, REFUND_REASONS, REFUND_STATUS_LABELS, REFUND_STATUSES, REFUND_TRIGGER_LABELS, REFUND_TRIGGERS } from './refundEntries'
export type { RefundEntry, RefundReason, RefundStatus, RefundTrigger } from './refundEntries'
export type RefundSort = 'createdAt' | 'amount'
export type RefundDir = 'asc' | 'desc'

export interface Refund {
  id: string
  /** Null when the order is gone. */
  orderNumber: string | null
  /** The customer's name, or "Customer account removed" once the account is gone. */
  customerName: string
  customerEmail: string | null
  /** The gateway, e.g. paymongo. */
  provider: string
  /** The gateway's own payment ID. */
  paymentReference: string
  /** The gateway's own refund ID; null until the gateway has taken the refund. */
  refundReference: string | null
  /** Pesos. */
  amount: number
  status: RefundStatus
  reason: RefundReason
  reasonNotes: string | null
  trigger: RefundTrigger
  /** Who started it; null when the system did. */
  startedBy: string | null
  /** The reference of a refund paid outside the gateway. */
  manualReference: string | null
  resolvedBy: string | null
  failureCode: string | null
  failureMessage: string | null
  attempts: number
  /** ISO times; null while they have not happened. */
  nextRetryAt: string | null
  createdAt: string
}

export interface RefundDetail extends Refund {
  /** The gateway's answer, as received. Show it through `redactPayload`. */
  gatewayResponse: Record<string, unknown> | null
}

export interface RefundsPage {
  data: Refund[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface RefundsParams {
  page?: number
  /** The API allows 100 at most. */
  limit?: number
  status?: RefundStatus
  /** Order number, customer name, email or a reference. */
  search?: string
  sortBy?: RefundSort
  sortOrder?: RefundDir
}

/** Counts and volumes across every refund, whatever the list is filtered to. */
export interface RefundMetrics {
  totalRefunds: number
  requestedCount: number
  processingCount: number
  succeededCount: number
  failedCount: number
  requiresManualActionCount: number
  cancelledCount: number
  /** Pesos given back. */
  totalRefundedVolume: number
  /** Pesos still owed to customers. */
  pendingRefundLiabilityVolume: number
}

export const REFUND_PER_PAGE = 10
export const REFUND_PER_PAGE_OPTIONS = [10, 25, 50]
export const MAX_REFUND_SEARCH = 60
/** How many times the API sends a refund to the gateway by itself before it needs an admin. */
export const MAX_AUTO_ATTEMPTS = 5

const bad = () => new ProductListError('server')
const timeOrNull = (value: unknown) => (isTime(value) ? value : null)

function toRefund(value: unknown): Refund {
  if (!isRecord(value)) throw bad()
  const { id, provider, externalPaymentId, amount, status, reason, triggerSource, createdAt, attemptCount, order } = value
  if (typeof id !== 'string' || typeof provider !== 'string' || typeof externalPaymentId !== 'string') throw bad()
  if (!isMoney(amount) || !oneOf(REFUND_STATUSES, status) || !oneOf(REFUND_REASONS, reason) || !oneOf(REFUND_TRIGGERS, triggerSource) || !isTime(createdAt)) throw bad()
  if (order !== null && order !== undefined && (!isRecord(order) || typeof order.orderNumber !== 'string')) throw bad()
  const customer = toCustomer(value.customer)
  return {
    id,
    orderNumber: isRecord(order) ? (order.orderNumber as string) : null,
    customerName: customer?.name ?? REMOVED,
    customerEmail: customer?.email ?? null,
    provider,
    paymentReference: externalPaymentId,
    refundReference: text(value.externalRefundId),
    amount,
    status,
    reason,
    reasonNotes: text(value.reasonNotes),
    trigger: triggerSource,
    startedBy: toCustomer(value.initiatedBy)?.name ?? null,
    manualReference: text(value.manualReference),
    resolvedBy: toCustomer(value.resolvedBy)?.name ?? null,
    failureCode: text(value.failureCode),
    failureMessage: text(value.failureMessage),
    attempts: isMoney(attemptCount) ? attemptCount : 0,
    nextRetryAt: timeOrNull(value.nextRetryAt),
    createdAt,
  }
}

function toDetail(body: unknown): RefundDetail {
  const refund = toRefund(body)
  const { rawProviderResponse } = body as Record<string, unknown>
  return { ...refund, gatewayResponse: isRecord(rawProviderResponse) ? rawProviderResponse : null }
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** Called after every retry or sync, so the list and the figures can load again. */
export function subscribeRefunds(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const base = (id: string) => `/admin/refunds/${encodeURIComponent(id)}`

/** Feature: Staff refunds – List refunds */
/** GET /admin/refunds. Newest first unless sorted. */
export async function listRefunds({ page = 1, limit = REFUND_PER_PAGE, status, search, sortBy, sortOrder }: RefundsParams, { signal }: RequestOptions = {}): Promise<RefundsPage> {
  const query = new URLSearchParams({ page: String(page), limit: String(Math.min(limit, 100)) })
  if (status) query.set('status', status)
  if (search) query.set('search', search)
  if (sortBy) query.set('sortBy', sortBy)
  if (sortOrder) query.set('sortOrder', sortOrder)
  const body = await request('GET', `/admin/refunds?${query}`, undefined, signal)
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || !isMoney(meta.total)) throw bad()
  return {
    data: body.data.map(toRefund),
    meta: { total: meta.total, page: Number(meta.page) || page, limit: Number(meta.limit) || limit, totalPages: Number(meta.totalPages) || 0 },
  }
}

/** Feature: Staff refunds – Metrics */
/** GET /admin/refunds/metrics. Ignores every filter. */
export async function getRefundMetrics({ signal }: RequestOptions = {}): Promise<RefundMetrics> {
  const body = await request('GET', '/admin/refunds/metrics', undefined, signal)
  if (!isRecord(body)) throw bad()
  const { totalRefunds, requestedCount, processingCount, succeededCount, failedCount, requiresManualActionCount, cancelledCount, totalRefundedVolume, pendingRefundLiabilityVolume } = body
  const figures = [totalRefunds, requestedCount, processingCount, succeededCount, failedCount, requiresManualActionCount, cancelledCount, totalRefundedVolume, pendingRefundLiabilityVolume]
  if (!figures.every(isMoney)) throw bad()
  return { totalRefunds, requestedCount, processingCount, succeededCount, failedCount, requiresManualActionCount, cancelledCount, totalRefundedVolume, pendingRefundLiabilityVolume } as RefundMetrics
}

/** Feature: Staff refunds – View refund */
/** GET /admin/refunds/:id. A missing refund is a 404, which reads as 'not-found'. */
export async function getRefund(id: string, { signal }: RequestOptions = {}): Promise<RefundDetail> {
  return toDetail(await request('GET', base(id), undefined, signal))
}

/**
 * POST /admin/refunds/:id/retry (admin or above). The API answers 200 even when the gateway refuses, so the caller reads the returned
 * status and failure instead of assuming it worked. A refund that is final, already sent or in progress is a 400 or 409 with the server's sentence.
 */
export async function retryRefund(id: string): Promise<RefundDetail> {
  const refund = toDetail(await request('POST', `${base(id)}/retry`, undefined))
  notify()
  return refund
}

/** POST /admin/refunds/:id/sync (admin or above). Asks the gateway where the refund stands; a refund it has not taken yet is a 400. */
export async function syncRefund(id: string): Promise<RefundDetail> {
  const refund = toDetail(await request('POST', `${base(id)}/sync`, undefined))
  notify()
  return refund
}

/**
 * Feature: Staff refunds – Mark as refunded
 * POST /admin/refunds/:id/resolve-manual (admin or above). Records a refund that was paid outside the gateway. A final refund is a 400, one the gateway is
 * still working on a 409, both with the server's sentence.
 */
export async function resolveRefundManually(id: string, { manualReference, notes }: { manualReference: string; notes?: string }): Promise<RefundDetail> {
  const refund = toDetail(await request('POST', `${base(id)}/resolve-manual`, { manualReference, ...(notes && { notes }) }))
  notify()
  return refund
}
