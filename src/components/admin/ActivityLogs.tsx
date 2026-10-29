import { useState, type ComponentType } from 'react'
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
import { Select } from '../ui/Select'
import { ViewAllLink } from '../staff/ViewAllLink'

type Icon = ComponentType<{ size?: 16 | 20; className?: string }>

// Each category has a word and a tint, each action an icon and a word, so nothing rests on colour alone.
const CATEGORIES: Record<ActivityCategory, { label: string; tint: string }> = {
  account: { label: 'Accounts', tint: 'bg-chart-1/20' },
  order: { label: 'Orders', tint: 'bg-chart-2/20' },
  transaction: { label: 'Transactions', tint: 'bg-chart-3/20' },
  product: { label: 'Products', tint: 'bg-chart-4/20' },
}

const ACTIONS: Record<ActivityAction, { label: string; icon: Icon }> = {
  'staff-created': { label: 'Staff account created', icon: PlusIcon },
  'admin-created': { label: 'Admin account created', icon: SettingsIcon },
  'password-reset': { label: 'Password reset', icon: LockIcon },
  archived: { label: 'Staff archived', icon: ArchiveIcon },
  restored: { label: 'Staff restored', icon: RestoreIcon },
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

type Filter = 'all' | ActivityCategory
const FILTERS = [{ value: 'all' as Filter, label: 'All' }, ...Object.entries(CATEGORIES).map(([value, { label }]) => ({ value: value as Filter, label }))]

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

// One fixed height for loading, empty and loaded, so the tile never shifts. On the dashboard it matches the order log's: the same fixed height below xl, half the column from xl.
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

/** What admins, staff and customers did across accounts, orders, transactions and products, newest first. `full` is the page's own list: every entry, no fixed window and no link to itself. */
export function ActivityLogs({ full = false }: { full?: boolean }) {
  const WINDOW = full ? '' : DASHBOARD_WINDOW
  const section = useSection(getActivityLogs)
  const [filter, setFilter] = useState<Filter>('all')
  return (
    <StaffSection
      id="activity-logs"
      title="Activity Logs"
      description={section.state.status === 'success' ? count(section.state.data.length, filter, section.state.data) : 'Recent actions across the shop'}
      action={
        <div className="flex items-center gap-2">
          <div className="h-9 w-36 shrink-0 pointer-coarse:h-11 max-md:h-11">
            <Select label="Filter activity logs by category" value={filter} options={FILTERS} onChange={setFilter} className="h-full" />
          </div>
          {!full && <ViewAllLink to="/admin/activity-logs" what="activity logs" />}
        </div>
      }
    >
      <SectionBody section={section} what="the activity logs" skeleton={<LogSkeleton window={WINDOW} />}>
        {(logs) => {
          const shown = logs.filter((log) => filter === 'all' || log.category === filter)
          return shown.length === 0 ? (
            <div className={WINDOW}>
              <EmptyNote>
                {filter === 'all'
                  ? 'No activity yet. Orders, payments, product changes and account changes are logged here.'
                  : `No ${CATEGORIES[filter].label.toLowerCase()} activity yet. Choose All to see everything.`}
              </EmptyNote>
            </div>
          ) : (
            // A scrolling list needs to be reachable by keyboard.
            <ul tabIndex={0} aria-labelledby="activity-logs" className={`${WINDOW} divide-y divide-line overflow-y-auto`}>
              {shown.map((log) => {
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

/** "51 entries", or "12 of 51 entries" while a category is chosen. */
function count(total: number, filter: Filter, logs: { category: ActivityCategory }[]) {
  const n = filter === 'all' ? total : logs.filter((log) => log.category === filter).length
  const words = n === 1 ? 'entry' : 'entries'
  return filter === 'all' ? `${n} ${words}` : `${n} of ${total} ${words}`
}
