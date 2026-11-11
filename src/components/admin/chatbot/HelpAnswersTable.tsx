import type { CSSProperties, ReactNode } from 'react'
import type { HelpAnswersList } from '../../../hooks/useHelpAnswers'
import { HELP_CATEGORY_LABELS, type HelpAnswer } from '../../../service/helpAnswers'
import { formatPlacedAt } from '../../../utils/format'
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, TrashIcon } from '../../form/icons'
import { Pagination } from '../../shop/Pagination'
import { RowAction } from '../../staff/inventory/InventoryParts'
import { PAGER_FOOTER, PAGER_PAGINATION, TABLE_ROW, TD, TH } from '../../staff/inventory/layout'
import { SectionError } from '../../staff/StaffSection'
import { TransactionPagerSkeleton } from '../../staff/TransactionsSkeleton'
import { PAGER_ROWS } from '../../staff/transactions/layout'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Tooltip } from '../../ui/Tooltip'
import { HELP_CARD_ROW, HelpCardSkeletonRows, HelpTableSkeletonRows } from './HelpAnswersSkeleton'

/** Published or Draft in words and a dot (filled or dashed), so it never rests on colour alone. */
export function HelpStatusBadge({ published }: { published: boolean }) {
  return (
    <span
      className={`font-ui inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-sm whitespace-nowrap ${
        published ? 'border-success/40 bg-success/5 text-success dark:bg-success/15' : 'border-line-strong text-fg-muted'
      }`}
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${published ? 'bg-success' : 'border-2 border-dashed border-fg-muted'}`} />
      {published ? 'Published' : 'Draft'}
    </span>
  )
}

type Direction = 'up' | 'down'

/** A move button that stays focusable when it cannot move, so its tooltip can say why. */
function MoveButton({ row, direction, blocked, onMove }: { row: HelpAnswer; direction: Direction; blocked: string | null; onMove: () => void }) {
  const label = `Move ${direction}`
  const Arrow = direction === 'up' ? ChevronUpIcon : ChevronDownIcon
  return (
    <Tooltip label={blocked ?? label}>
      <button
        type="button"
        data-move={`${row.id}:${direction}`}
        aria-label={`${label}: ${row.question}`}
        aria-disabled={blocked ? true : undefined}
        onClick={() => !blocked && onMove()}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-line/60 hover:text-chrome-strong aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
      >
        <Arrow />
      </button>
    </Tooltip>
  )
}

interface HelpAnswersTableProps {
  list: HelpAnswersList
  onCreate: () => void
  onEdit: (row: HelpAnswer) => void
  onDelete: (row: HelpAnswer) => void
  onMove: (row: HelpAnswer, direction: Direction) => void
}

/** The answers: the table from @4xl of its panel and cards below, with the loading, error and empty states and the pager. */
export function HelpAnswersTable({ list, onCreate, onEdit, onDelete, onMove }: HelpAnswersTableProps) {
  const { state, result, stale, retry, page, setPage, per, filtered, clear } = list
  const rows = result?.data ?? null

  if (state.status === 'error' && !result) return <SectionError what="the help answers" kind={state.kind} onRetry={retry} />

  if (result && result.data.length === 0) {
    return (
      <div>
        {result.meta.total > 0 ? (
          <>
            <p className="text-base text-fg-muted">There are no questions on page {page}.</p>
            <button type="button" onClick={() => setPage(1)} className={`${SECONDARY_BUTTON} mt-3`}>
              Go to the first page
            </button>
          </>
        ) : filtered ? (
          <>
            <p className="text-base font-semibold text-fg">No questions match</p>
            <p className="mt-1 text-base text-fg-muted">Check the spelling, or clear the search and topic filter and try again.</p>
            <button type="button" onClick={clear} className={`${SECONDARY_BUTTON} mt-3`}>
              Clear filters
            </button>
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-fg">No questions yet</p>
            <p className="mt-1 mb-3 text-base text-fg-muted">Add the first question so the Help chat has something to answer. Customers can talk to a person until you do.</p>
            <button type="button" onClick={onCreate} className={SECONDARY_BUTTON}>
              Add question
            </button>
          </>
        )}
      </div>
    )
  }

  const total = result?.meta.total ?? 0
  /** Why a row cannot move that way, or null. The order only makes sense on the full list. */
  const blockedFor = (row: HelpAnswer, direction: Direction) =>
    filtered ? 'Clear the search to reorder' : direction === 'up' && row.order === 1 ? 'Already first' : direction === 'down' && row.order === total ? 'Already last' : null

  const actions = (row: HelpAnswer): ReactNode => (
    <>
      <MoveButton row={row} direction="up" blocked={blockedFor(row, 'up')} onMove={() => onMove(row, 'up')} />
      <MoveButton row={row} direction="down" blocked={blockedFor(row, 'down')} onMove={() => onMove(row, 'down')} />
      <RowAction label={`Edit ${row.question}`} icon={<PencilIcon />} onClick={() => onEdit(row)} />
      <RowAction label={`Delete ${row.question}`} icon={<TrashIcon />} onClick={() => onDelete(row)} />
    </>
  )

  return (
    <>
      {state.status === 'error' && result && (
        <div className="mb-3 rounded-xl border border-line bg-canvas-sub p-3">
          <SectionError what="the latest answers" kind={state.kind} onRetry={retry} />
          <p className="mt-3 text-sm text-fg-muted">The list below is from before your last change.</p>
        </div>
      )}
      <p role="status" className="sr-only">
        {state.status === 'loading' ? 'Loading questions' : ''}
      </p>
      <table aria-busy={rows === null || stale} className="hidden w-full table-fixed border-separate border-spacing-0 @4xl:table">
        <caption className="sr-only">Help questions with topic, status, last change and order</caption>
        <colgroup>
          <col className="w-[6%]" />
          <col className="w-[32%]" />
          <col className="w-[12%]" />
          <col className="w-[12%]" />
          <col className="w-[18%]" />
          <col className="w-[20%]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH.replace('text-left', 'text-right')}>
              <span aria-hidden="true">#</span>
              <span className="sr-only">Position</span>
            </th>
            <th scope="col" className={TH}>
              Question
            </th>
            <th scope="col" className={TH}>
              Topic
            </th>
            <th scope="col" className={TH}>
              Status
            </th>
            <th scope="col" className={TH}>
              Updated
            </th>
            <th scope="col" className={TH}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className={`transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
          {rows === null ? (
            <HelpTableSkeletonRows count={list.skeletonRows} />
          ) : (
            rows.map((row, index) => (
              <tr key={row.id} style={{ '--i': index } as CSSProperties} className={`${TABLE_ROW} enter-row hover:bg-line/40`}>
                <td className={`${TD} text-right text-sm text-fg-muted tabular-nums`}>{row.order}</td>
                <td className={`${TD} text-sm text-fg`}>
                  <p className="truncate font-semibold">{row.question}</p>
                  <p className="truncate text-fg-muted">{row.answer}</p>
                </td>
                <td className={`${TD} text-sm text-fg`}>{HELP_CATEGORY_LABELS[row.category]}</td>
                <td className={TD}>
                  <HelpStatusBadge published={row.published} />
                </td>
                <td className={`${TD} text-sm text-fg`}>
                  <p className="truncate tabular-nums">{formatPlacedAt(row.updatedAt)}</p>
                  <p className="truncate text-fg-muted">{row.updatedBy}</p>
                </td>
                <td className={TD}>
                  <div className="flex justify-end">{actions(row)}</div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <ul aria-busy={rows === null || stale} aria-label="Help questions" className={`divide-y divide-line border-y border-line transition-opacity duration-150 @4xl:hidden ${stale ? 'opacity-60' : ''}`}>
        {rows === null ? (
          <HelpCardSkeletonRows count={list.skeletonRows} />
        ) : (
          rows.map((row, index) => (
            <li key={row.id} style={{ '--i': index } as CSSProperties} className={`${HELP_CARD_ROW} enter-row flex flex-col justify-center py-2 hover:bg-line/40`}>
              <div className="flex h-11 items-center gap-3">
                <span className="w-6 shrink-0 text-right text-base text-fg-muted tabular-nums">{row.order}</span>
                <p className="min-w-0 truncate text-base font-semibold text-fg">{row.question}</p>
              </div>
              <p className="h-6 truncate text-base text-fg-muted">{row.answer}</p>
              <div className="flex h-11 items-center justify-between gap-3">
                <p className="min-w-0 truncate text-base text-fg">{HELP_CATEGORY_LABELS[row.category]}</p>
                <HelpStatusBadge published={row.published} />
              </div>
              <p className="h-6 truncate text-base text-fg-muted tabular-nums">
                {formatPlacedAt(row.updatedAt)} by {row.updatedBy}
              </p>
              <div className="flex h-11 items-center justify-end">{actions(row)}</div>
            </li>
          ))
        )}
      </ul>
      {result ? (
        <div className={PAGER_FOOTER}>
          <div className={`${PAGER_PAGINATION} ${PAGER_ROWS}`}>
            <Pagination page={page} pageCount={Math.max(1, result.meta.totalPages)} from={(page - 1) * per + 1} to={Math.min(page * per, result.meta.total)} total={result.meta.total} onPage={setPage} />
          </div>
        </div>
      ) : (
        <TransactionPagerSkeleton />
      )}
    </>
  )
}
