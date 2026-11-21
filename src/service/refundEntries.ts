import { ProductListError } from './fetchProductList'
import { isMoney, isRecord, oneOf, text } from './ordersApi'

// The refund summaries inside an order's or a payment's detail (the refunds log has its own, richer rows: see refunds.ts).

export const REFUND_STATUSES = ['REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REQUIRES_MANUAL_ACTION', 'CANCELLED'] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]
export const REFUND_REASONS = ['LATE_PAYMENT_ON_CANCELLED_ORDER', 'ORDER_CANCELLED', 'CUSTOMER_REQUEST', 'DUPLICATE_PAYMENT', 'PARTIAL_ITEM_REFUND', 'SHIPPING_ADJUSTMENT', 'FRAUDULENT', 'OTHER'] as const
export type RefundReason = (typeof REFUND_REASONS)[number]
export const REFUND_TRIGGERS = ['SYSTEM_AUTO', 'ADMIN_MANUAL', 'CUSTOMER_WORKFLOW'] as const
export type RefundTrigger = (typeof REFUND_TRIGGERS)[number]

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  REQUESTED: 'Requested',
  PROCESSING: 'Processing',
  SUCCEEDED: 'Refunded',
  FAILED: 'Failed',
  REQUIRES_MANUAL_ACTION: 'Needs manual action',
  CANCELLED: 'Cancelled',
}
export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  LATE_PAYMENT_ON_CANCELLED_ORDER: 'Late payment on cancelled order',
  ORDER_CANCELLED: 'Order cancelled',
  CUSTOMER_REQUEST: 'Customer request',
  DUPLICATE_PAYMENT: 'Duplicate payment',
  PARTIAL_ITEM_REFUND: 'Partial item refund',
  SHIPPING_ADJUSTMENT: 'Shipping adjustment',
  FRAUDULENT: 'Fraudulent',
  OTHER: 'Other',
}
export const REFUND_TRIGGER_LABELS: Record<RefundTrigger, string> = {
  SYSTEM_AUTO: 'Automatic',
  ADMIN_MANUAL: 'Admin',
  CUSTOMER_WORKFLOW: 'Customer',
}

/** One refund of an order or a payment, as the API lists it in the detail. */
export interface RefundEntry {
  id: string
  /** Pesos. */
  amount: number
  status: RefundStatus
  reason: RefundReason
  /** The gateway's refund ID; null until the gateway has taken it. */
  refundReference: string | null
  manualReference: string | null
  failureCode: string | null
  /** ISO times. */
  succeededAt: string | null
  createdAt: string
}

const isTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))

function toEntry(value: unknown): RefundEntry {
  if (!isRecord(value)) throw new ProductListError('server')
  const { id, amount, status, reason, createdAt } = value
  if (typeof id !== 'string' || !isMoney(amount) || !oneOf(REFUND_STATUSES, status) || !oneOf(REFUND_REASONS, reason) || !isTime(createdAt)) throw new ProductListError('server')
  return {
    id,
    amount,
    status,
    reason,
    refundReference: text(value.externalRefundId),
    manualReference: text(value.manualReference),
    failureCode: text(value.failureCode),
    succeededAt: isTime(value.succeededAt) ? value.succeededAt : null,
    createdAt,
  }
}

/** What the detail says was refunded: an older response without these fields reads as nothing refunded. */
export function toRefundSummary(body: Record<string, unknown>): { refundedAmount: number; refunds: RefundEntry[] } {
  return { refundedAmount: isMoney(body.refundedAmount) ? body.refundedAmount : 0, refunds: Array.isArray(body.refunds) ? body.refunds.map(toEntry) : [] }
}
