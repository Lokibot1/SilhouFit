import type { AdminTransactionMetrics } from '../../../service/adminTransactionsApi'
import { formatPesoWhole } from '../../../utils/format'
import { BanknoteIcon, BoxIcon, CartArrowIcon, HashIcon } from '../../form/icons'
import { Tooltip } from '../../ui/Tooltip'
import { TrendPill } from '../StatCards'
import { STAT_TONE, type StatTone } from '../StaffSkeleton'
import { TOTALS_FIRST_TILE, TOTALS_GRID, TOTALS_TILE, TOTALS_WRAP } from './layout'

const count = (n: number) => n.toLocaleString('en-US')

function Tile({ label, hint, value, note, icon: Icon, tone, trend }: { label: string; hint?: string; value: string; note?: string; icon: typeof BoxIcon; tone: StatTone; trend?: { change: number | null | undefined } }) {
  return (
    <div className={trend ? `${TOTALS_TILE} ${TOTALS_FIRST_TILE}` : TOTALS_TILE}>
      <span aria-hidden="true" className={`absolute top-3 right-3 flex size-8 items-center justify-center rounded-xl @sm:right-4 ${STAT_TONE[tone]}`}>
        <Icon size={20} />
      </span>
      <div className="min-w-0 pr-10">
        <dt className="text-sm font-medium text-fg-muted">
          {hint ? (
            <Tooltip label={hint} wrap className="max-w-full">
              <span tabIndex={0} className="truncate rounded-sm">
                {label}
              </span>
            </Tooltip>
          ) : (
            label
          )}
        </dt>
        <dd className="display truncate text-xl leading-7 text-fg tabular-nums">{value}</dd>
        {note && <dd className="text-xs leading-4 text-fg-muted">{note}</dd>}
      </div>
      {trend && (
        <dd className="mt-1 flex h-5 items-center">
          <TrendPill change={trend.change} label="this month" />
        </dd>
      )}
    </div>
  )
}

const PAID_HINT = 'Volumes count paid payments only, so failed, pending and refunded payments are left out. All of these totals ignore the filters.'

/** The refund counts the API adds to the metrics; none of the tiles has room for them, so they sit in the Transactions tooltip (left out for an older API). */
function refundHint({ partiallyRefundedCount, pendingRefundCount, manualActionRefundCount }: AdminTransactionMetrics) {
  if (partiallyRefundedCount === undefined || pendingRefundCount === undefined || manualActionRefundCount === undefined) return undefined
  return `${count(partiallyRefundedCount)} partly refunded · ${count(pendingRefundCount)} refunds pending · ${count(manualActionRefundCount)} refunds need manual action`
}

/** Every payment the API holds, whatever the list is filtered to. Gross, fees and net are of the paid ones only. */
export function TransactionTotals({ metrics, stale, trend }: { metrics: AdminTransactionMetrics; stale: boolean; trend: number | null | undefined }) {
  return (
    <div className={TOTALS_WRAP}>
      <dl aria-label="Totals across all transactions" aria-busy={stale} className={`${TOTALS_GRID} transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
        <Tile label="Transactions" hint={refundHint(metrics)} value={count(metrics.totalTransactions)} note={`${count(metrics.pendingCount)} pending · ${count(metrics.failedCount)} failed`} icon={BoxIcon} tone="violet" trend={{ change: trend }} />
        <Tile label="Paid volume" hint={PAID_HINT} value={formatPesoWhole(metrics.totalGrossVolume)} note={`${count(metrics.paidCount)} paid · ${count(metrics.refundedCount)} refunded`} icon={BanknoteIcon} tone="success" />
        <Tile label="Fees" value={formatPesoWhole(metrics.totalFeeVolume)} note="Paid payments only" icon={HashIcon} tone="info" />
        <Tile label="Net" value={formatPesoWhole(metrics.totalNetVolume)} note="Paid payments only" icon={CartArrowIcon} tone="teal" />
      </dl>
    </div>
  )
}
