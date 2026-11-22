import { AUDIT_ACTIONS, type ActivityAction, type ActivityCategory, type ActivityLog } from '../types/activityLogs'
import { isTime } from './adminOrdersApi'
import { ProductListError, request } from './fetchProductList'
import { isMoney, isRecord, oneOf, text } from './ordersApi'
import type { RequestOptions } from './simulateRequest'

// The audit log: the API's GET /admin/audit-logs (admin or above; staff get 403). It rejects query keys it does not know,
// so only the keys below are ever sent. Entries come newest first.

export interface ActivityLogsPage {
  data: ActivityLog[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface ActivityLogsParams {
  page?: number
  /** The API allows 100 at most. */
  limit?: number
  action?: string
  actorId?: string
  /** First day (YYYY-MM-DD, Asia/Manila) to include. */
  since?: string
  /** Matches the description, target, actor email and target id. */
  search?: string
}

const bad = () => new ProductListError('server')

const CATEGORY_OF: Record<ActivityAction, ActivityCategory> = {
  USER_REGISTERED: 'account',
  USER_INVITED: 'account',
  USER_ACTIVATED: 'account',
  USER_DEACTIVATED: 'account',
  USER_MESSAGING_BLOCKED: 'account',
  USER_MESSAGING_UNBLOCKED: 'account',
  BODY_PROFILE_CREATED: 'account',
  ORDER_CREATED: 'order',
  ORDER_STATUS_CHANGED: 'order',
  ORDER_CANCELLED: 'order',
  SHIPMENT_DISPATCHED: 'order',
  SHIPMENT_DRIVER_ASSIGNED: 'order',
  SHIPMENT_STATUS_CHANGED: 'order',
  SHIPMENT_CANCELLED: 'order',
  ORDER_PAID: 'transaction',
  PAYMENT_SUCCEEDED: 'transaction',
  PAYMENT_FAILED: 'transaction',
  REFUND_REQUESTED: 'transaction',
  REFUND_SUCCEEDED: 'transaction',
  REFUND_FAILED: 'transaction',
  REFUND_MANUAL_ACTION_REQUIRED: 'transaction',
  REFUND_RETRIED: 'transaction',
  REFUND_MANUALLY_RESOLVED: 'transaction',
  PRODUCT_CREATED: 'product',
  PRODUCT_UPDATED: 'product',
  PRODUCT_STOCK_UPDATED: 'product',
  PRODUCT_DELETED: 'product',
  PRODUCT_RESTORED: 'product',
  REVIEW_REPLIED: 'product',
  REVIEW_DELETED: 'product',
  REVIEW_RESTORED: 'product',
  SIZE_MEASUREMENT_CREATED: 'product',
  SIZE_MEASUREMENT_UPDATED: 'product',
  SIZE_MEASUREMENT_DELETED: 'product',
  SIZE_MEASUREMENT_RESTORED: 'product',
}

const ACTOR_TYPES = ['USER', 'SYSTEM', 'WEBHOOK'] as const

/** Who did it. Webhooks are labelled by type, never by name: payment webhooks carry the customer's name. */
export function actorLabel(action: string, type: (typeof ACTOR_TYPES)[number], fullName: string | null, email: string | null): string {
  if (type === 'SYSTEM') return 'System'
  if (type === 'WEBHOOK') return action.startsWith('SHIPMENT_') ? 'Courier' : 'Payment gateway'
  return fullName ?? email ?? 'Removed account'
}

function toLog(value: unknown): ActivityLog {
  if (!isRecord(value)) throw bad()
  const { id, action, description, createdAt, actor, target } = value
  if (typeof id !== 'string' || typeof action !== 'string' || !isTime(createdAt) || !isRecord(actor) || !isRecord(target)) throw bad()
  if (!oneOf(ACTOR_TYPES, actor.type) || typeof target.id !== 'string') throw bad()
  return {
    id,
    // shortcut: an action added to the API later shows under Accounts with its own word, until it is added to the lists above.
    category: oneOf(AUDIT_ACTIONS, action) ? CATEGORY_OF[action] : 'account',
    action,
    actor: actorLabel(action, actor.type, text(actor.fullName), text(actor.email)),
    actorId: text(actor.id),
    actorRole: actor.type === 'USER' ? text(actor.role) : null,
    target: text(target.label) ?? target.id,
    detail: text(description) ?? undefined,
    createdAt,
  }
}

/** GET /admin/audit-logs, newest first. `since` becomes the start of that day in Manila. */
export async function fetchActivityLogs({ page = 1, limit = 25, action, actorId, since, search }: ActivityLogsParams, { signal }: RequestOptions = {}): Promise<ActivityLogsPage> {
  const query = new URLSearchParams({ page: String(page), limit: String(Math.min(limit, 100)) })
  if (action) query.set('action', action)
  if (actorId) query.set('actorId', actorId)
  if (since) query.set('startDate', `${since}T00:00:00+08:00`)
  if (search) query.set('search', search)
  const body = await request('GET', `/admin/audit-logs?${query}`, undefined, signal)
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || !isMoney(meta.total)) throw bad()
  return {
    data: body.data.map(toLog),
    meta: { total: meta.total, page: Number(meta.page) || page, limit: Number(meta.limit) || limit, totalPages: Number(meta.totalPages) || 0 },
  }
}
