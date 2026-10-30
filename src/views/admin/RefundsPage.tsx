import { RefundSummaryCards } from '../../components/admin/refunds/RefundSummaryCards'
import { RefundsList } from '../../components/admin/refunds/RefundsList'
import { Tooltip } from '../../components/ui/Tooltip'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'Review refund and return requests from customers and staff, see the order and items, then approve a full or partial refund or reject it with a clear reason.'

/** The refund and return requests waiting for an admin: how many wait and were decided, and a list to open, approve and reject them. */
export function RefundsPage() {
  useDocumentTitle('Returns & Refunds — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  return (
    <div className="grid gap-3">
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl text-fg sm:text-3xl">Returns &amp; Refunds</h1>
          <p className="mt-1 text-xs text-fg-muted">Refund and return requests waiting for an admin decision</p>
        </div>
        <Tooltip label="Requests and decisions are kept in this browser's session only until the orders backend is connected." describe>
          <span tabIndex={0} className="font-ui inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-sm font-medium text-fg-muted">
            Sample data
          </span>
        </Tooltip>
      </header>
      <RefundSummaryCards />
      <RefundsList />
    </div>
  )
}
