import { useCallback } from 'react'
import { useSection } from '../../../hooks/useSection'
import { fetchAdminOrderMetrics, type AdminOrderMetrics as Metrics } from '../../../service/adminOrdersApi'
import type { RequestOptions } from '../../../service/simulateRequest'
import { formatPesoWhole } from '../../../utils/format'
import { SectionError } from '../StaffSection'
import { TOTALS_TILE, TOTALS_WRAP } from '../transactions/layout'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

// Five tiles: two across on a phone (the last one spans), three from @lg, five from @4xl of the page's width.
// Taller than the shared tile so a label can take two lines at 320px without moving anything.
const TILE = `${TOTALS_TILE} h-[6.25rem]!`
const GRID = 'grid grid-cols-2 gap-2 @lg:grid-cols-3 @lg:gap-3 @4xl:grid-cols-5 [&>*:last-child]:col-span-2 @lg:[&>*:last-child]:col-span-1'

const tiles = (m: Metrics): [string, string][] => {
  const count = (n: number) => n.toLocaleString('en-US')
  return [
    ['Awaiting payment', count(m.pendingPaymentCount)],
    ['Preparing', count(m.processingCount)],
    ['On the way', count(m.dispatchedCount)],
    ['Delivered today', count(m.deliveredTodayCount)],
    ['Revenue', formatPesoWhole(m.totalRevenue)],
  ]
}

/** The counts across every order, whatever the list below is filtered to. `version` changes whenever an order does, so they read again. */
export function AdminOrderMetrics({ version }: { version: number }) {
  const load = useCallback(
    (options: RequestOptions) => fetchAdminOrderMetrics(options),
    // A new version is a new request, though it is not read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )
  const { state, previous, retry } = useSection(load)
  const metrics = state.status === 'success' ? state.data : previous

  return (
    <div className={TOTALS_WRAP}>
      {state.status === 'error' && (
        <div className="mb-3 rounded-xl border border-line bg-canvas-sub p-3">
          <SectionError what="the order counts" kind={state.kind} onRetry={retry} />
        </div>
      )}
      {metrics ? (
        <dl aria-label="Order counts across all orders" aria-busy={state.status === 'loading'} className={`${GRID} transition-opacity duration-150 ${state.status === 'loading' ? 'opacity-60' : ''}`}>
          {tiles(metrics).map(([label, value]) => (
            <div key={label} className={TILE}>
              <dt className="line-clamp-2 min-h-8 text-sm leading-4 font-medium text-fg-muted">{label}</dt>
              <dd className="display truncate text-xl leading-7 text-fg tabular-nums">{value}</dd>
              <dd className="truncate text-xs leading-4 text-fg-muted">All orders</dd>
            </div>
          ))}
        </dl>
      ) : (
        state.status === 'loading' && (
          <div role="status" aria-label="Loading order counts" className={`${GRID} animate-pulse`}>
            {[0, 1, 2, 3, 4].map((n) => (
              <div key={n} className={TILE}>
                <Bar className="h-8 w-24" />
                <Bar className="mt-1.5 h-5 w-16" />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
