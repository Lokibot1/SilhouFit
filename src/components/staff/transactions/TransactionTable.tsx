import type { CSSProperties } from 'react'
import type { AdminTransactionRow } from '../../../service/adminTransactionsApi'
import { formatPeso } from '../../../utils/format'
import { methodLabel } from '../../../utils/orders'
import { providerLabel, type TransactionDir, type TransactionSort } from '../../../utils/transactionQuery'
import { openRow } from '../inventory/InventoryParts'
import { TABLE_ROW, TD, TH } from '../inventory/layout'
import { SortHeader } from '../inventory/SortHeader'
import { TransactionTableSkeletonRows } from '../TransactionsSkeleton'
import { PaymentPill } from '../orders/OrderPills'
import { TransactionColgroup } from './layout'
import { PlacedAt } from './TransactionParts'

interface TransactionTableProps {
  sorted: { sort: TransactionSort; dir: TransactionDir }
  onSort: (column: TransactionSort) => void
  /** Null while the first page loads: the body is then skeleton rows. */
  rows: AdminTransactionRow[] | null
  skeletonRows: number
  /** The rows shown are from the previous request. */
  stale: boolean
  onOpen: (transaction: AdminTransactionRow) => void
}

export function TransactionTable({ sorted, onSort, rows, skeletonRows, stale, onOpen }: TransactionTableProps) {
  return (
    <table aria-busy={rows === null || stale} className="hidden w-full table-fixed border-separate border-spacing-0 @4xl:table">
      <caption className="sr-only">Transactions with order number, customer name, payment method, status, date and time, provider and amount</caption>
      <TransactionColgroup />
      <thead>
        <tr>
          <th scope="col" className={TH}>
            Order
          </th>
          <th scope="col" className={TH}>
            Customer
          </th>
          <th scope="col" className={TH}>
            Method
          </th>
          <th scope="col" className={TH}>
            Status
          </th>
          <SortHeader label="Date and time" column="date" active={sorted} onSort={onSort} />
          <th scope="col" className={TH}>
            Provider
          </th>
          <SortHeader label="Amount" column="total" active={sorted} onSort={onSort} right />
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
                  className="flex min-h-11 w-full min-w-0 cursor-pointer items-center rounded-xl text-left hover:text-chrome-strong"
                >
                  <span className="block truncate font-mono text-base font-semibold text-fg">{transaction.orderNumber}</span>
                </button>
              </td>
              <td className={`${TD} text-sm text-fg`}>
                <span className="block truncate">{transaction.customerName}</span>
              </td>
              <td className={`${TD} text-sm text-fg`}>{methodLabel(transaction.method)}</td>
              <td className={TD}>
                <PaymentPill status={transaction.status} />
              </td>
              <td className={`${TD} text-sm text-fg-muted`}>
                <PlacedAt iso={transaction.at} />
              </td>
              <td className={`${TD} text-sm text-fg`}>{providerLabel(transaction.provider)}</td>
              <td className={`${TD} text-right text-sm whitespace-nowrap text-fg tabular-nums`}>{formatPeso(transaction.amount)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}
