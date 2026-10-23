import type { CSSProperties } from 'react'
import type { TransactionListItem } from '../../../service/fetchTransactions'
import { formatPeso, itemsLabel } from '../../../utils/format'
import { openRow } from '../inventory/InventoryParts'
import { CARD_ROW } from '../inventory/layout'
import { TransactionCardSkeletonRows } from '../TransactionsSkeleton'
import { PlacedAt, ReturnedBadge } from './TransactionParts'

interface TransactionCardsProps {
  rows: TransactionListItem[] | null
  skeletonRows: number
  stale: boolean
  onOpen: (transaction: TransactionListItem) => void
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
                <span className="block truncate font-mono text-base font-semibold text-fg">{transaction.orderNo}</span>
                <span className="flex items-center gap-2">
                    <span className="block min-w-0 truncate text-sm text-fg-muted">{transaction.customerName}</span>
                    {transaction.returnedAt && <ReturnedBadge />}
                  </span>
              </button>
              <p className="shrink-0 text-base font-semibold whitespace-nowrap text-fg tabular-nums">{formatPeso(transaction.total)}</p>
            </div>
            <p className="flex flex-wrap gap-x-3 text-sm text-fg-muted">
              <PlacedAt iso={transaction.placedAt} />
              <span className="whitespace-nowrap tabular-nums">{itemsLabel(transaction.itemCount)}</span>
            </p>
          </li>
        ))
      )}
    </ul>
  )
}
