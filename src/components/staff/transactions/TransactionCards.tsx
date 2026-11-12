import type { CSSProperties } from 'react'
import type { AdminTransactionRow } from '../../../service/adminTransactionsApi'
import { formatPeso } from '../../../utils/format'
import { methodLabel } from '../../../utils/orders'
import { openRow } from '../inventory/InventoryParts'
import { CARD_ROW } from '../inventory/layout'
import { TransactionCardSkeletonRows } from '../TransactionsSkeleton'
import { PaymentPill } from '../orders/OrderPills'
import { PlacedAt } from './TransactionParts'

interface TransactionCardsProps {
  rows: AdminTransactionRow[] | null
  skeletonRows: number
  stale: boolean
  onOpen: (transaction: AdminTransactionRow) => void
}

/** The list shown where the card is too narrow for the table. Sorting is the toolbar's Sort by select. */
export function TransactionCards({ rows, skeletonRows, stale, onOpen }: TransactionCardsProps) {
  return (
    <ul
      aria-busy={rows === null || stale}
      aria-label="Transactions"
      className={`divide-y divide-line border-y border-line @4xl:hidden transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}
    >
      {rows === null ? (
        <TransactionCardSkeletonRows count={skeletonRows} />
      ) : (
        rows.map((transaction, index) => (
          <li
            key={transaction.id}
            data-transaction={transaction.id}
            onClick={(event) => openRow(event, () => onOpen(transaction))}
            style={{ '--i': index } as CSSProperties}
            className={`${CARD_ROW} enter-row flex cursor-pointer flex-col justify-center hover:bg-line/40`}
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                aria-haspopup="dialog"
                className="block min-h-11 min-w-0 flex-1 cursor-pointer rounded-xl text-left hover:text-chrome-strong"
              >
                <span className="block font-mono text-base font-semibold text-fg [overflow-wrap:anywhere]">{transaction.orderNumber}</span>
                <span className="block truncate text-sm text-fg-muted">{transaction.customerName}</span>
              </button>
              <p className="shrink-0 text-base font-semibold whitespace-nowrap text-fg tabular-nums">{formatPeso(transaction.amount)}</p>
            </div>
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-fg-muted">
              <PaymentPill status={transaction.status} />
              <PlacedAt iso={transaction.at} />
              <span className="whitespace-nowrap">{methodLabel(transaction.method)}</span>
            </p>
          </li>
        ))
      )}
    </ul>
  )
}
