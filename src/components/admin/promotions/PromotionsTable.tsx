import type { CSSProperties, ReactNode } from 'react'
import type { PromotionsList } from '../../../hooks/usePromotions'
import type { PromoSort, PromoStatus, PromotionRow } from '../../../service/promotions'
import { formatDay, formatPeso } from '../../../utils/format'
import { ChevronDownIcon, ChevronUpIcon, ClockIcon, CopyIcon, PencilIcon, SortIcon, TrashIcon } from '../../form/icons'
import { Pagination } from '../../shop/Pagination'
import { RowAction } from '../../staff/inventory/InventoryParts'
import { PAGER_FOOTER, PAGER_PAGINATION, TABLE_ROW, TD, TH } from '../../staff/inventory/layout'
import { SortHeader } from '../../staff/inventory/SortHeader'
import { SectionError } from '../../staff/StaffSection'
import { TransactionPagerSkeleton } from '../../staff/TransactionsSkeleton'
import { PAGER_ROWS } from '../../staff/transactions/layout'
import { Tooltip } from '../../ui/Tooltip'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { PROMO_CARD_ACTIONS, PROMO_CARD_LINE, PROMO_CARD_ROW, PromoCardSkeletonRows, PromoTableSkeletonRows } from './PromotionsSkeleton'

const STATUS = {
  active: { label: 'Active', dot: 'bg-success', badge: 'border-success/40 bg-success/5 text-success dark:bg-success/15' },
  scheduled: { label: 'Scheduled', dot: 'border-2 border-info', badge: 'border-info/40 bg-info/5 text-info dark:bg-info/15' },
  ended: { label: 'Ended', dot: 'border-2 border-dashed border-danger', badge: 'border-danger/40 bg-danger/5 text-danger dark:bg-danger/10' },
} as const

/** The status in words and a dot (filled, ringed or dashed) as well as green, blue or red, so it never rests on colour alone. */
export function PromoStatusBadge({ status }: { status: PromoStatus }) {
  const { label, dot, badge } = STATUS[status]
  return (
    <span className={`font-ui inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-sm whitespace-nowrap ${badge}`}>
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

/** "20%" or "₱200.00 off". */
const valueLabel = (p: Pick<PromotionRow, 'type' | 'value'>) => (p.type === 'percent' ? `${p.value}%` : `${formatPeso(p.value)} off`)
/** "All products", the category, or "3 products". */
const appliesLabel = ({ appliesTo }: Pick<PromotionRow, 'appliesTo'>) =>
  appliesTo.scope === 'all' ? 'All products' : appliesTo.scope === 'category' ? appliesTo.category : `${appliesTo.products.length} ${appliesTo.products.length === 1 ? 'product' : 'products'}`

const NAMES_SHOWN = 5
/** The target under a name in the table; a set of products also lists its first names on hover and focus. */
function AppliesTarget({ row }: { row: PromotionRow }) {
  const { appliesTo } = row
  if (appliesTo.scope !== 'products') return <p className="truncate text-fg-muted">{appliesLabel(row)}</p>
  const { products } = appliesTo
  const more = products.length - NAMES_SHOWN
  const names = `${products.slice(0, NAMES_SHOWN).map((p) => p.name).join(', ')}${more > 0 ? `, +${more} more` : ''}`
  return (
    <p className="flex text-fg-muted">
      <Tooltip label={names} describe>
        <span tabIndex={0} className="truncate">
          {appliesLabel(row)}
        </span>
      </Tooltip>
    </p>
  )
}
const year = (date: string) => date.slice(0, 4)
/** "Oct 1 – Oct 31, 2026"; across a new year both years show. */
const periodLabel = (p: Pick<PromotionRow, 'startsAt' | 'endsAt'>) =>
  year(p.startsAt) === year(p.endsAt) ? `${formatDay(p.startsAt)} – ${formatDay(p.endsAt)}, ${year(p.endsAt)}` : `${formatDay(p.startsAt)}, ${year(p.startsAt)} – ${formatDay(p.endsAt)}, ${year(p.endsAt)}`
const usedLabel = (p: Pick<PromotionRow, 'redemptions' | 'usageLimit'>) => (p.usageLimit === null ? `${p.redemptions}` : `${p.redemptions} / ${p.usageLimit}`)

function CopyButton({ code, onCopy, className }: { code: string; onCopy: () => void; className: string }) {
  return (
    <Tooltip label="Copy code">
      <button
        type="button"
        aria-label={`Copy code ${code}`}
        onClick={onCopy}
        className={`flex shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:bg-line/60 hover:text-fg ${className}`}
      >
        <CopyIcon size={16} />
      </button>
    </Tooltip>
  )
}

/** The sale period's header sorts by either end, so it holds two buttons. */
function PeriodHeader({ active, onSort }: { active: { sort: PromoSort; dir: 'asc' | 'desc' }; onSort: (sort: PromoSort) => void }) {
  const on = active.sort === 'startsAt' || active.sort === 'endsAt'
  const button = (sort: 'startsAt' | 'endsAt', label: string, name: string) => {
    const Arrow = active.sort !== sort ? SortIcon : active.dir === 'asc' ? ChevronUpIcon : ChevronDownIcon
    return (
      <button
        type="button"
        onClick={() => onSort(sort)}
        aria-label={active.sort === sort ? `${name}, ${active.dir === 'asc' ? 'ascending' : 'descending'}` : name}
        className="-mx-1 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-xl px-1 hover:text-chrome-strong"
      >
        {label}
        <Arrow className={active.sort === sort ? 'text-fg' : 'text-fg-muted'} />
      </button>
    )
  }
  return (
    <th scope="col" aria-sort={on ? (active.dir === 'asc' ? 'ascending' : 'descending') : undefined} className={TH}>
      <span className="sr-only">Sale period</span>
      <span className="flex items-center gap-2">
        {button('startsAt', 'Starts', 'Sort by start date')}
        {button('endsAt', 'Ends', 'Sort by end date')}
      </span>
    </th>
  )
}

interface PromotionsTableProps {
  list: PromotionsList
  onCreate: () => void
  onEdit: (row: PromotionRow) => void
  onEnd: (row: PromotionRow) => void
  onDelete: (row: PromotionRow) => void
  onCopy: (row: PromotionRow) => void
}

/** The promotions: the table from @4xl of its panel and cards below, with the loading, error and empty states and the pager. */
export function PromotionsTable({ list, onCreate, onEdit, onEnd, onDelete, onCopy }: PromotionsTableProps) {
  const { state, result, stale, retry, sorted, sortBy, page, setPage, per, filtered, clear } = list
  const rows = result?.data ?? null

  if (state.status === 'error' && !result) return <SectionError what="the promotions" kind={state.kind} onRetry={retry} />

  if (result && result.data.length === 0) {
    return (
      <div>
        {result.meta.total > 0 ? (
          <>
            <p className="text-base text-fg-muted">There are no promotions on page {page}.</p>
            <button type="button" onClick={() => setPage(1)} className={`${SECONDARY_BUTTON} mt-3`}>
              Go to the first page
            </button>
          </>
        ) : filtered ? (
          <>
            <p className="text-base font-semibold text-fg">No promotions match</p>
            <p className="mt-1 text-base text-fg-muted">Check the spelling, or clear the search and status filter and try again.</p>
            <button type="button" onClick={clear} className={`${SECONDARY_BUTTON} mt-3`}>
              Clear filters
            </button>
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-fg">No promotions yet</p>
            <p className="mt-1 mb-3 text-base text-fg-muted">Create the first promotion to give shoppers a code for a percent or peso discount.</p>
            <button type="button" onClick={onCreate} className={SECONDARY_BUTTON}>
              Create promotion
            </button>
          </>
        )}
      </div>
    )
  }

  /** Edit and End early only where they still apply, their slots kept so Delete stays in line; Delete always. */
  const actions = (row: PromotionRow): ReactNode => (
    <>
      {!row.endedEarlyAt ? (
        <RowAction label={`Edit ${row.name}`} icon={<PencilIcon />} onClick={() => onEdit(row)} />
      ) : (
        <span aria-hidden="true" className="size-11 shrink-0" />
      )}
      {row.status !== 'ended' ? (
        <RowAction label={`End ${row.name} early`} icon={<ClockIcon />} onClick={() => onEnd(row)} />
      ) : (
        <span aria-hidden="true" className="size-11 shrink-0" />
      )}
      <RowAction label={`Delete ${row.name}`} icon={<TrashIcon />} onClick={() => onDelete(row)} />
    </>
  )

  return (
    <>
      {state.status === 'error' && result && (
        <div className="mb-3 rounded-xl border border-line bg-canvas-sub p-3">
          <SectionError what="the latest promotions" kind={state.kind} onRetry={retry} />
          <p className="mt-3 text-sm text-fg-muted">The list below is from before your last change.</p>
        </div>
      )}
      <p role="status" className="sr-only">
        {state.status === 'loading' ? 'Loading promotions' : ''}
      </p>
      <table aria-busy={rows === null || stale} className="hidden w-full table-fixed border-separate border-spacing-0 @4xl:table">
        <caption className="sr-only">Promotions with code, value, sale period, status and redemptions</caption>
        <colgroup>
          <col className="w-[5%]" />
          <col className="w-[17%]" />
          <col className="w-[13%]" />
          <col className="w-[11%]" />
          <col className="w-[17%]" />
          <col className="w-[13%]" />
          <col className="w-[9%]" />
          <col className="w-[15%]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH.replace('text-left', 'text-right')}>
              <span aria-hidden="true">#</span>
              <span className="sr-only">Row number</span>
            </th>
            <SortHeader label="Name" column="name" active={sorted} onSort={sortBy} />
            <SortHeader label="Code" column="code" active={sorted} onSort={sortBy} />
            <SortHeader label="Value" column="value" active={sorted} onSort={sortBy} right />
            <PeriodHeader active={sorted} onSort={sortBy} />
            <SortHeader label="Status" column="status" active={sorted} onSort={sortBy} />
            <SortHeader label="Used" column="redemptions" active={sorted} onSort={sortBy} right />
            <th scope="col" className={TH}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className={`transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
          {rows === null ? (
            <PromoTableSkeletonRows count={list.skeletonRows} />
          ) : (
            rows.map((row, index) => (
              <tr key={row.id} style={{ '--i': index } as CSSProperties} className={`${TABLE_ROW} enter-row hover:bg-line/40`}>
                <td className={`${TD} text-right text-sm text-fg-muted tabular-nums`}>{(page - 1) * per + index + 1}</td>
                <td className={`${TD} text-sm text-fg`}>
                  <p className="truncate font-semibold">{row.name}</p>
                  <AppliesTarget row={row} />
                </td>
                <td className={TD}>
                  <div className="flex items-center gap-1">
                    <span className="line-clamp-2 min-w-0 font-mono text-sm leading-tight break-all text-fg">{row.code}</span>
                    <CopyButton code={row.code} onCopy={() => onCopy(row)} className="size-8 pointer-coarse:size-11" />
                  </div>
                </td>
                <td className={`${TD} text-right text-sm text-fg tabular-nums`}>{valueLabel(row)}</td>
                <td className={`${TD} text-sm text-fg`}>{periodLabel(row)}</td>
                <td className={TD}>
                  <PromoStatusBadge status={row.status} />
                </td>
                <td className={`${TD} text-right text-sm text-fg tabular-nums`}>{usedLabel(row)}</td>
                <td className={TD}>
                  <div className="flex justify-end">{actions(row)}</div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <ul
        aria-busy={rows === null || stale}
        aria-label="Promotions"
        className={`divide-y divide-line border-y border-line transition-opacity duration-150 @4xl:hidden ${stale ? 'opacity-60' : ''}`}
      >
        {rows === null ? (
          <PromoCardSkeletonRows count={list.skeletonRows} />
        ) : (
          rows.map((row, index) => (
            <li key={row.id} style={{ '--i': index } as CSSProperties} className={`${PROMO_CARD_ROW} enter-row flex flex-col justify-center py-2 hover:bg-line/40`}>
              <div className="flex h-11 items-center justify-between gap-3">
                <p className="min-w-0 truncate text-base font-semibold text-fg">{row.name}</p>
                <PromoStatusBadge status={row.status} />
              </div>
              <p className={`${PROMO_CARD_LINE} truncate text-base text-fg-muted`}>
                {valueLabel(row)} · {appliesLabel(row)}
              </p>
              <p className={`${PROMO_CARD_LINE} truncate text-base text-fg-muted tabular-nums`}>{periodLabel(row)}</p>
              <div className="flex h-11 items-center gap-1">
                <span className="min-w-0 truncate font-mono text-sm text-fg">{row.code}</span>
                <CopyButton code={row.code} onCopy={() => onCopy(row)} className="size-11" />
                <span className="ml-auto shrink-0 text-base text-fg-muted tabular-nums">{usedLabel(row)} used</span>
              </div>
              <div className={`flex ${PROMO_CARD_ACTIONS} items-center justify-end`}>{actions(row)}</div>
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
