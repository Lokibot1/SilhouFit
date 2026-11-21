import type { CSSProperties } from 'react'
import { useProfanityOffenses } from '../../../hooks/useProfanityOffenses'
import { OFFENSE_SOURCE_LABELS, OFFENSE_SOURCES, PROFANITY_PER_PAGE_OPTIONS, type Offense, type OffenseSource } from '../../../service/profanity'
import { REMOVED } from '../../../service/adminOrdersApi'
import { formatOrderTime } from '../../../utils/format'
import { Pagination } from '../../shop/Pagination'
import { Field, FIELD_INPUT } from '../../staff/inventory/FormField'
import { PAGER_FOOTER, PAGER_PAGINATION, TD, TH } from '../../staff/inventory/layout'
import { SectionError } from '../../staff/StaffSection'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { TransactionPagerSkeleton } from '../../staff/TransactionsSkeleton'
import { PAGER_ROWS } from '../../staff/transactions/layout'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Select } from '../../ui/Select'
import { OFFENSE_CARD_ROW, OFFENSE_HEADERS, OFFENSE_ROW, OffenseCardSkeletonRows, OffenseTableSkeletonRows } from './ProfanitySkeleton'

const SOURCES: { value: OffenseSource | ''; label: string }[] = [{ value: '', label: 'All sources' }, ...OFFENSE_SOURCES.map((value) => ({ value, label: OFFENSE_SOURCE_LABELS[value] }))]
const PER_PAGE_CHOICES = PROFANITY_PER_PAGE_OPTIONS.map((n) => ({ value: n, label: `${n} per page` }))

const DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
const CLOCK = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true })

/** The masked text only: the API's original text is dropped in the service, so it cannot show here. */
function Message({ offense }: { offense: Offense }) {
  return <p className="line-clamp-2 text-sm break-words whitespace-pre-line text-fg [overflow-wrap:anywhere]">{offense.maskedContent}</p>
}

/** The offenses log: who said what (masked), where, and which words were hidden. Filter by source and date range. */
export function OffensesTab() {
  const list = useProfanityOffenses()
  const { state, result, stale, retry, page, setPage, per, filtered, clear, from, to, badRange } = list
  // An empty answer to an earlier view is not shown while the next one loads (it would read as "none yet" after Clear filters).
  const rows = result && !(stale && result.data.length === 0) ? result.data : null
  const fade = `transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`

  function body() {
    if (state.status === 'error' && !result) return <SectionError what="the offenses" kind={state.kind} retryAfterMs={state.retryAfterMs} onRetry={retry} />

    if (result && result.data.length === 0 && !stale) {
      return (
        <div>
          {result.meta.total > 0 ? (
            <>
              <p className="text-base text-fg-muted">There are no offenses on page {page}.</p>
              <button type="button" onClick={() => setPage(1)} className={`${SECONDARY_BUTTON} mt-3`}>
                Go to the first page
              </button>
            </>
          ) : filtered ? (
            <>
              <p className="text-base font-semibold text-fg">No offenses match</p>
              <p className="mt-1 text-base text-fg-muted">{badRange ? 'The end date is before the start date. Change one of them, or clear the filters.' : 'Try a wider date range or another source, or clear the filters.'}</p>
              <button type="button" onClick={clear} className={`${SECONDARY_BUTTON} mt-3`}>
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-fg">No offenses yet</p>
              <p className="mt-1 text-base text-fg-muted">When a customer&apos;s chat message or review contains a word from the filter, it shows here with the word hidden.</p>
            </>
          )}
        </div>
      )
    }

    return (
      <>
        {state.status === 'error' && result && (
          <div className="mb-3 rounded-xl border border-line bg-canvas-sub p-3">
            <SectionError what="the latest offenses" kind={state.kind} retryAfterMs={state.retryAfterMs} onRetry={retry} />
            <p className="mt-3 text-sm text-fg-muted">The list below is from before your last change.</p>
          </div>
        )}
        <p role="status" className="sr-only">
          {state.status === 'loading' ? 'Loading offenses' : ''}
        </p>
        <table aria-busy={rows === null || stale} className="hidden w-full border-separate border-spacing-0 @4xl:table">
          <caption className="sr-only">Offenses with date, customer, source, hidden message, matched words and count</caption>
          <thead>
            <tr>
              {OFFENSE_HEADERS.map((label) => (
                <th key={label} scope="col" className={label === 'Count' ? TH.replace('text-left', 'text-right') : TH}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={fade}>
            {rows === null ? (
              <OffenseTableSkeletonRows count={list.skeletonRows} />
            ) : (
              rows.map((offense, index) => (
                <tr key={offense.id} style={{ '--i': index } as CSSProperties} className={`${OFFENSE_ROW} enter-row hover:bg-line/40`}>
                  <td className={`${TD} text-sm whitespace-nowrap text-fg-muted`}>
                    <time dateTime={offense.createdAt} className="grid tabular-nums">
                      <span>{DAY.format(new Date(offense.createdAt))}</span>
                      <span>{CLOCK.format(new Date(offense.createdAt))}</span>
                    </time>
                  </td>
                  <td className={`${TD} text-sm text-fg`}>
                    <span className="block max-w-40 truncate">{offense.customer?.name ?? REMOVED}</span>
                  </td>
                  <td className={`${TD} text-sm whitespace-nowrap text-fg`}>{OFFENSE_SOURCE_LABELS[offense.source]}</td>
                  <td className={`${TD} max-w-xs py-2`}>
                    <Message offense={offense} />
                  </td>
                  <td className={`${TD} text-sm text-fg`}>
                    <span className="line-clamp-2 max-w-48 break-words">{offense.matchedWords.join(', ')}</span>
                  </td>
                  <td className={`${TD} text-right text-sm text-fg tabular-nums`}>{offense.matchCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <ul aria-busy={rows === null || stale} aria-label="Offenses" className={`divide-y divide-line border-y border-line @4xl:hidden ${fade}`}>
          {rows === null ? (
            <OffenseCardSkeletonRows count={list.skeletonRows} />
          ) : (
            rows.map((offense, index) => (
              <li key={offense.id} style={{ '--i': index } as CSSProperties} className={`${OFFENSE_CARD_ROW} enter-row grid content-center gap-1 py-3`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-base font-semibold text-fg">{offense.customer?.name ?? REMOVED}</p>
                  <time dateTime={offense.createdAt} className="shrink-0 text-sm text-fg-muted">
                    {formatOrderTime(offense.createdAt)}
                  </time>
                </div>
                <Message offense={offense} />
                <p className="text-sm break-words text-fg-muted tabular-nums">
                  {OFFENSE_SOURCE_LABELS[offense.source]}. Matched {offense.matchedWords.join(', ')} ({offense.matchCount}).
                </p>
              </li>
            ))
          )}
        </ul>
        {rows && result ? (
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

  return (
    <section aria-labelledby="offenses-list" className={`${STAFF_SECTION} scroll-mt-14`}>
      <h2 id="offenses-list" className="sr-only">
        Offenses
      </h2>
      <div className="mb-3 grid items-start gap-3 @sm:grid-cols-2 @4xl:flex @4xl:flex-wrap">
        <div className="@4xl:w-44">
          <Select label="Filter by source" value={list.source} options={SOURCES} onChange={list.setSource} />
        </div>
        <div className="@4xl:w-44">
          <Select label="Rows per page" value={per} options={PER_PAGE_CHOICES} onChange={list.setPer} />
        </div>
        <div className="@4xl:w-44">
          <Field id="offense-from" label="From date">
            <input id="offense-from" type="date" value={from} max={to || undefined} onChange={(event) => list.setFrom(event.target.value)} className={FIELD_INPUT} />
          </Field>
        </div>
        <div className="@4xl:w-44">
          <Field id="offense-to" label="To date" error={badRange ? 'The end date is before the start date.' : undefined}>
            <input id="offense-to" type="date" value={to} min={from || undefined} onChange={(event) => list.setTo(event.target.value)} aria-invalid={badRange} className={FIELD_INPUT} />
          </Field>
        </div>
      </div>
      {body()}
    </section>
  )
}
