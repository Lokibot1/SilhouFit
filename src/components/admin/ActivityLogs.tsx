import type { ComponentType } from 'react'
import { useSection } from '../../hooks/useSection'
import { getActivityLogs } from '../../service/activityLogs'
import type { ActivityAction, ActivityCategory } from '../../types/activityLogs'
import {
  ArchiveIcon,
  ArIcon,
  BagIcon,
  BanknoteIcon,
  BoxIcon,
  CheckIcon,
  DownloadIcon,
  EyeIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  RestoreIcon,
  RulerIcon,
  SettingsIcon,
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
  'staff-created': { label: 'Staff invited', icon: PlusIcon },
  'admin-created': { label: 'Admin invited', icon: SettingsIcon },
  'superadmin-created': { label: 'Superadmin invited', icon: SettingsIcon },
  'password-reset': { label: 'Password reset email sent', icon: LockIcon },
  archived: { label: 'Account deactivated', icon: ArchiveIcon },
  restored: { label: 'Account activated', icon: RestoreIcon },
  'order-placed': { label: 'Order placed', icon: BagIcon },
  'order-confirmed': { label: 'Order confirmed', icon: CheckIcon },
  'order-shipped': { label: 'Order shipped', icon: BoxIcon },
  'order-cancelled': { label: 'Order cancelled', icon: XIcon },
  'payment-recorded': { label: 'Payment recorded', icon: BanknoteIcon },
  'refund-issued': { label: 'Refund issued', icon: RestoreIcon },
  'refund-approved': { label: 'Refund approved', icon: CheckIcon },
  'invoice-viewed': { label: 'Invoice viewed', icon: EyeIcon },
  'invoice-exported': { label: 'Invoice exported', icon: DownloadIcon },
  'product-created': { label: 'Product created', icon: PlusIcon },
  'product-edited': { label: 'Product edited', icon: PencilIcon },
  'product-archived': { label: 'Product archived', icon: ArchiveIcon },
  'product-restocked': { label: 'Product restocked', icon: BoxIcon },
  'size-measurements-updated': { label: 'Size measurements updated', icon: RulerIcon },
  'ar-model-added': { label: 'AR model added', icon: ArIcon },
}

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

/** What admins, staff and customers did across accounts, orders, transactions and products, newest first. */
export function ActivityLogs() {
  const section = useSection(getActivityLogs)
  return (
    <StaffSection
      id="activity-logs"
      title="Activity Logs"
      description={section.state.status === 'success' ? count(section.state.data.length) : 'Recent actions across the shop'}
      action={<ViewAllLink to="/admin/activity-logs" what="activity logs" />}
    >
      <SectionBody section={section} what="the activity logs" skeleton={<LogSkeleton window={DASHBOARD_WINDOW} />}>
        {(logs) => {
          return logs.length === 0 ? (
            <div className={DASHBOARD_WINDOW}>
              <EmptyNote>No activity yet. Orders, payments, product changes and account changes are logged here.</EmptyNote>
            </div>
          ) : (
            // A scrolling list needs to be reachable by keyboard.
            <ul tabIndex={0} aria-labelledby="activity-logs" className={`${DASHBOARD_WINDOW} divide-y divide-line overflow-y-auto`}>
              {logs.map((log) => {
                const { label, icon: Icon } = ACTIONS[log.action]
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
                        {CATEGORIES[log.category].label} · by {log.actor} ·{' '}
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
