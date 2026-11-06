import type { AccountStatus } from '../../../types/accounts'

const STATUS = {
  active: { label: 'Active', dot: 'bg-success' },
  inactive: { label: 'Inactive', dot: 'border-2 border-line-strong' },
} as const

/** The status in words and a dot (filled, ringed or dashed), so it never rests on colour alone. */
export function StatusBadge({ status, compact }: { status: AccountStatus; compact?: boolean }) {
  const { label, dot } = STATUS[status === 'archived' ? 'inactive' : status]
  return (
    <span className={`font-ui inline-flex items-center rounded-full border border-line-strong whitespace-nowrap text-fg ${compact ? 'h-5 gap-1 px-1.5 text-xs' : 'h-6 gap-1.5 px-2 text-sm'}`}>
      <span aria-hidden="true" className={`shrink-0 rounded-full ${compact ? 'size-1.5' : 'size-2'} ${dot}`} />
      {label}
    </span>
  )
}

/** A first-login flag next to the status: the person has not chosen their own password yet. */
export function PendingBadge() {
  return (
    <span className="font-ui inline-flex h-6 items-center rounded-full bg-fg/10 px-2 text-xs font-semibold whitespace-nowrap text-fg">
      Password change due
    </span>
  )
}
