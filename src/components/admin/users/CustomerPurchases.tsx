import { useCallback, useState } from 'react'
import { useSection } from '../../../hooks/useSection'
import { fetchUserOrders, fetchUserOrderSummary, type AdminOrderRow, type AdminOrdersPage } from '../../../service/adminOrdersApi'
import { formatPeso, formatPlacedAt } from '../../../utils/format'
import { Pagination } from '../../shop/Pagination'
import { EmptyNote, SectionBody } from '../../staff/StaffSection'
import { OrderPills } from '../../staff/orders/OrderPills'

const LIMIT = 10

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

const SummarySkeleton = (
  <div role="status" aria-label="Loading the total spent" className="animate-pulse">
    <Bar className="h-6 w-40" />
    <Bar className="mt-1 h-5 w-64 max-w-full" />
  </div>
)

const ListSkeleton = (
  <div role="status" className="animate-pulse">
    <span className="sr-only">Loading purchases</span>
    <ul className="divide-y divide-line border-y border-line">
      {[0, 1, 2].map((n) => (
        <li key={n} className="flex items-center justify-between gap-3 py-2">
          <div className="grid gap-0.5">
            <Bar className="h-5 w-40" />
            <Bar className="h-5 w-24" />
          </div>
          <Bar className="h-6 w-20" />
        </li>
      ))}
    </ul>
  </div>
)

/** While the next page loads, `busy` keeps the previous rows and the pager mounted, so nothing shifts and focus stays on the pressed button. */
function PurchaseList({ data, meta, busy, onPage }: { data: AdminOrderRow[]; meta: AdminOrdersPage['meta']; busy?: boolean; onPage: (page: number) => void }) {
  return (
    <div aria-busy={busy} className={busy ? 'opacity-60' : undefined}>
      <ol aria-label="Purchases, newest first" className="divide-y divide-line border-y border-line">
        {data.map((order) => (
          <li key={order.id} className="flex items-center justify-between gap-3 py-2 text-left">
            <div className="grid min-w-0 gap-0.5">
              <p className="text-sm text-fg-muted tabular-nums">
                <time dateTime={order.placedAt}>{formatPlacedAt(order.placedAt)}</time>
                <span className="font-mono"> · {order.orderNumber}</span>
              </p>
              <div className="flex flex-wrap gap-1">
                <OrderPills status={order.status} paymentStatus={order.paymentStatus} />
              </div>
            </div>
            <p className="font-ui shrink-0 text-right text-base text-fg tabular-nums">{formatPeso(order.total)}</p>
          </li>
        ))}
      </ol>
      {meta.totalPages > 1 && (
        <Pagination large page={meta.page} pageCount={meta.totalPages} from={(meta.page - 1) * meta.limit + 1} to={(meta.page - 1) * meta.limit + data.length} total={meta.total} onPage={onPage} />
      )}
    </div>
  )
}

/** A customer's purchase history and what they have spent. Each part loads, fails and retries on its own. */
export function CustomerPurchases({ id }: { id: string }) {
  const [page, setPage] = useState(1)
  const summary = useSection(useCallback((options) => fetchUserOrderSummary(id, options), [id]))
  const list = useSection(useCallback((options) => fetchUserOrders(id, { page, limit: LIMIT }, options), [id, page]))

  return (
    <section aria-labelledby="purchases-heading" className="grid gap-3">
      <h3 id="purchases-heading" className="text-base font-semibold text-fg">
        Purchases
      </h3>
      <SectionBody section={summary} what="the total spent" skeleton={SummarySkeleton}>
        {({ totalSpent, totalOrders }) => (
          <div>
            <p className="flex items-baseline justify-between gap-3 text-base text-fg">
              <span className="text-fg-muted">Total spent</span>
              <span className="font-ui text-right font-semibold tabular-nums">{formatPeso(totalSpent)}</span>
            </p>
            <p className="text-sm text-fg-muted tabular-nums">
              {totalOrders} {totalOrders === 1 ? 'order' : 'orders'}. Paid orders, not counting cancelled or refunded.
            </p>
          </div>
        )}
      </SectionBody>
      <SectionBody section={list} what="the purchases" skeleton={list.previous?.data.length ? <PurchaseList data={list.previous.data} meta={list.previous.meta} busy onPage={setPage} /> : ListSkeleton}>
        {({ data, meta }) => (data.length === 0 ? <EmptyNote>No purchases yet. Orders this customer places in the shop show here.</EmptyNote> : <PurchaseList data={data} meta={meta} onPage={setPage} />)}
      </SectionBody>
    </section>
  )
}
