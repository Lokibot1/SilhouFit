export type ActivityCategory = 'account' | 'order' | 'transaction' | 'product'

/** The actions the API records (GET /admin/audit-logs). */
export const AUDIT_ACTIONS = [
  'USER_REGISTERED',
  'USER_INVITED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'USER_MESSAGING_BLOCKED',
  'USER_MESSAGING_UNBLOCKED',
  'BODY_PROFILE_CREATED',
  'ORDER_CREATED',
  'ORDER_STATUS_CHANGED',
  'ORDER_CANCELLED',
  'PICKUP_LOCATION_CREATED',
  'PICKUP_LOCATION_UPDATED',
  'PICKUP_LOCATION_DELETED',
  'SHIPMENT_DISPATCHED',
  'SHIPMENT_DRIVER_ASSIGNED',
  'SHIPMENT_STATUS_CHANGED',
  'SHIPMENT_CANCELLED',
  'ORDER_PAID',
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
  'REFUND_REQUESTED',
  'REFUND_SUCCEEDED',
  'REFUND_FAILED',
  'REFUND_MANUAL_ACTION_REQUIRED',
  'REFUND_RETRIED',
  'REFUND_MANUALLY_RESOLVED',
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_STOCK_UPDATED',
  'PRODUCT_DELETED',
  'PRODUCT_RESTORED',
  'REVIEW_REPLIED',
  'REVIEW_DELETED',
  'REVIEW_RESTORED',
  'SIZE_MEASUREMENT_CREATED',
  'SIZE_MEASUREMENT_UPDATED',
  'SIZE_MEASUREMENT_DELETED',
  'SIZE_MEASUREMENT_RESTORED',
] as const
export type ActivityAction = (typeof AUDIT_ACTIONS)[number]

/** One line of the admin Activity Logs. */
export interface ActivityLog {
  id: string
  category: ActivityCategory
  /** An action this app does not know yet is kept as the API's word. */
  action: ActivityAction | string
  /** Who did it, by name, or "System", "Payment gateway" or "Courier". */
  actor: string
  actorId: string | null
  /** The actor's role, e.g. "staff"; null for the system and webhooks. */
  actorRole: string | null
  /** What it was done to: a person, an order number or a product. */
  target: string
  /** The API's sentence about what happened. */
  detail?: string
  /** ISO time. */
  createdAt: string
}
