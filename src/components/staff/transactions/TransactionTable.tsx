import type { CSSProperties } from 'react'
import type { TransactionListItem } from '../../../service/fetchTransactions'
import { formatPeso } from '../../../utils/format'
import type { TransactionDir, TransactionSort } from '../../../utils/transactionQuery'
import { openRow } from '../inventory/InventoryParts'
import { TABLE_ROW, TD, TH } from '../inventory/layout'
import { SortHeader } from '../inventory/SortHeader'
import { TransactionTableSkeletonRows } from '../TransactionsSkeleton'
import { TransactionColgroup } from './layout'
import { PlacedAt } from './TransactionParts'

interface TransactionTableProps {
  sorted: { sort: TransactionSort; dir: TransactionDir }
  onSort: (column: TransactionSort) => void
  /** Null while the first page loads: the body is then skeleton rows. */
  rows: TransactionListItem[] | null
  skeletonRows: number
  /** The rows shown are from the previous request. */
  stale: boolean
  onOpen: (transaction: TransactionListItem) => void
}

export function TransactionTable({ sorted, onSort, rows, skeletonRows, stale, onOpen }: TransactionTableProps) {
  return (
    <table aria-busy={rows === null || stale} className="hidden w-full table-fixed border-separate border-spacing-0 @4xl:table">
      <caption className="sr-only">Transactions with order number, customer, date and time, items and total</caption>
      <TransactionColgroup />
      <thead>
        <tr>
          <th scope="col" className={TH}>
            Order
          </th>
          <SortHeader label="Date and time" column="date" active={sorted} onSort={onSort} />
          <th scope="col" className={TH}>
            Items
          </th>
          <SortHeader label="Total" column="total" active={sorted} onSort={onSort} />
        </tr>
      </thead>
      <tbody className={`transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
        {rows === null ? (
          <TransactionTableSkeletonRows count={skeletonRows} />
        ) : (
          rows.map((transaction, index) => (
            <tr
              key={transaction.id}
              data-transaction={transaction.id}
              onClick={(event) => openRow(event, () => onOpen(transaction))}
              style={{ '--i': index } as CSSProperties}
              className={`${TABLE_ROW} enter-row cursor-pointer hover:bg-line/40`}
            >
              <td className={TD}>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  className="flex min-h-11 w-full min-w-0 cursor-pointer flex-col justify-center rounded-xl text-left hover:text-chrome-strong"
                >
                  <span className="block truncate font-mono text-base font-semibold text-fg">{transaction.orderNo}</span>
                  <span className="block truncate text-sm text-fg-muted">{transaction.customerName}</span>
                </button>
              </td>
              <td className={`${TD} text-sm text-fg-muted`}>
                <PlacedAt iso={transaction.placedAt} />
              </td>
              <td className={`${TD} text-sm text-fg tabular-nums`}>{transaction.itemCount}</td>
              <td className={`${TD} text-sm whitespace-nowrap text-fg tabular-nums`}>{formatPeso(transaction.total)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}
