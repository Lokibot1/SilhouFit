import type { TransactionSummary } from '../../../service/fetchTransactions'
import { formatPesoWhole } from '../../../utils/format'
import { TOTALS_GRID, TOTALS_TILE, TOTALS_WRAP } from './layout'

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={TOTALS_TILE}>
      <dt className="truncate text-sm font-medium text-fg-muted">{label}</dt>
      <dd className="display truncate text-xl leading-7 text-fg tabular-nums">{value}</dd>
      {note && <dd className="truncate text-xs leading-4 text-fg-muted">{note}</dd>}
    </div>
  )
}

/** The orders the filters match, and the sales, VAT and average order of those not returned (returned orders are refunded in full), not just this page. */
export function TransactionTotals({ summary, stale }: { summary: TransactionSummary; stale: boolean }) {
  const kept = summary.count - summary.returnedCount
  return (
    <div className={TOTALS_WRAP}>
      <dl aria-label="Totals for the matching transactions" aria-busy={stale} className={`${TOTALS_GRID} transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
        <Tile label="Orders" value={summary.count.toLocaleString('en-US')} note={summary.returnedCount > 0 ? `${summary.returnedCount.toLocaleString('en-US')} returned` : undefined} />
        <Tile label="Gross sales" value={formatPesoWhole(summary.gross)} />
        <Tile label="VAT (12%)" value={formatPesoWhole(summary.vat)} />
        <Tile label="Avg. order" value={formatPesoWhole(kept > 0 ? summary.gross / kept : 0)} />
      </dl>
    </div>
  )
}
