import { useCallback, useState } from 'react'
import { useSection } from '../../../hooks/useSection'
import { listOffenses, OFFENSE_SOURCE_LABELS, type Offense, type OffensesPage } from '../../../service/profanity'
import { formatPlacedAt } from '../../../utils/format'
import { Pagination } from '../../shop/Pagination'
import { EmptyNote, SectionBody } from '../../staff/StaffSection'

const LIMIT = 10

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

const ListSkeleton = (
  <div role="status" className="animate-pulse">
    <span className="sr-only">Loading offenses</span>
    <ul className="divide-y divide-line border-y border-line">
      {[0, 1, 2].map((n) => (
        <li key={n} className="grid gap-0.5 py-2">
          <Bar className="h-5 w-40" />
          <Bar className="h-6 w-2/3" />
          <Bar className="h-5 w-24" />
        </li>
      ))}
    </ul>
  </div>
)

/** The masked text only: the API's original text is dropped in the service. While the next page loads, `busy` keeps the previous rows and the pager mounted. */
function OffenseList({ data, meta, busy, onPage }: { data: Offense[]; meta: OffensesPage['meta']; busy?: boolean; onPage: (page: number) => void }) {
  return (
    <div aria-busy={busy} className={busy ? 'opacity-60' : undefined}>
      <ol aria-label="Offenses, newest first" className="divide-y divide-line border-y border-line">
        {data.map((offense) => (
          <li key={offense.id} className="grid min-w-0 gap-0.5 py-2 text-left">
            <p className="text-sm text-fg-muted tabular-nums">
              <time dateTime={offense.createdAt}>{formatPlacedAt(offense.createdAt)}</time>
              <span> · {OFFENSE_SOURCE_LABELS[offense.source]}</span>
            </p>
            <p className="text-base [overflow-wrap:anywhere] text-fg">{offense.maskedContent}</p>
            {offense.matchedWords.length > 0 && <p className="text-sm [overflow-wrap:anywhere] text-fg-muted">Matched: {offense.matchedWords.join(', ')}</p>}
          </li>
        ))}
      </ol>
      {meta.totalPages > 1 && (
        <Pagination large page={meta.page} pageCount={meta.totalPages} from={(meta.page - 1) * meta.limit + 1} to={(meta.page - 1) * meta.limit + data.length} total={meta.total} onPage={onPage} />
      )}
    </div>
  )
}

function Offenses({ id }: { id: string }) {
  const [page, setPage] = useState(1)
  const list = useSection(useCallback((options) => listOffenses({ userId: id, page, limit: LIMIT }, options), [id, page]))
  return (
    <SectionBody section={list} what="the offenses" skeleton={list.previous?.data.length ? <OffenseList data={list.previous.data} meta={list.previous.meta} busy onPage={setPage} /> : ListSkeleton}>
      {({ data, meta }) => (data.length === 0 ? <EmptyNote>No offenses. Chat messages and reviews with hidden words from this customer will be listed here.</EmptyNote> : <OffenseList data={data} meta={meta} onPage={setPage} />)}
    </SectionBody>
  )
}

/** A customer's offense count, and for a superadmin the masked text of each one. An admin sees the count only (the offense list is a superadmin endpoint). */
export function CustomerOffenses({ id, total, canRead }: { id: string; total: number; canRead: boolean }) {
  return (
    <section aria-labelledby="offenses-heading" className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="offenses-heading" className="text-base font-semibold text-fg">
          Offenses
        </h3>
        <p className="font-ui text-base text-fg tabular-nums">
          <span className="sr-only">Total offenses: </span>
          {total}
        </p>
      </div>
      {canRead ? <Offenses id={id} /> : <EmptyNote>Only a superadmin can read the flagged messages.</EmptyNote>}
    </section>
  )
}
