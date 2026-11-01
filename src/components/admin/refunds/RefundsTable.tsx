import type { CSSProperties, MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import type { RefundsList } from '../../../hooks/useRefunds'
import { REFUND_REASON_LABELS, type RefundRequest, type RefundSort, type RefundStatus } from '../../../service/refunds'
import { formatOrderTime, formatPeso } from '../../../utils/format'
import { ChevronDownIcon, ChevronUpIcon, SortIcon } from '../../form/icons'
import { Pagination } from '../../shop/Pagination'
import { openRow } from '../../staff/inventory/InventoryParts'
import { PAGER_FOOTER, PAGER_PAGINATION, TABLE_ROW, TD, TH } from '../../staff/inventory/layout'
import { SortHeader } from '../../staff/inventory/SortHeader'
import { SectionError } from '../../staff/StaffSection'
import { PAGER_ROWS } from '../../staff/transactions/layout'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Checkbox } from '../../ui/Checkbox'
import { refundColumns, wideCell, type RefundColumnKey } from './refundColumns'
import { REFUND_CARD_LINE, REFUND_CARD_ROW, REFUND_CARD_TALL, RefundCardSkeletonRows, RefundPagerSkeleton, RefundTableSkeletonRows } from './RefundsSkeleton'

const STATUS = {
  pending: { label: 'Pending', dot: 'border-2 border-fg' },
  approved: { label: 'Approved', dot: 'bg-success' },
  rejected: { label: 'Rejected', dot: 'bg-danger' },
} as const

/** The status in words and a dot (ringed or filled), so it never rests on colour alone. */
export function RefundStatusBadge({ status }: { status: RefundStatus }) {
  const { label, dot } = STATUS[status]
  return (
    <span className="font-ui inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-2 text-sm whitespace-nowrap text-fg">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

const stop = (event: MouseEvent) => event.stopPropagation()
const orderLink = (orderNo: string) => `/admin/transactions?q=${encodeURIComponent(orderNo)}`

/** SortHeader for a wide column: the same header, hidden until the panel is wide enough. */
function WideSortHeader({ label, column, active, onSort, cell }: { label: string; column: RefundSort; active: { sort: RefundSort; dir: 'asc' | 'desc' }; onSort: (column: RefundSort) => void; cell: RefundColumnKey }) {
  const on = active.sort === column
  const Arrow = !on ? SortIcon : active.dir === 'asc' ? ChevronUpIcon : ChevronDownIcon
  return (
    <th scope="col" aria-sort={on ? (active.dir === 'asc' ? 'ascending' : 'descending') : undefined} className={`${TH} ${wideCell(cell)}`}>
      <button type="button" onClick={() => onSort(column)} className="-mx-2 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-xl px-2 hover:text-chrome-strong">
        {label}
        <Arrow className={on ? 'text-fg' : 'text-fg-muted'} />
      </button>
    </th>
  )
}

interface RefundsTableProps {
  list: RefundsList
  /** Whether the checkboxes show: they stay hidden until the admin chooses to select requests. */
  selecting: boolean
  /** Ids of the pending requests ticked on this page. */
  selected: string[]
  onToggle: (id: string) => void
  onToggleAll: (ids: string[]) => void
  onOpen: (row: RefundRequest) => void
}

/** The requests: the table from @4xl of its panel and cards below, with the loading, error and empty states and the pager. */
export function RefundsTable({ list, selecting, selected, onToggle, onToggleAll, onOpen }: RefundsTableProps) {
  const { state, result, stale, retry, sorted, sortBy, page, setPage, per, filtered, clear, status, text } = list
  // An empty answer to an earlier view is not shown while the next one loads (it would read as "none yet" after Clear filters).
  const rows = result && !(stale && result.data.length === 0) ? result.data : null

  if (state.status === 'error' && !result) return <SectionError what="the refund requests" kind={state.kind} onRetry={retry} />

  if (result && result.data.length === 0 && !stale) {
    return (
      <div>
        {result.meta.total > 0 ? (
          <>
            <p className="text-base text-fg-muted">There are no refund requests on page {page}.</p>
            <button type="button" onClick={() => setPage(1)} className={`${SECONDARY_BUTTON} mt-3`}>
              Go to the first page
            </button>
          </>
        ) : filtered && status === 'pending' && !text.trim() ? (
          <>
            <p className="text-base font-semibold text-fg">No pending requests</p>
            <p className="mt-1 mb-3 text-base text-fg-muted">Nothing to review right now. New requests from customers and staff will show up here.</p>
            <button type="button" onClick={clear} className={SECONDARY_BUTTON}>
              Show all requests
            </button>
          </>
        ) : filtered ? (
          <>
            <p className="text-base font-semibold text-fg">No refund requests match</p>
            <p className="mt-1 text-base text-fg-muted">Check the spelling, or clear the search and status filter and try again.</p>
            <button type="button" onClick={clear} className={`${SECONDARY_BUTTON} mt-3`}>
              Clear filters
            </button>
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-fg">No refund requests yet</p>
            <p className="mt-1 text-base text-fg-muted">When a customer or a staff member asks for a refund, the request appears here for you to approve or reject.</p>
          </>
        )}
      </div>
    )
  }

  const pendingIds = (rows ?? []).filter((row) => row.status === 'pending').map((row) => row.id)
  const allTicked = pendingIds.length > 0 && pendingIds.every((id) => selected.includes(id))
  const tick = (row: RefundRequest) =>
    row.status === 'pending' && <Checkbox label={`Select ${row.requestNo}`} checked={selected.includes(row.id)} onChange={() => onToggle(row.id)} />

  return (
    <>
      {state.status === 'error' && result && (
        <div className="mb-3 rounded-xl border border-line bg-canvas-sub p-3">
          <SectionError what="the latest refund requests" kind={state.kind} onRetry={retry} />
          <p className="mt-3 text-sm text-fg-muted">The list below is from before your last change.</p>
        </div>
      )}
      <p role="status" className="sr-only">
        {state.status === 'loading' ? 'Loading refund requests' : ''}
      </p>
      <table aria-busy={rows === null || stale} className="hidden w-full border-separate border-spacing-0 whitespace-nowrap @4xl:table">
        <caption className="sr-only">Refund requests with request, order, customer, reason, amount, date, status and decision</caption>
        <colgroup>
          {refundColumns(selecting).map((column) => (
            <col key={column.key} className={'wide' in column ? 'hidden @7xl:table-column' : ''} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH.replace('text-left', 'text-right')}>
              <span aria-hidden="true">#</span>
              <span className="sr-only">Row number</span>
            </th>
            {selecting && (
              <th scope="col" className={TH}>
                <Checkbox label="Select all pending requests on this page" checked={allTicked} disabled={pendingIds.length === 0} onChange={() => onToggleAll(pendingIds)} />
              </th>
            )}
            <SortHeader label="Request" column="requestNo" active={sorted} onSort={sortBy} />
            <SortHeader label="Order" column="orderNo" active={sorted} onSort={sortBy} />
            <SortHeader label="Customer" column="customerName" active={sorted} onSort={sortBy} />
            <WideSortHeader label="Requested by" column="requestedBy" active={sorted} onSort={sortBy} cell="by" />
            <SortHeader label="Reason" column="reason" active={sorted} onSort={sortBy} />
            <SortHeader label="Amount" column="amount" active={sorted} onSort={sortBy} right />
            <SortHeader label="Requested at" column="requestedAt" active={sorted} onSort={sortBy} />
            <SortHeader label="Status" column="status" active={sorted} onSort={sortBy} />
            <WideSortHeader label="Decided" column="decidedAt" active={sorted} onSort={sortBy} cell="decided" />
          </tr>
        </thead>
        <tbody className={`transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
          {rows === null ? (
            <RefundTableSkeletonRows count={list.skeletonRows} selecting={selecting} />
          ) : (
            rows.map((row, index) => (
              <tr
                key={row.id}
                onClick={(event) => openRow(event, () => onOpen(row))}
                style={{ '--i': index } as CSSProperties}
                className={`${TABLE_ROW} enter-row cursor-pointer ${selected.includes(row.id) ? 'bg-fg/10' : 'hover:bg-line/40'}`}
              >
                <td className={`${TD} text-right text-sm text-fg-muted tabular-nums`}>{(page - 1) * per + index + 1}</td>
                {selecting && (
                  <td className={TD} onClick={stop}>
                    {tick(row)}
                  </td>
                )}
                <td className={TD}>
                  <button type="button" aria-haspopup="dialog" className="flex min-h-11 w-full min-w-0 cursor-pointer items-center rounded-xl text-left hover:text-chrome-strong">
                    <span className="block truncate font-mono text-sm font-semibold text-fg">{row.requestNo}</span>
                  </button>
                </td>
                <td className={TD} onClick={stop}>
                  <Link to={orderLink(row.orderNo)} className="flex min-h-11 min-w-0 items-center rounded-xl font-mono text-sm text-fg underline underline-offset-2 hover:text-chrome-strong">
                    <span className="truncate">{row.orderNo}</span>
                  </Link>
                </td>
                <td className={`${TD} text-sm text-fg`}>
                  <span className="block max-w-40 truncate">{row.customerName}</span>
                  <span className="block max-w-40 truncate text-xs text-fg-muted @7xl:hidden">
                    <span className="sr-only">Requested </span>by {row.requestedBy}
                  </span>
                </td>
                <td className={`${TD} ${wideCell('by')} text-sm text-fg`}>
                  <span className="block max-w-36 truncate">{row.requestedBy}</span>
                </td>
                <td className={`${TD} text-sm text-fg`}>
                  <span className="block max-w-36 truncate">{REFUND_REASON_LABELS[row.reason]}</span>
                </td>
                <td className={`${TD} text-right text-sm whitespace-nowrap text-fg tabular-nums`}>{formatPeso(row.amount)}</td>
                <td className={`${TD} text-sm text-fg-muted`}>
                  <time dateTime={row.requestedAt} className="block">
                    {formatOrderTime(row.requestedAt)}
                  </time>
                </td>
                <td className={TD}>
                  <div className="flex flex-col items-start gap-0.5">
                    <RefundStatusBadge status={row.status} />
                    {row.decidedBy && row.decidedAt && (
                      <>
                        <span className="max-w-28 truncate text-[0.6875rem] leading-3.5 text-fg-muted @7xl:hidden">{row.decidedBy}</span>
                        <time dateTime={row.decidedAt} className="text-[0.6875rem] leading-3.5 text-fg-muted @7xl:hidden">
                          {formatOrderTime(row.decidedAt)}
                        </time>
                      </>
                    )}
                  </div>
                </td>
                <td className={`${TD} ${wideCell('decided')} text-sm`}>
                  {row.decidedBy && row.decidedAt ? (
                    <>
                      <span className="block max-w-36 truncate text-fg">{row.decidedBy}</span>
                      <time dateTime={row.decidedAt} className="block text-fg-muted">
                        {formatOrderTime(row.decidedAt)}
                      </time>
                    </>
                  ) : (
                    <span className="text-fg-muted">
                      <span aria-hidden="true">–</span>
                      <span className="sr-only">Not decided yet</span>
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <ul
        aria-busy={rows === null || stale}
        aria-label="Refund requests"
        className={`divide-y divide-line border-y border-line transition-opacity duration-150 @4xl:hidden ${stale ? 'opacity-60' : ''}`}
      >
        {rows === null ? (
          <RefundCardSkeletonRows count={list.skeletonRows} />
        ) : (
          rows.map((row, index) => (
            <li
              key={row.id}
              onClick={(event) => openRow(event, () => onOpen(row))}
              style={{ '--i': index } as CSSProperties}
              className={`${REFUND_CARD_ROW} enter-row flex cursor-pointer flex-col justify-center py-2 ${selected.includes(row.id) ? 'bg-fg/10' : 'hover:bg-line/40'}`}
            >
              <div className={`flex ${REFUND_CARD_TALL} items-center justify-between gap-3`}>
                <div className="flex min-w-0 items-center">
                  {selecting && (
                    <div onClick={stop} className="flex size-11 shrink-0 items-center justify-center">
                      {tick(row)}
                    </div>
                  )}
                  <button type="button" aria-haspopup="dialog" className="flex min-h-11 min-w-0 cursor-pointer items-center rounded-xl text-left hover:text-chrome-strong">
                    <span className="block truncate font-mono text-base font-semibold text-fg">{row.requestNo}</span>
                  </button>
                </div>
                <RefundStatusBadge status={row.status} />
              </div>
              <p className={`${REFUND_CARD_LINE} truncate text-base text-fg`}>{row.customerName}</p>
              <p className={`${REFUND_CARD_LINE} truncate text-base text-fg-muted`}>
                {REFUND_REASON_LABELS[row.reason]} · <time dateTime={row.requestedAt}>{formatOrderTime(row.requestedAt)}</time>
              </p>
              <p className={`${REFUND_CARD_LINE} truncate text-base text-fg-muted`}>Requested by {row.requestedBy}</p>
              <p className={`${REFUND_CARD_LINE} truncate text-base text-fg-muted`}>
                {row.decidedBy && row.decidedAt ? (
                  <>
                    Decided <time dateTime={row.decidedAt}>{formatOrderTime(row.decidedAt)}</time> · {row.decidedBy}
                  </>
                ) : (
                  'Awaiting decision'
                )}
              </p>
              <div className={`flex ${REFUND_CARD_TALL} items-center justify-between gap-3`}>
                <Link to={orderLink(row.orderNo)} onClick={stop} className="flex min-h-11 min-w-0 items-center rounded-xl font-mono text-base text-fg underline underline-offset-2 hover:text-chrome-strong">
                  <span className="truncate">{row.orderNo}</span>
                </Link>
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
