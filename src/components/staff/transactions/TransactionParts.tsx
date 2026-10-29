import { formatPlacedAt } from '../../../utils/format'

export function PlacedAt({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="whitespace-nowrap">
      {formatPlacedAt(iso)}
    </time>
  )
}

/** Marks an order the customer sent back and was refunded in full. The word carries the meaning; the outline only frames it. */
export function ReturnedBadge() {
  return <span className="font-ui inline-flex h-5 shrink-0 items-center rounded-full border border-line-strong bg-canvas px-2 text-xs font-semibold text-fg">Returned</span>
}

/** An order's state in words, with a tint that only backs them up. */
export function StatusBadge({ returned }: { returned: boolean }) {
  return (
    <span className={`font-ui inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-semibold text-fg ${returned ? 'bg-danger/10' : 'bg-success/15'}`}>
      {returned ? 'Returned' : 'Completed'}
    </span>
  )
}
