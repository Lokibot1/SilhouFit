import type { CSSProperties, ReactNode } from 'react'
import type { AccountsList } from '../../../hooks/useAccounts'
import type { AccountSort } from '../../../utils/accountQuery'
import { Pagination } from '../../shop/Pagination'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { openRow } from '../../staff/inventory/InventoryParts'
import { PAGER_FOOTER, PAGER_PAGINATION, TABLE_ROW, TD, TH } from '../../staff/inventory/layout'
import { SortHeader } from '../../staff/inventory/SortHeader'
import { SectionError } from '../../staff/StaffSection'
import { TransactionPagerSkeleton } from '../../staff/TransactionsSkeleton'
import { PAGER_ROWS } from '../../staff/transactions/layout'
import { AccountCardSkeletonRows, AccountTableSkeletonRows } from './AccountSkeleton'

export interface AccountColumn<T> {
  key: string
  header: string
  /** Shown beside the value in the mobile card; without it the card leaves the label to screen readers. */
  cardLabel?: string
  /** Makes the header a sort button. */
  sort?: AccountSort
  /** Numbers: right-aligned with tabular digits. */
  right?: boolean
  /** A width class. The first column has none and takes what is left. */
  width?: string
  /** The row's place in the shown page (0-based), for numbering columns. */
  cell: (row: T, index: number) => ReactNode
  /** The mobile card's heading; the first column when none is marked. Other columns, this one included, list beneath it. */
  title?: boolean
}

interface AccountTableProps<T extends { id: string }> {
  list: AccountsList<T>
  /** The table's name for assistive tech: "Customers". */
  label: string
  /** Fills "We couldn't load the ___": "customers". */
  noun: string
  columns: AccountColumn<T>[]
  /** A last column of buttons, one set per row. Their clicks must not reach the row (use RowAction). */
  actions?: (row: T) => ReactNode
  /** Makes the whole row open something. The first column's cell must hold a button, which gets the focus back. */
  onOpen?: (row: T) => void
  /** Shown when there are no accounts at all (not when a search or filter hides them). */
  empty: ReactNode
  /** Replaces "No ___ match" when a filter hides every account and its own message fits better. */
  emptyFiltered?: ReactNode
}

/** A tab's list: the table from @4xl of its panel and cards below, with the loading, error and empty states and the pager. */
export function AccountTable<T extends { id: string }>({ list, label, noun, columns, actions, onOpen, empty, emptyFiltered }: AccountTableProps<T>) {
  const { state, result, stale, retry, sorted, sortBy, page, setPage, per, filtered, clear } = list
  const rows = result?.data ?? null
  const cells = columns.length + (actions ? 1 : 0)
  const heading = columns.find((column) => column.title) ?? columns[0]

  if (state.status === 'error' && !result) return <SectionError what={`the ${noun}`} kind={state.kind} onRetry={retry} />

  if (result && result.data.length === 0) {
    return (
      <div>
        {result.meta.total > 0 ? (
          <>
            <p className="text-base text-fg-muted">
              There are no {noun} on page {page}.
            </p>
            <button type="button" onClick={() => setPage(1)} className={`${SECONDARY_BUTTON} mt-3`}>
              Go to the first page
            </button>
          </>
        ) : filtered ? (
          (emptyFiltered ?? (
            <>
              <p className="text-base font-semibold text-fg">No {noun} match</p>
              <p className="mt-1 text-base text-fg-muted">Check the spelling, or clear the search and status filter and try again.</p>
              <button type="button" onClick={clear} className={`${SECONDARY_BUTTON} mt-3`}>
                Clear filters
              </button>
            </>
          ))
        ) : (
          empty
        )}
      </div>
    )
  }

  return (
    <>
      {state.status === 'error' && result && (
        <div className="mb-3 rounded-xl border border-line bg-canvas-sub p-3">
          <SectionError what={`the latest ${noun}`} kind={state.kind} onRetry={retry} />
          <p className="mt-3 text-sm text-fg-muted">The list below is from before your last change.</p>
        </div>
      )}
      <p role="status" className="sr-only">
        {state.status === 'loading' ? `Loading ${noun}` : ''}
      </p>
      <table aria-busy={rows === null || stale} className="hidden w-full table-fixed border-separate border-spacing-0 @4xl:table">
        <caption className="sr-only">{label}</caption>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} className={column.width} />
          ))}
          {actions && <col className="w-28" />}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) =>
              column.sort ? (
                <SortHeader key={column.key} label={column.header} column={column.sort} active={sorted} onSort={sortBy} right={column.right} />
              ) : (
                <th key={column.key} scope="col" className={column.right ? TH.replace('text-left', 'text-right') : TH}>
                  {column.header}
                </th>
              ),
            )}
            {actions && (
              <th scope="col" className={TH}>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className={`transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
          {rows === null ? (
            <AccountTableSkeletonRows count={list.skeletonRows} cells={cells} />
          ) : (
            rows.map((row, index) => (
              <tr
                key={row.id}
                onClick={onOpen && ((event) => openRow(event, () => onOpen(row)))}
                style={{ '--i': index } as CSSProperties}
                className={`${TABLE_ROW} enter-row hover:bg-line/40 ${onOpen ? 'cursor-pointer' : ''}`}
              >
                {columns.map((column) => (
                  <td key={column.key} className={`${TD} text-sm text-fg ${column.right ? 'text-right tabular-nums' : ''}`}>
                    {column.cell(row, index)}
                  </td>
                ))}
                {actions && (
                  <td className={TD}>
                    <div className="flex justify-end">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <ul
        aria-busy={rows === null || stale}
        aria-label={label}
        className={`divide-y divide-line border-y border-line transition-opacity duration-150 @4xl:hidden ${stale ? 'opacity-60' : ''}`}
      >
        {rows === null ? (
          <AccountCardSkeletonRows count={list.skeletonRows} />
        ) : (
          rows.map((row, index) => (
            <li
              key={row.id}
              onClick={onOpen && ((event) => openRow(event, () => onOpen(row)))}
              style={{ '--i': index } as CSSProperties}
              className={`enter-row flex min-h-24 flex-col justify-center gap-1 py-3 hover:bg-line/40 ${onOpen ? 'cursor-pointer' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">{heading.cell(row, index)}</div>
                {actions && <div className="flex shrink-0">{actions(row)}</div>}
              </div>
              <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-fg-muted">
                {columns.filter((column) => column !== heading).map((column) => (
                  <div key={column.key} className={`flex items-center ${column.right ? 'tabular-nums' : ''}`}>
                    <dt className={column.cardLabel ? 'mr-1' : 'sr-only'}>{column.cardLabel ?? column.header}</dt>
                    <dd>{column.cell(row, index)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))
        )}
      </ul>
      {result ? (
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
        <TransactionPagerSkeleton />
      )}
    </>
  )
}
