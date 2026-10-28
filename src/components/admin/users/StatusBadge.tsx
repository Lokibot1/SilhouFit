import type { AccountStatus } from '../../../types/accounts'

const STATUS = {
  active: { label: 'Active', dot: 'bg-success' },
  inactive: { label: 'Inactive', dot: 'border-2 border-line-strong' },
  archived: { label: 'Archived', dot: 'border-2 border-dashed border-fg-muted' },
} as const

/** The status in words and a dot (filled, ringed or dashed), so it never rests on colour alone. */
export function StatusBadge({ status }: { status: AccountStatus }) {
  const { label, dot } = STATUS[status]
  return (
    <span className="font-ui inline-flex h-6 items-center gap-1.5 rounded-full border border-line-strong px-2 text-sm whitespace-nowrap text-fg">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
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
