import { MAX_SEARCH, PER_PAGE_OPTIONS, type TransactionDir, type TransactionQuery, type TransactionSort } from '../../../utils/transactionQuery'
import { ChevronDownIcon, SearchIcon, SpinnerIcon, XIcon } from '../../form/icons'
import { SECONDARY_BUTTON, SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { Select } from '../../ui/Select'
import { Tooltip } from '../../ui/Tooltip'

const RANGE_OPTIONS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
]
const PER_PAGE_CHOICES = PER_PAGE_OPTIONS.map((n) => ({ value: n, label: `${n} per page` }))
const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'total-desc', label: 'Total: high to low' },
  { value: 'total-asc', label: 'Total: low to high' },
  { value: 'customer-asc', label: 'Customer: A to Z' },
  { value: 'customer-desc', label: 'Customer: Z to A' },
]
const DATE_INPUT =
  'font-ui min-h-9 pointer-coarse:min-h-11 min-w-0 flex-1 @sm:flex-none rounded-xl border border-line-strong bg-canvas px-3 text-sm text-fg scheme-light dark:scheme-dark'

interface TransactionToolbarProps {
  text: string
  onText: (text: string) => void
  query: TransactionQuery
  /** `today` is the latest date the inputs accept (no order is dated later). */
  today: string
  onFilter: (changes: { range?: string; from?: string; to?: string }) => void
  onSort: (sort: TransactionSort, dir: TransactionDir) => void
  onPer: (per: number) => void
  onClear: () => void
  /** Whether any transaction matches, so there is something to export. */
  canExport: boolean
  exporting: boolean
  onExport: () => void
}

export function TransactionToolbar({ text, onText, query, today, onFilter, onSort, onPer, onClear, canExport, exporting, onExport }: TransactionToolbarProps) {
  const active = Number(query.range !== '')
  return (
    <div className="mb-3 grid gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
        <input
          type="text"
          value={text}
          onChange={(event) => onText(event.target.value)}
          maxLength={MAX_SEARCH}
          placeholder="Order or customer"
          aria-label="Search transactions by order number or customer name"
          autoComplete="off"
          spellCheck={false}
          className="font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas pr-11 pl-10 text-base text-fg placeholder:text-fg-muted"
        />
        {text && (
          <button
            type="button"
            onClick={() => onText('')}
            aria-label="Clear search"
            className="absolute top-0 right-0 flex size-11 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:text-fg"
          >
            <XIcon />
          </button>
        )}
      </div>
      <div className="@4xl:hidden">
        <Select
          label="Sort by"
          triggerPrefix="Sort by: "
          value={`${query.sort}-${query.dir}`}
          options={SORT_OPTIONS}
          onChange={(value) => onSort(...(value.split('-') as [TransactionSort, TransactionDir]))}
        />
      </div>
      {/* Below the card's @4xl the filters fold away under the summary; from there the summary is hidden and they always show. */}
      <details className="group [&::details-content]:@4xl:[content-visibility:visible]">
        <summary className="font-ui flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-line-strong px-3 text-base font-semibold text-fg @4xl:hidden [&::-webkit-details-marker]:hidden">
          Filters ({active})
          <ChevronDownIcon className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 flex flex-wrap items-center gap-3 @4xl:mt-0">
          <div className="w-full @sm:w-48 @4xl:w-40">
            <Select label="Date range" value={query.range} options={RANGE_OPTIONS} onChange={(range) => onFilter({ range })} />
          </div>
          {query.range === 'custom' && (
            <>
              <label className="flex w-full items-center gap-2 text-sm text-fg-muted @sm:w-auto">
                <span className="w-9 @sm:w-auto">From</span>
                <input
                  type="date"
                  value={query.from}
                  max={query.to || today}
                  onChange={(event) => onFilter({ range: 'custom', from: event.target.value })}
                  className={DATE_INPUT}
                />
              </label>
              <label className="flex w-full items-center gap-2 text-sm text-fg-muted @sm:w-auto">
                <span className="w-9 @sm:w-auto">To</span>
                <input
                  type="date"
                  value={query.to}
                  min={query.from || undefined}
                  max={today}
                  onChange={(event) => onFilter({ range: 'custom', to: event.target.value })}
                  className={DATE_INPUT}
                />
              </label>
            </>
          )}
          <div className="w-full @sm:w-44 @4xl:w-36">
            <Select label="Rows per page" value={query.per} options={PER_PAGE_CHOICES} onChange={onPer} />
          </div>
          {active > 0 && (
            <button type="button" onClick={onClear} className={`${SECONDARY_BUTTON} text-sm`}>
              Clear filters
            </button>
          )}
          <div className="w-full @sm:w-auto @4xl:ml-auto [&>span]:w-full @sm:[&>span]:w-auto">
            <Tooltip label={canExport ? 'Download every matching transaction as a CSV file' : 'There are no transactions to export'} describe>
              <button
                type="button"
                aria-disabled={!canExport || exporting}
                onClick={() => canExport && !exporting && onExport()}
                className={`${SECONDARY_BUTTON_SM} w-full`}
              >
                {exporting && <SpinnerIcon />}
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </Tooltip>
          </div>
        </div>
      </details>
    </div>
  )
}
