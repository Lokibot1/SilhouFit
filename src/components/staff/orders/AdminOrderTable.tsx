import type { CSSProperties } from 'react'
import type { AdminOrderRow } from '../../../service/adminOrdersApi'
import { formatPeso, formatPlacedAt } from '../../../utils/format'
import { openRow } from '../inventory/InventoryParts'
import { TABLE_HEAD_ROW, TABLE_ROW, TD, TH } from '../inventory/layout'
import { OrderPills } from './OrderPills'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

// A card holds the number and customer, the two chips and the time, so it is taller than the inventory's card row.
const CARD = 'enter-row flex h-28 flex-col justify-center'

// The table is `table-fixed`: Order, Customer, Status (both chips), Placed, Products and Total. Shares of the table.
const COLUMNS = ['w-[22%]', 'w-[20%]', 'w-[17%]', 'w-[15%]', 'w-[11%]', 'w-[15%]']
const Colgroup = () => (
  <colgroup>
    {COLUMNS.map((width, n) => (
      <col key={n} className={width} />
    ))}
  </colgroup>
)

const productsLabel = (count: number) => `${count} ${count === 1 ? 'product' : 'products'}`

function Time({ iso }: { iso: string }) {
  return <time dateTime={iso}>{formatPlacedAt(iso)}</time>
}

interface ListProps {
  /** Null while the first page loads: the body is then skeleton rows. */
  rows: AdminOrderRow[] | null
  skeletonRows: number
  /** The rows shown are from the previous request. */
  stale: boolean
  /** The order open in the drawer. */
  activeId: string | null
  onOpen: (order: AdminOrderRow) => void
}

/** Newest first, as the API sends them: no column sorts. */
export function AdminOrderTable({ rows, skeletonRows, stale, activeId, onOpen }: ListProps) {
  return (
    <table aria-busy={rows === null || stale} className="hidden w-full table-fixed border-separate border-spacing-0 @4xl:table">
      <caption className="sr-only">Orders, newest first, with order number, customer, status, payment, date and time, products and total</caption>
      <Colgroup />
      <thead>
        <tr className={TABLE_HEAD_ROW}>
          {['Order', 'Customer', 'Status', 'Placed'].map((name) => (
            <th key={name} scope="col" className={TH}>
              {name}
            </th>
          ))}
          <th scope="col" className={`${TH} text-center!`}>
            Products
          </th>
          <th scope="col" className={`${TH} text-right!`}>
            Total
          </th>
        </tr>
      </thead>
      <tbody className={`transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
        {rows === null
          ? Array.from({ length: skeletonRows }, (_, n) => (
              <tr key={n} className={`${TABLE_ROW} animate-pulse`}>
                <td className={TD}>
                  <Bar className="h-5 w-36" />
                </td>
                <td className={TD}>
                  <Bar className="h-4 w-28" />
                  <Bar className="mt-1 h-4 w-32" />
                </td>
                <td className={TD}>
                  <Bar className="h-5 w-24" />
                  <Bar className="mt-1 h-5 w-24" />
                </td>
                <td className={TD}>
                  <Bar className="h-4 w-24" />
                </td>
                <td className={TD}>
                  <Bar className="ml-auto h-4 w-8" />
                </td>
                <td className={TD}>
                  <Bar className="ml-auto h-4 w-20" />
                </td>
              </tr>
            ))
          : rows.map((order, index) => (
              <tr
                key={order.id}
                data-order={order.id}
                onClick={(event) => openRow(event, () => onOpen(order))}
                style={{ '--i': index } as CSSProperties}
                className={`${TABLE_ROW} enter-row cursor-pointer ${order.id === activeId ? 'bg-line/60' : 'hover:bg-line/40'}`}
              >
                <td className={TD}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    className="flex min-h-11 w-full min-w-0 cursor-pointer items-center rounded-xl text-left hover:text-chrome-strong"
                  >
                    <span className="block truncate font-mono text-sm font-semibold text-fg">{order.orderNumber}</span>
                  </button>
                </td>
                <td className={TD}>
                  <span className="block truncate text-sm text-fg">{order.customerName}</span>
                  {order.customerEmail && <span className="block truncate text-xs text-fg-muted">{order.customerEmail}</span>}
                </td>
                <td className={TD}>
                  <div className="flex flex-col items-start gap-1">
                    <OrderPills status={order.status} paymentStatus={order.paymentStatus} />
                  </div>
                </td>
                <td className={`${TD} text-sm text-fg-muted`}>
                  <Time iso={order.placedAt} />
                </td>
                <td className={`${TD} text-center text-sm text-fg tabular-nums`}>{order.itemCount}</td>
                <td className={`${TD} text-right text-sm whitespace-nowrap text-fg tabular-nums`}>{formatPeso(order.total)}</td>
              </tr>
            ))}
      </tbody>
    </table>
  )
}

/** The list shown where the card is too narrow for the table. */
export function AdminOrderCards({ rows, skeletonRows, stale, activeId, onOpen }: ListProps) {
  return (
    <ul
      aria-busy={rows === null || stale}
      aria-label="Orders, newest first"
      className={`divide-y divide-line border-y border-line transition-opacity duration-150 @4xl:hidden ${stale ? 'opacity-60' : ''}`}
    >
      {rows === null
        ? Array.from({ length: skeletonRows }, (_, n) => (
            <li key={n} className={`${CARD} animate-pulse`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Bar className="h-5 w-40" />
                  <Bar className="mt-1 h-4 w-1/2" />
                </div>
                <Bar className="h-5 w-20" />
              </div>
              <div className="mt-1 flex gap-2">
                <Bar className="h-5 w-24" />
                <Bar className="h-5 w-24" />
              </div>
              <Bar className="mt-1 h-4 w-2/3" />
            </li>
          ))
        : rows.map((order, index) => (
            <li
              key={order.id}
              data-order={order.id}
              onClick={(event) => openRow(event, () => onOpen(order))}
              style={{ '--i': index } as CSSProperties}
              className={`${CARD} cursor-pointer ${order.id === activeId ? 'bg-line/60' : 'hover:bg-line/40'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <button type="button" aria-haspopup="dialog" className="block min-h-11 min-w-0 flex-1 cursor-pointer rounded-xl text-left hover:text-chrome-strong">
                  <span className="block truncate font-mono text-sm font-semibold text-fg">{order.orderNumber}</span>
                  <span className="block truncate text-sm text-fg-muted">{order.customerName}</span>
                </button>
                <p className="shrink-0 text-base font-semibold whitespace-nowrap text-fg tabular-nums">{formatPeso(order.total)}</p>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <OrderPills status={order.status} paymentStatus={order.paymentStatus} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-fg-muted">
                <Time iso={order.placedAt} />
                <span className="whitespace-nowrap tabular-nums">{productsLabel(order.itemCount)}</span>
              </p>
            </li>
          ))}
    </ul>
  )
}
