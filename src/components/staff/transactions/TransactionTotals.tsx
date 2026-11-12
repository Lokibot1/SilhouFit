import type { AdminTransactionMetrics } from '../../../service/adminTransactionsApi'
import { formatPesoWhole } from '../../../utils/format'
import { BanknoteIcon, BoxIcon, CartArrowIcon, HashIcon } from '../../form/icons'
import { Tooltip } from '../../ui/Tooltip'
import { STAT_TONE, type StatTone } from '../StaffSkeleton'
import { TOTALS_GRID, TOTALS_TILE, TOTALS_WRAP } from './layout'

const count = (n: number) => n.toLocaleString('en-US')

function Tile({ label, hint, value, note, icon: Icon, tone }: { label: string; hint?: string; value: string; note?: string; icon: typeof BoxIcon; tone: StatTone }) {
  return (
    <div className={TOTALS_TILE}>
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
    </div>
  )
}

const PAID_HINT = 'Volumes count paid payments only, so failed, pending and refunded payments are left out. All of these totals ignore the filters.'

/** Every payment the API holds, whatever the list is filtered to. Gross, fees and net are of the paid ones only. */
export function TransactionTotals({ metrics, stale }: { metrics: AdminTransactionMetrics; stale: boolean }) {
  return (
    <div className={TOTALS_WRAP}>
      <dl aria-label="Totals across all transactions" aria-busy={stale} className={`${TOTALS_GRID} transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
        <Tile label="Transactions" value={count(metrics.totalTransactions)} note={`${count(metrics.pendingCount)} pending · ${count(metrics.failedCount)} failed`} icon={BoxIcon} tone="violet" />
        <Tile label="Paid volume" hint={PAID_HINT} value={formatPesoWhole(metrics.totalGrossVolume)} note={`${count(metrics.paidCount)} paid · ${count(metrics.refundedCount)} refunded`} icon={BanknoteIcon} tone="success" />
        <Tile label="Fees" value={formatPesoWhole(metrics.totalFeeVolume)} note="Paid payments only" icon={HashIcon} tone="info" />
        <Tile label="Net" value={formatPesoWhole(metrics.totalNetVolume)} note="Paid payments only" icon={CartArrowIcon} tone="teal" />
      </dl>
    </div>
  )
}
