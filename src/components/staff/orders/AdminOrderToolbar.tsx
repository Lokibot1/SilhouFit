import { ORDER_STATUSES, PAYMENT_STATUSES, type OrderStatus, type PaymentStatus } from '../../../service/ordersApi'
import { formatDay } from '../../../utils/format'
import { paymentStatusLabel, STATUS_CHIP } from '../../../utils/orders'
import { MAX_SEARCH, PER_PAGE_OPTIONS, type TransactionQuery } from '../../../utils/transactionQuery'
import { ChevronDownIcon, SearchIcon, XIcon } from '../../form/icons'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { RangeCalendar } from '../../ui/RangeCalendar'
import { Select } from '../../ui/Select'

const RANGE_OPTIONS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
]
const STATUS_OPTIONS = [{ value: '', label: 'All statuses' }, ...ORDER_STATUSES.map((value) => ({ value: value as OrderStatus | '', label: STATUS_CHIP[value].label }))]
const PAYMENT_OPTIONS = [{ value: '', label: 'All payments' }, ...PAYMENT_STATUSES.map((value) => ({ value: value as PaymentStatus | '', label: paymentStatusLabel(value) }))]
const PER_PAGE_CHOICES = PER_PAGE_OPTIONS.map((n) => ({ value: n, label: `${n} per page` }))

interface AdminOrderToolbarProps {
  text: string
  onText: (text: string) => void
  /** The date range and page size, read from the URL. */
  query: Pick<TransactionQuery, 'range' | 'from' | 'to' | 'per'>
  status: OrderStatus | ''
  payment: PaymentStatus | ''
  /** `today` is the latest date the inputs accept. */
  today: string
  onFilter: (changes: { range?: string; from?: string; to?: string; status?: string; payment?: string }) => void
  onPer: (per: number) => void
  onClear: () => void
}

export function AdminOrderToolbar({ text, onText, query, status, payment, today, onFilter, onPer, onClear }: AdminOrderToolbarProps) {
  const active = Number(query.range !== '') + Number(status !== '') + Number(payment !== '')
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
          placeholder="Order, name or email"
          aria-label="Search orders by order number, customer name or email"
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
            <Select label="Order status" value={status} options={STATUS_OPTIONS} onChange={(next) => onFilter({ status: next })} />
          </div>
          <div className="w-full @sm:w-48 @4xl:w-44">
            <Select label="Payment status" value={payment} options={PAYMENT_OPTIONS} onChange={(next) => onFilter({ payment: next })} />
          </div>
          <div className="w-full @sm:w-44 @4xl:w-36">
            <Select label="Rows per page" value={query.per} options={PER_PAGE_CHOICES} onChange={onPer} />
          </div>
          {active > 0 && (
            <button type="button" onClick={onClear} className={`${SECONDARY_BUTTON} text-sm`}>
              Clear filters
            </button>
          )}
        </div>
      </details>
    </div>
  )
}
