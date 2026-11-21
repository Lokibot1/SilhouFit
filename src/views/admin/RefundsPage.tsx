import { RefundSummaryCards } from '../../components/admin/refunds/RefundSummaryCards'
import { RefundsList } from '../../components/admin/refunds/RefundsList'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'See every customer refund, whether it is waiting, with the payment gateway, paid or failed, and let an admin retry a refund or check it with the gateway.'

/** The refunds log: how many need action or are in progress, the pesos given back and still owed, and a list to open each refund (an admin can retry it or check it with the gateway). */
export function RefundsPage() {
  useDocumentTitle('Refunds — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  return (
    <div className="grid gap-3">
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl text-fg sm:text-3xl">Refunds</h1>
          <p className="mt-1 text-xs text-fg-muted">Every refund and where it stands with the payment gateway</p>
        </div>
      </header>
      <RefundSummaryCards />
      <RefundsList />
    </div>
  )
}
