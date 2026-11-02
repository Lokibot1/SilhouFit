import { addDays, manilaToday } from '../../utils/period'
import { FilterIcon, RestoreIcon } from '../form/icons'
import { SECONDARY_BUTTON_SM } from '../ui/buttonStyles'
import { Select } from '../ui/Select'
import { ACTIONS } from './ActivityLogs'

export interface ActivityFilters {
  action: string
  user: string
  range: string
}

export const NO_FILTERS: ActivityFilters = { action: 'all', user: 'all', range: 'all' }

const ACTION_OPTIONS = [
  { value: 'all', label: 'All actions' },
  ...Object.entries(ACTIONS)
    .map(([value, { label }]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label)),
]

const DATE_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
]

/** The first day (Manila) an entry may be dated to show under a date choice; '' is no limit. */
export function sinceOf(range: string) {
  const today = manilaToday().date
  return range === 'today' ? today : range === 'week' ? addDays(today, -6) : range === 'month' ? `${today.slice(0, 7)}-01` : ''
}

const SEGMENT = 'w-full shrink-0 sm:w-40 lg:border-l lg:border-line'

/** Filter by action, user and date. `users` is whoever appears in the loaded entries. */
export function ActivityFilterBar({ filters, users, onChange }: { filters: ActivityFilters; users: string[]; onChange: (filters: ActivityFilters) => void }) {
  const filtering = filters.action !== 'all' || filters.user !== 'all' || filters.range !== 'all'
  const userOptions = [{ value: 'all', label: 'All users' }, ...users.map((user) => ({ value: user, label: user }))]
  return (
    <div role="group" aria-label="Filter activity logs" className="flex max-w-full shrink-0 flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas-sub p-2 lg:flex-nowrap lg:gap-0 lg:p-1">
      <span className="font-ui flex items-center shrink-0 gap-2 px-3 text-sm font-semibold tracking-wide text-fg-muted uppercase">
        <FilterIcon size={16} />
        Filter by
      </span>
      <div className={SEGMENT}>
        <Select label="Filter by action" value={filters.action} options={ACTION_OPTIONS} onChange={(action) => onChange({ ...filters, action })} />
      </div>
      <div className={SEGMENT}>
        <Select label="Filter by user" value={filters.user} options={userOptions} onChange={(user) => onChange({ ...filters, user })} />
      </div>
      <div className={SEGMENT}>
        <Select label="Filter by date" value={filters.range} options={DATE_OPTIONS} onChange={(range) => onChange({ ...filters, range })} />
      </div>
      <button
        type="button"
        aria-disabled={!filtering}
        onClick={() => filtering && onChange(NO_FILTERS)}
        className={`${SECONDARY_BUTTON_SM} w-full shrink-0 sm:w-auto lg:ml-1`}
      >
        <RestoreIcon size={16} />
        Reset filter
      </button>
    </div>
  )
}
