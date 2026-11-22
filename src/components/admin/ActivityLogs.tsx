import type { ComponentType } from 'react'
import { useSection } from '../../hooks/useSection'
import { fetchActivityLogs } from '../../service/activityLogs'
import type { RequestOptions } from '../../service/simulateRequest'
import type { ActivityAction, ActivityCategory, ActivityLog } from '../../types/activityLogs'
import {
  ArchiveIcon,
  BagIcon,
  BanknoteIcon,
  BoxIcon,
  CheckIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  RestoreIcon,
  RulerIcon,
  XIcon,
} from '../form/icons'
import { EmptyNote, SectionBody, StaffSection } from '../staff/StaffSection'
import { ViewAllLink } from '../staff/ViewAllLink'

type Icon = ComponentType<{ size?: 16 | 20; className?: string }>

// Each category has a word and a tint, each action an icon and a word, so nothing rests on colour alone.
export const CATEGORIES: Record<ActivityCategory, { label: string; tint: string }> = {
  account: { label: 'Accounts', tint: 'bg-chart-1/20' },
  order: { label: 'Orders', tint: 'bg-chart-2/20' },
  transaction: { label: 'Transactions', tint: 'bg-chart-3/20' },
  product: { label: 'Products', tint: 'bg-chart-4/20' },
}

export const ACTIONS: Record<ActivityAction, { label: string; icon: Icon }> = {
  USER_REGISTERED: { label: 'Customer signed up', icon: PlusIcon },
  USER_INVITED: { label: 'Account invited', icon: PlusIcon },
  USER_ACTIVATED: { label: 'Account activated', icon: RestoreIcon },
  USER_DEACTIVATED: { label: 'Account deactivated', icon: ArchiveIcon },
  USER_MESSAGING_BLOCKED: { label: 'Messaging blocked', icon: XIcon },
  USER_MESSAGING_UNBLOCKED: { label: 'Messaging unblocked', icon: RestoreIcon },
  BODY_PROFILE_CREATED: { label: 'Body profile created', icon: RulerIcon },
  ORDER_CREATED: { label: 'Order placed', icon: BagIcon },
  ORDER_STATUS_CHANGED: { label: 'Order status changed', icon: PencilIcon },
  ORDER_CANCELLED: { label: 'Order cancelled', icon: XIcon },
  PICKUP_LOCATION_CREATED: { label: 'Pickup location set', icon: MapPinIcon },
  PICKUP_LOCATION_UPDATED: { label: 'Pickup location updated', icon: MapPinIcon },
  PICKUP_LOCATION_DELETED: { label: 'Pickup location removed', icon: ArchiveIcon },
  SHIPMENT_DISPATCHED: { label: 'Rider booked', icon: BoxIcon },
  SHIPMENT_DRIVER_ASSIGNED: { label: 'Driver assigned', icon: CheckIcon },
  SHIPMENT_STATUS_CHANGED: { label: 'Delivery status changed', icon: BoxIcon },
  SHIPMENT_CANCELLED: { label: 'Delivery cancelled', icon: XIcon },
  ORDER_PAID: { label: 'Order paid', icon: BanknoteIcon },
  PAYMENT_SUCCEEDED: { label: 'Payment received', icon: BanknoteIcon },
  PAYMENT_FAILED: { label: 'Payment failed', icon: XIcon },
  REFUND_REQUESTED: { label: 'Refund started', icon: BanknoteIcon },
  REFUND_SUCCEEDED: { label: 'Refund completed', icon: CheckIcon },
  REFUND_FAILED: { label: 'Refund failed', icon: XIcon },
  REFUND_MANUAL_ACTION_REQUIRED: { label: 'Refund needs manual action', icon: BanknoteIcon },
  REFUND_RETRIED: { label: 'Refund retried', icon: RestoreIcon },
  REFUND_MANUALLY_RESOLVED: { label: 'Refund marked as refunded', icon: CheckIcon },
  PRODUCT_CREATED: { label: 'Product created', icon: PlusIcon },
  PRODUCT_UPDATED: { label: 'Product edited', icon: PencilIcon },
  PRODUCT_STOCK_UPDATED: { label: 'Stock updated', icon: BoxIcon },
  PRODUCT_DELETED: { label: 'Product archived', icon: ArchiveIcon },
  PRODUCT_RESTORED: { label: 'Product restored', icon: RestoreIcon },
  REVIEW_REPLIED: { label: 'Review replied to', icon: PencilIcon },
  REVIEW_DELETED: { label: 'Review removed', icon: ArchiveIcon },
  REVIEW_RESTORED: { label: 'Review restored', icon: RestoreIcon },
  SIZE_MEASUREMENT_CREATED: { label: 'Size measurement added', icon: RulerIcon },
  SIZE_MEASUREMENT_UPDATED: { label: 'Size measurement updated', icon: RulerIcon },
  SIZE_MEASUREMENT_DELETED: { label: 'Size measurement archived', icon: ArchiveIcon },
  SIZE_MEASUREMENT_RESTORED: { label: 'Size measurement restored', icon: RestoreIcon },
}

/** An action the API added after this list was written reads as its own words ("Some action"), with a generic icon. */
export function actionOf(action: string): { label: string; icon: Icon } {
  const known = (ACTIONS as Record<string, { label: string; icon: Icon }>)[action]
  if (known) return known
  const words = action.toLowerCase().replaceAll('_', ' ')
  return { label: words.charAt(0).toUpperCase() + words.slice(1), icon: PencilIcon }
}

/** "Staff"; null for the system and webhooks. */
export const roleLabel = (log: ActivityLog) => (log.actorRole ? log.actorRole.charAt(0).toUpperCase() + log.actorRole.slice(1) : null)

/** "by Liza Cruz · Staff". */
export const byline = (log: ActivityLog) => `by ${log.actor}${roleLabel(log) ? ` · ${roleLabel(log)}` : ''}`

const ZONE = 'Asia/Manila'
const day = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: ZONE })
const clock = (date: Date) => date.toLocaleTimeString('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit', hour12: true })

/** "Today, 3:45 PM", "Yesterday, 9:05 AM", or "Oct 22, 3:45 PM" (Manila time). */
function when(iso: string, now = new Date()) {
  const at = new Date(iso)
  const label =
    day(at) === day(now)
      ? 'Today'
      : day(at) === day(new Date(now.getTime() - 86_400_000))
        ? 'Yesterday'
        : at.toLocaleDateString('en-US', { timeZone: ZONE, month: 'short', day: 'numeric', ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
  return `${label}, ${clock(at)}`
}

// One fixed height for loading, empty and loaded, so the tile never shifts. It matches the order log's: the same fixed height below xl, half the column from xl.
const DASHBOARD_WINDOW = 'h-80 xl:h-auto xl:min-h-0 xl:flex-1'
const ROW = 'min-h-14 py-2'
const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

function LogSkeleton({ window }: { window: string }) {
  return (
    <div role="status" aria-label="Loading activity logs" className={`${window} animate-pulse divide-y divide-line overflow-hidden`}>
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className={`${ROW} flex items-center gap-3`}>
          <div className="size-8 shrink-0 rounded-xl bg-line" />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Bar className="h-4 w-1/2" />
            <Bar className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

const fetchLatest = (options: RequestOptions) => fetchActivityLogs({ limit: 20 }, options)

/** What admins, staff and customers did across accounts, orders, transactions and products, newest first. */
export function ActivityLogs() {
  const section = useSection(fetchLatest)
  return (
    <StaffSection
      id="activity-logs"
      title="Activity Logs"
      description={section.state.status === 'success' ? count(section.state.data.meta.total) : 'Recent actions across the shop'}
      action={<ViewAllLink to="/admin/activity-logs" what="activity logs" />}
    >
      <SectionBody section={section} what="the activity logs" skeleton={<LogSkeleton window={DASHBOARD_WINDOW} />}>
        {({ data: logs }) => {
          return logs.length === 0 ? (
            <div className={DASHBOARD_WINDOW}>
              <EmptyNote>No activity yet. Orders, payments, product changes and account changes are logged here.</EmptyNote>
            </div>
          ) : (
            // A scrolling list needs to be reachable by keyboard.
            <ul tabIndex={0} aria-labelledby="activity-logs" className={`${DASHBOARD_WINDOW} divide-y divide-line overflow-y-auto`}>
              {logs.map((log) => {
                const { label, icon: Icon } = actionOf(log.action)
                return (
                  <li key={log.id} className={`${ROW} flex items-center gap-3`}>
                    <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-xl text-fg ${CATEGORIES[log.category].tint}`}>
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg">
                        {label}: {log.target}
                      </p>
                      <p className="text-xs text-fg-muted">
                        {CATEGORIES[log.category].label} · {byline(log)} ·{' '}
                        <time dateTime={log.createdAt} className="tabular-nums">
                          {when(log.createdAt)}
                        </time>
                      </p>
                      {log.detail && <p className="text-xs text-fg-muted">{log.detail}</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        }}
      </SectionBody>
    </StaffSection>
  )
}

/** "51 entries". */
function count(total: number) {
  return `${total} ${total === 1 ? 'entry' : 'entries'}`
}
