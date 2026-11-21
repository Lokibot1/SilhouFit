import { Link } from 'react-router-dom'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useCanView } from '../../hooks/usePermissions'
import { REFUND_REASON_LABELS, type RefundEntry } from '../../service/refunds'
import { formatPeso, formatPlacedAt } from '../../utils/format'
import { RefundStatusBadge } from '../admin/refunds/RefundsTable'
import { EmptyNote } from './StaffSection'

/** What was refunded on an order or a payment: the total that went back and each refund with its status, amount and time. */
export function RefundEntries({ refunds, refundedAmount }: { refunds: RefundEntry[]; refundedAmount: number }) {
  const canView = useCanView(useCurrentUser()?.role ?? 'staff')
  return (
    <div className="grid gap-3 text-base md:text-sm">
      {refunds.length === 0 ? (
        <EmptyNote>No refunds yet.</EmptyNote>
      ) : (
        <>
          <p className="font-semibold text-fg tabular-nums">Refunded {formatPeso(refundedAmount)}</p>
          <ul aria-label="Refunds" className="divide-y divide-line">
            {refunds.map((refund) => (
              <li key={refund.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
                <RefundStatusBadge status={refund.status} />
                <span className="text-right font-semibold whitespace-nowrap text-fg tabular-nums">{formatPeso(refund.amount)}</span>
                <span className="min-w-0 text-fg-muted">
                  {REFUND_REASON_LABELS[refund.reason]} · <time dateTime={refund.createdAt}>{formatPlacedAt(refund.createdAt)}</time>
                </span>
              </li>
            ))}
          </ul>
          {canView('refunds') && (
            <Link to="/admin/refunds" className="inline-flex min-h-11 items-center font-semibold underline decoration-chrome-strong decoration-2 underline-offset-2 hover:text-chrome-strong">
              Open in Refunds
            </Link>
          )}
        </>
      )}
    </div>
  )
}
