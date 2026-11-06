import { useState } from 'react'
import { ActivityFilterBar, NO_FILTERS, sinceOf, type ActivityFilters } from '../../components/admin/ActivityFilterBar'
import { ACTIONS, CATEGORIES } from '../../components/admin/ActivityLogs'
import { SearchIcon, XIcon } from '../../components/form/icons'
import { Pagination } from '../../components/shop/Pagination'
import { EmptyNote, SectionBody } from '../../components/staff/StaffSection'
import { STAFF_SECTION } from '../../components/staff/StaffSkeleton'
import { PAGER_FOOTER } from '../../components/staff/inventory/layout'
import { PRIMARY_BUTTON_SM, SECONDARY_BUTTON_SM } from '../../components/ui/buttonStyles'
import { Modal } from '../../components/ui/Modal'
import { SampleDataBadge } from '../../components/ui/SampleDataBadge'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useSection } from '../../hooks/useSection'
import { getActivityLogs } from '../../service/activityLogs'
import type { ActivityLog } from '../../types/activityLogs'
import { formatPlacedAt } from '../../utils/format'

const META_DESCRIPTION =
  'Review every action logged across SilhouFit accounts, orders, transactions and products, who did it and when, newest first, and filter by action, user and date.'

const PER_PAGE = 25
const MAX_SEARCH = 100
const ROW = 'min-h-14 py-2'
const COLUMNS = 'grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[12rem_11rem_minmax(0,1fr)_auto]'
const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

const sentence = (log: ActivityLog) => `${ACTIONS[log.action].label}: ${log.target}`

function Skeleton() {
  return (
    <div role="status" aria-label="Loading activity logs" className="animate-pulse divide-y divide-line">
      {Array.from({ length: 8 }, (_, n) => (
        <div key={n} className={`${ROW} flex items-center gap-3`}>
          <div className="h-5 w-1/3 rounded-xl bg-line" />
          <div className="h-5 w-1/2 rounded-xl bg-line" />
        </div>
      ))}
    </div>
  )
}

function Details({ log, onClose }: { log: ActivityLog | null; onClose: () => void }) {
  return (
    <Modal variant="sheet" open={log !== null} onClose={onClose} title="Log entry">
      {log && (
        <dl className="grid gap-3 pb-5 text-sm">
          {[
            ['Action', ACTIONS[log.action].label],
            ['Category', CATEGORIES[log.category].label],
            ['User', log.actor],
            ['Done to', log.target],
            ...(log.detail ? [['Details', log.detail]] : []),
            ['When', formatPlacedAt(log.createdAt)],
            ['Entry ID', log.id],
          ].map(([term, value]) => (
            <div key={term}>
              <dt className="text-fg-muted">{term}</dt>
              <dd className="font-semibold break-words text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Modal>
  )
}

/** Every logged action, for admins. */
export function ActivityLogsPage() {
  useDocumentTitle('Activity logs — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const section = useSection(getActivityLogs)
  const [filters, setFilters] = useState<ActivityFilters>(NO_FILTERS)
  const [text, setText] = useState('')
  // The search applies as you type; the Search button applies it at once.
  const typed = useDebouncedValue(text)
  const [forced, setForced] = useState<string | null>(null)
  const needle = (forced ?? typed).trim().toLowerCase()
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<ActivityLog | null>(null)

  const logs = section.state.status === 'success' ? section.state.data : []
  const since = sinceOf(filters.range)
  const matched = logs.filter(
    (log) =>
      (filters.action === 'all' || log.action === filters.action) &&
      (filters.user === 'all' || log.actor === filters.user) &&
      (!since || day(log.createdAt) >= since) &&
      (!needle || [sentence(log), log.actor, log.detail ?? ''].some((part) => part.toLowerCase().includes(needle))),
  )
  const pageCount = Math.max(1, Math.ceil(matched.length / PER_PAGE))
  const current = Math.min(page, pageCount)
  const shown = matched.slice((current - 1) * PER_PAGE, current * PER_PAGE)

  return (
    <div className="grid gap-3">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="display text-2xl text-fg sm:text-3xl">Activity logs</h1>
          <SampleDataBadge reason="These entries are generated placeholders until the activity log backend is connected." />
        </div>
        <ActivityFilterBar
          filters={filters}
          users={[...new Set(logs.map((log) => log.actor))].sort()}
          onChange={(next) => {
            setFilters(next)
            setPage(1)
          }}
        />
      </header>
      <section aria-labelledby="activity-list" className={STAFF_SECTION}>
        <h2 id="activity-list" className="sr-only">
          Logged actions
        </h2>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            setForced(text)
            setPage(1)
          }}
          className="mb-3 flex gap-2"
        >
          <div className="relative max-w-80 min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setForced(null)
                setPage(1)
              }}
              maxLength={MAX_SEARCH}
              placeholder="Search"
              aria-label="Search activity logs by action, user or detail"
              autoComplete="off"
              spellCheck={false}
              className="font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas pr-11 pl-10 text-base text-fg placeholder:text-fg-muted"
            />
            {text && (
              <button
                type="button"
                onClick={() => {
                  setText('')
                  setForced(null)
                  setPage(1)
                }}
                aria-label="Clear search"
                className="absolute top-0 right-0 flex size-11 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:text-fg"
              >
                <XIcon />
              </button>
            )}
          </div>
          <button type="submit" className={`${PRIMARY_BUTTON_SM} shrink-0`}>
            Search
          </button>
        </form>
        <SectionBody section={section} what="the activity logs" skeleton={<Skeleton />}>
          {() =>
            matched.length === 0 ? (
              <EmptyNote>
                {logs.length === 0
                  ? 'No activity yet. Orders, payments, product changes and account changes are logged here.'
                  : 'No activity matches. Check the spelling, or reset the filters and clear the search.'}
              </EmptyNote>
            ) : (
              <>
                <div aria-hidden="true" className={`font-ui hidden gap-x-3 border-b border-line pb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase @3xl:grid ${COLUMNS}`}>
                  <span>Date</span>
                  <span>User</span>
                  <span>Action</span>
                  <span className="w-14" />
                </div>
                <ul aria-label="Logged actions" className="divide-y divide-line">
                  {shown.map((log) => (
                    <li key={log.id} className={`${ROW} grid items-center gap-x-3 ${COLUMNS}`}>
                      <p className="col-start-1 row-start-1 min-w-0 text-sm font-semibold text-fg @3xl:col-start-3">
                        {sentence(log)}
                        {log.detail && <span className="block text-xs font-normal text-fg-muted">{log.detail}</span>}
                      </p>
                      <p className="col-start-1 row-start-2 min-w-0 truncate text-xs text-fg-muted @3xl:col-start-2 @3xl:row-start-1 @3xl:text-sm @3xl:font-semibold @3xl:text-fg">
                        <span className="@3xl:hidden">by </span>
                        {log.actor}
                        <span className="@3xl:hidden"> · </span>
                        <time dateTime={log.createdAt} className="tabular-nums @3xl:hidden">
                          {formatPlacedAt(log.createdAt)}
                        </time>
                      </p>
                      <time dateTime={log.createdAt} className="hidden text-sm text-fg-muted tabular-nums @3xl:col-start-1 @3xl:row-start-1 @3xl:block">
                        {formatPlacedAt(log.createdAt)}
                      </time>
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        aria-label={`View ${sentence(log)}`}
                        onClick={() => setOpen(log)}
                        className={`${SECONDARY_BUTTON_SM} col-start-2 row-span-2 row-start-1 justify-self-end @3xl:col-start-4 @3xl:row-span-1`}
                      >
                        View
                      </button>
                    </li>
                  ))}
                </ul>
                <div className={PAGER_FOOTER}>
                  <Pagination
                    page={current}
                    pageCount={pageCount}
                    from={(current - 1) * PER_PAGE + 1}
                    to={Math.min(current * PER_PAGE, matched.length)}
                    total={matched.length}
                    onPage={setPage}
                  />
                </div>
              </>
            )
          }
        </SectionBody>
      </section>
      <Details log={open} onClose={() => setOpen(null)} />
    </div>
  )
}
