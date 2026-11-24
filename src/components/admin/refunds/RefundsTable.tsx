import type { CSSProperties } from 'react'
import type { RefundsList } from '../../../hooks/useRefunds'
import { REFUND_REASON_LABELS, REFUND_STATUS_LABELS, type Refund, type RefundStatus } from '../../../service/refunds'
import { formatOrderTime, formatPeso } from '../../../utils/format'
import { ChevronLeftIcon, XIcon } from '../../form/icons'
import { Pagination } from '../../shop/Pagination'
import { openRow } from '../../staff/inventory/InventoryParts'
import { PAGER_FOOTER, PAGER_PAGINATION, TABLE_ROW, TD, TH } from '../../staff/inventory/layout'
import { SortHeader } from '../../staff/inventory/SortHeader'
import { SectionError } from '../../staff/StaffSection'
import { PAGER_ROWS } from '../../staff/transactions/layout'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { REFUND_COLUMNS, wideCell } from './refundColumns'
import { REFUND_CARD_LINE, REFUND_CARD_ROW, REFUND_CARD_TALL, RefundCardSkeletonRows, RefundPagerSkeleton, RefundTableSkeletonRows } from './RefundsSkeleton'

const DOT: Record<RefundStatus, string> = {
  REQUESTED: 'border-2 border-fg',
  PROCESSING: 'bg-info',
  SUCCEEDED: 'bg-success',
  FAILED: 'bg-danger',
  REQUIRES_MANUAL_ACTION: 'bg-warning',
  CANCELLED: 'bg-fg-muted',
}

/** The status in words and a dot (ringed or filled), so it never rests on colour alone. */
export function RefundStatusBadge({ status }: { status: RefundStatus }) {
  return (
    <span className="font-ui inline-flex h-6 shrink-0 items-center gap-1.5 justify-self-start rounded-full border border-line-strong px-2 text-sm whitespace-nowrap text-fg">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${DOT[status]}`} />
      {REFUND_STATUS_LABELS[status]}
    </span>
  )
}

const attempts = (count: number) => `${count} ${count === 1 ? 'attempt' : 'attempts'}`
const NO_ORDER = 'No order'

interface RefundsTableProps {
  list: RefundsList
  onOpen: (row: Refund) => void
}

/** The refunds: the table from @4xl of its panel and cards below, with the loading, error and empty states and the pager. */
export function RefundsTable({ list, onOpen }: RefundsTableProps) {
  const { state, result, stale, retry, sorted, sortBy, page, setPage, per, filtered, clear } = list
  // An empty answer to an earlier view is not shown while the next one loads (it would read as "none yet" after Clear filters).
  const rows = result && !(stale && result.data.length === 0) ? result.data : null

  if (state.status === 'error' && !result) return <SectionError what="the refunds" kind={state.kind} retryAfterMs={state.retryAfterMs} onRetry={retry} />

  if (result && result.data.length === 0 && !stale) {
    return (
      <div>
        {result.meta.total > 0 ? (
          <>
            <p className="text-base text-fg-muted">There are no refunds on page {page}.</p>
            <button type="button" onClick={() => setPage(1)} className={`${SECONDARY_BUTTON} mt-3`}>
              <ChevronLeftIcon />
              Go to the first page
            </button>
          </>
        ) : filtered ? (
          <>
            <p className="text-base font-semibold text-fg">No refunds match</p>
            <p className="mt-1 text-base text-fg-muted">Check the spelling, or clear the search and status filter and try again.</p>
            <button type="button" onClick={clear} className={`${SECONDARY_BUTTON} mt-3`}>
              <XIcon />
              Clear filters
            </button>
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-fg">No refunds yet</p>
            <p className="mt-1 text-base text-fg-muted">Late payments on cancelled orders are refunded automatically and appear here.</p>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      {state.status === 'error' && result && (
        <div className="mb-3 rounded-xl border border-line bg-canvas-sub p-3">
          <SectionError what="the latest refunds" kind={state.kind} retryAfterMs={state.retryAfterMs} onRetry={retry} />
          <p className="mt-3 text-sm text-fg-muted">The list below is from before your last change.</p>
        </div>
      )}
      <p role="status" className="sr-only">
        {state.status === 'loading' ? 'Loading refunds' : ''}
      </p>
      <table aria-busy={rows === null || stale} className="hidden w-full border-separate border-spacing-0 whitespace-nowrap @4xl:table">
        <caption className="sr-only">Refunds with order, customer, reason, amount, status, date and attempts</caption>
        <colgroup>
          {REFUND_COLUMNS.map((column) => (
            <col key={column.key} className={'wide' in column ? 'hidden @7xl:table-column' : ''} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH.replace('text-left', 'text-right')}>
              <span aria-hidden="true">#</span>
              <span className="sr-only">Row number</span>
            </th>
            <th scope="col" className={TH}>
              Order
            </th>
            <th scope="col" className={TH}>
              Customer
            </th>
            <th scope="col" className={TH}>
              Reason
            </th>
            <SortHeader label="Amount" column="amount" active={sorted} onSort={sortBy} right />
            <th scope="col" className={TH}>
              Status
            </th>
            <SortHeader label="Created" column="createdAt" active={sorted} onSort={sortBy} />
            <th scope="col" className={`${TH.replace('text-left', 'text-right')} ${wideCell('attempts')}`}>
              Attempts
            </th>
          </tr>
        </thead>
        <tbody className={`transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
          {rows === null ? (
            <RefundTableSkeletonRows count={list.skeletonRows} />
          ) : (
            rows.map((row, index) => (
              <tr key={row.id} onClick={(event) => openRow(event, () => onOpen(row))} style={{ '--i': index } as CSSProperties} className={`${TABLE_ROW} enter-row cursor-pointer hover:bg-line/40`}>
                <td className={`${TD} text-right text-sm text-fg-muted tabular-nums`}>{(page - 1) * per + index + 1}</td>
                <td className={TD}>
                  <button type="button" aria-haspopup="dialog" className="flex min-h-11 w-full min-w-0 cursor-pointer items-center rounded-xl text-left hover:text-chrome-strong">
                    <span className="block truncate font-mono text-sm font-semibold text-fg">{row.orderNumber ?? NO_ORDER}</span>
                  </button>
                </td>
                <td className={`${TD} text-sm text-fg`}>
                  <span className="block max-w-40 truncate">{row.customerName}</span>
                </td>
                <td className={`${TD} text-sm text-fg`}>
                  <span className="block max-w-48 truncate">{REFUND_REASON_LABELS[row.reason]}</span>
                </td>
                <td className={`${TD} text-right text-sm whitespace-nowrap text-fg tabular-nums`}>{formatPeso(row.amount)}</td>
                <td className={TD}>
                  <RefundStatusBadge status={row.status} />
                </td>
                <td className={`${TD} text-sm text-fg-muted`}>
                  <time dateTime={row.createdAt} className="block">
                    {formatOrderTime(row.createdAt)}
                  </time>
                </td>
                <td className={`${TD} ${wideCell('attempts')} text-right text-sm text-fg-muted tabular-nums`}>{row.attempts}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <ul aria-busy={rows === null || stale} aria-label="Refunds" className={`divide-y divide-line border-y border-line transition-opacity duration-150 @4xl:hidden ${stale ? 'opacity-60' : ''}`}>
        {rows === null ? (
          <RefundCardSkeletonRows count={list.skeletonRows} />
        ) : (
          rows.map((row, index) => (
            <li
              key={row.id}
              onClick={(event) => openRow(event, () => onOpen(row))}
              style={{ '--i': index } as CSSProperties}
              className={`${REFUND_CARD_ROW} enter-row flex cursor-pointer flex-col justify-center py-2 hover:bg-line/40`}
            >
              <div className={`flex ${REFUND_CARD_TALL} items-center justify-between gap-3`}>
                <button type="button" aria-haspopup="dialog" className="flex min-h-11 min-w-0 cursor-pointer items-center rounded-xl text-left hover:text-chrome-strong">
                  <span className="block truncate font-mono text-base font-semibold text-fg">{row.orderNumber ?? NO_ORDER}</span>
                </button>
                <RefundStatusBadge status={row.status} />
              </div>
              <p className={`${REFUND_CARD_LINE} truncate text-base text-fg`}>{row.customerName}</p>
              <p className={`${REFUND_CARD_LINE} truncate text-base text-fg-muted`}>{REFUND_REASON_LABELS[row.reason]}</p>
              <p className={`${REFUND_CARD_LINE} truncate text-base text-fg-muted`}>
                <time dateTime={row.createdAt}>{formatOrderTime(row.createdAt)}</time>
              </p>
              <div className={`flex ${REFUND_CARD_TALL} items-center justify-between gap-3`}>
                <span className="truncate text-base text-fg-muted tabular-nums">{attempts(row.attempts)}</span>
                <span className="shrink-0 text-base font-semibold text-fg tabular-nums">{formatPeso(row.amount)}</span>
              </div>
            </li>
          ))
        )}
      </ul>
      {rows && result ? (
        <div className={PAGER_FOOTER}>
          <div className={`${PAGER_PAGINATION} ${PAGER_ROWS}`}>
            <Pagination
              page={page}
              pageCount={Math.max(1, result.meta.totalPages)}
              from={(page - 1) * per + 1}
              to={Math.min(page * per, result.meta.total)}
              total={result.meta.total}
              onPage={setPage}
            />
          </div>
        </div>
      ) : (
        <RefundPagerSkeleton />
      )}
    </>
  )
}
