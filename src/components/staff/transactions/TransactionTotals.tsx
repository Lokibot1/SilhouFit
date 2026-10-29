import type { TransactionSummary } from '../../../service/fetchTransactions'
import { formatPesoWhole } from '../../../utils/format'
import { BanknoteIcon, BoxIcon, CartArrowIcon, HashIcon } from '../../form/icons'
import { STAT_TONE, type StatTone } from '../StaffSkeleton'
import { TOTALS_GRID, TOTALS_TILE, TOTALS_WRAP } from './layout'

function Tile({ label, value, note, icon: Icon, tone }: { label: string; value: string; note?: string; icon: typeof BoxIcon; tone: StatTone }) {
  return (
    <div className={TOTALS_TILE}>
      <span aria-hidden="true" className={`absolute top-3 right-3 flex size-8 items-center justify-center rounded-xl @sm:right-4 ${STAT_TONE[tone]}`}>
        <Icon size={20} />
      </span>
      <div className="min-w-0 pr-10">
        <dt className="truncate text-sm font-medium text-fg-muted">{label}</dt>
        <dd className="display truncate text-xl leading-7 text-fg tabular-nums">{value}</dd>
        {note && <dd className="truncate text-xs leading-4 text-fg-muted">{note}</dd>}
      </div>
    </div>
  )
}

/** The orders the filters match, and the sales, VAT and average order of those not returned (returned orders are refunded in full), not just this page. */
export function TransactionTotals({ summary, stale }: { summary: TransactionSummary; stale: boolean }) {
  const kept = summary.count - summary.returnedCount
  return (
    <div className={TOTALS_WRAP}>
      <dl aria-label="Totals for the matching transactions" aria-busy={stale} className={`${TOTALS_GRID} transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
        <Tile label="Orders" value={summary.count.toLocaleString('en-US')} note={summary.returnedCount > 0 ? `${summary.returnedCount.toLocaleString('en-US')} returned` : undefined} icon={BoxIcon} tone="violet" />
        <Tile label="Gross sales" value={formatPesoWhole(summary.gross)} icon={BanknoteIcon} tone="success" />
        <Tile label="VAT (12%)" value={formatPesoWhole(summary.vat)} icon={HashIcon} tone="info" />
        <Tile label="Avg. order" value={formatPesoWhole(kept > 0 ? summary.gross / kept : 0)} icon={CartArrowIcon} tone="teal" />
      </dl>
    </div>
  )
}
