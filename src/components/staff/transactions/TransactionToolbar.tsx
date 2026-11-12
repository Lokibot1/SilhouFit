import { formatDay } from '../../../utils/format'
import { methodLabel, paymentStatusLabel } from '../../../utils/orders'
import { MAX_SEARCH, METHODS, PER_PAGE_OPTIONS, PROVIDERS, STATUSES, type TransactionDir, type TransactionQuery, type TransactionSort } from '../../../utils/transactionQuery'
import { ChevronDownIcon, SearchIcon, SpinnerIcon, XIcon } from '../../form/icons'
import { SECONDARY_BUTTON, SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { RangeCalendar } from '../../ui/RangeCalendar'
import { Select } from '../../ui/Select'
import { Tooltip } from '../../ui/Tooltip'

const RANGE_OPTIONS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
]
const STATUS_OPTIONS = [{ value: '', label: 'All statuses' }, ...STATUSES.map((value) => ({ value, label: paymentStatusLabel(value) }))]
const METHOD_OPTIONS = [{ value: '', label: 'All methods' }, ...METHODS.map((value) => ({ value, label: methodLabel(value) }))]
const PROVIDER_OPTIONS = [{ value: '', label: 'All providers' }, ...PROVIDERS]
const PER_PAGE_CHOICES = PER_PAGE_OPTIONS.map((n) => ({ value: n, label: `${n} per page` }))
const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'total-desc', label: 'Amount: high to low' },
  { value: 'total-asc', label: 'Amount: low to high' },
]

interface TransactionToolbarProps {
  text: string
  onText: (text: string) => void
  query: TransactionQuery
  /** `today` is the latest date the inputs accept (no order is dated later). */
  today: string
  onFilter: (changes: { range?: string; from?: string; to?: string; status?: string; method?: string; provider?: string }) => void
  onSort: (sort: TransactionSort, dir: TransactionDir) => void
  onPer: (per: number) => void
  onClear: () => void
  /** Why Export Excel is off (nothing to export, or too many to), or null when it can run. */
  exportBlock: string | null
  exporting: boolean
  onExport: () => void
}

export function TransactionToolbar({ text, onText, query, today, onFilter, onSort, onPer, onClear, exportBlock, exporting, onExport }: TransactionToolbarProps) {
  const active = Number(query.range !== '') + Number(query.status !== '') + Number(query.method !== '') + Number(query.provider !== '')
  // Choosing Custom keeps the list open and shows a calendar beside it, like a submenu; the chosen dates then show on the button.
  const rangeOptions = RANGE_OPTIONS.map((option) =>
    option.value === 'custom'
      ? {
          ...option,
          summary: query.from ? `${formatDay(query.from)} – ${query.to ? formatDay(query.to) : '…'}` : undefined,
          submenu: (done: () => void) => (
            <RangeCalendar autoFocus start={query.from} end={query.to} max={today} onChange={(from, to) => onFilter({ range: 'custom', from, to })} onClose={done} />
          ),
        }
      : option,
  )
  return (
    <div className="mb-3 grid gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
        <input
          type="text"
          value={text}
          onChange={(event) => onText(event.target.value)}
          maxLength={MAX_SEARCH}
          placeholder="Order, customer, email or reference"
          aria-label="Search transactions by order, customer, email or reference"
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
            <Select label="Date range" value={query.range} options={rangeOptions} onChange={(range) => onFilter({ range })} />
          </div>
          <div className="w-full @sm:w-48 @4xl:w-44">
            <Select label="Status" value={query.status} options={STATUS_OPTIONS} onChange={(status) => onFilter({ status })} />
          </div>
          <div className="w-full @sm:w-44 @4xl:w-40">
            <Select label="Payment method" value={query.method} options={METHOD_OPTIONS} onChange={(method) => onFilter({ method })} />
          </div>
          <div className="w-full @sm:w-44 @4xl:w-36">
            <Select label="Provider" value={query.provider} options={PROVIDER_OPTIONS} onChange={(provider) => onFilter({ provider })} />
          </div>
          <div className="w-full @sm:w-44 @4xl:w-36">
            <Select label="Rows per page" value={query.per} options={PER_PAGE_CHOICES} onChange={onPer} />
          </div>
          {active > 0 && (
            <button type="button" onClick={onClear} className={`${SECONDARY_BUTTON} text-sm`}>
              Clear filters
            </button>
          )}
          <div className="w-full @sm:w-auto @4xl:ml-auto [&>span]:w-full @sm:[&>span]:w-auto">
            <Tooltip label={exportBlock ?? 'Download every matching transaction as an Excel file'} describe>
              <button
                type="button"
                aria-disabled={exportBlock !== null || exporting}
                onClick={() => exportBlock === null && !exporting && onExport()}
                className={`${SECONDARY_BUTTON_SM} w-full`}
              >
                {exporting && <SpinnerIcon />}
                {exporting ? 'Exporting…' : 'Export Excel'}
              </button>
            </Tooltip>
          </div>
        </div>
      </details>
    </div>
  )
}
