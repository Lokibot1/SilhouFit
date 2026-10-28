import type { ActivityKind } from './accounts'

export type ActivityCategory = 'account' | 'order' | 'transaction' | 'product'

export type ActivityAction =
  | ActivityKind
  | 'order-placed'
  | 'order-confirmed'
  | 'order-shipped'
  | 'order-cancelled'
  | 'payment-recorded'
  | 'refund-issued'
  | 'refund-approved'
  | 'invoice-viewed'
  | 'invoice-exported'
  | 'product-created'
  | 'product-edited'
  | 'product-archived'
  | 'product-restocked'
  | 'size-measurements-updated'
  | 'ar-model-added'

/** One line of the admin Activity Logs. */
export interface ActivityLog {
  id: string
  category: ActivityCategory
  action: ActivityAction
  /** Who did it, by name. */
  actor: string
  /** What it was done to: a person, an order number or a product. */
  target: string
  /** A short extra line, e.g. the amount or the change. */
  detail?: string
  /** ISO time. */
  createdAt: string
}
