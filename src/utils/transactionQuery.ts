import { PAYMENT_STATUSES, type PaymentStatus } from '../service/ordersApi'
import { humanize } from './orders'
import type { SalesScope } from '../components/staff/SalesFilter'
import { addDays, manilaToday } from './period'

export const TRANSACTION_SORTS = ['date', 'total'] as const
export type TransactionSort = (typeof TRANSACTION_SORTS)[number]
export type TransactionDir = 'asc' | 'desc'

/** The API's `sortBy` for each URL sort. */
export const SORT_COLUMN = { date: 'createdAt', total: 'amount' } as const
/** The way a column sorts when first chosen: newest first, biggest first. */
export const DEFAULT_DIR: Record<TransactionSort, TransactionDir> = { date: 'desc', total: 'desc' }

export const PER_PAGE_OPTIONS = [10, 25, 50]
const DEFAULT_PER_PAGE = 25
export const MAX_SEARCH = 100

export const RANGES = ['today', 'week', 'month', 'year', 'custom'] as const
export type TransactionRange = (typeof RANGES)[number]

export const STATUSES = PAYMENT_STATUSES
export type TransactionStatus = PaymentStatus

/** The API's PaymentMethod values, in the order the Method filter lists them. */
export const METHODS = ['GCASH', 'PAYMAYA', 'CARD', 'GRAB_PAY', 'BILLEASE', 'OTHER'] as const
export type TransactionMethod = (typeof METHODS)[number]

/** The gateways, as the API names them (it matches any case). */
export const PROVIDERS = [
  { value: 'paymongo', label: 'PayMongo' },
  { value: 'xendit', label: 'Xendit' },
] as const
/** A gateway's name as staff read it; one not listed falls back to its own name, humanized. */
export const providerLabel = (provider: string) => PROVIDERS.find((p) => p.value === provider.toLowerCase())?.label ?? humanize(provider)

export interface TransactionQuery {
  /** Order number, customer name or email, or gateway reference (a full order ID lists that order's payments). */
  q: string
  /** The date preset; '' lists all time. */
  range: TransactionRange | ''
  /** YYYY-MM-DD in Asia/Manila. Only kept with `range=custom`; '' is open-ended. */
  from: string
  to: string
  /** The payment's status; '' lists every one. */
  status: TransactionStatus | ''
  method: TransactionMethod | ''
  provider: (typeof PROVIDERS)[number]['value'] | ''
  sort: TransactionSort
  dir: TransactionDir
  page: number
  per: number
}

const isRealDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

/** Reads the transactions URL. Anything not on a whitelist falls back to its default, so a hand-edited URL cannot reach the API. */
export function readTransactionQuery(params: URLSearchParams): TransactionQuery {
  const sort = TRANSACTION_SORTS.find((s) => s === params.get('sort')) ?? 'date'
  const dir = params.get('dir')
  const page = Math.trunc(Number(params.get('page')))
  const per = Number(params.get('per'))
  const range = RANGES.find((r) => r === params.get('range')) ?? ''
  const read = (key: string) => {
    const value = params.get(key) ?? ''
    return range === 'custom' && isRealDate(value) ? value : ''
  }
  let from = read('from')
  let to = read('to')
  // A range that ends before it starts is dropped whole.
  if (from && to && from > to) from = to = ''
  return {
    q: (params.get('q') ?? '').trim().slice(0, MAX_SEARCH),
    range,
    from,
    to,
    status: STATUSES.find((v) => v === params.get('status')) ?? '',
    method: METHODS.find((v) => v === params.get('method')) ?? '',
    provider: PROVIDERS.find((v) => v.value === params.get('provider'))?.value ?? '',
    sort,
    dir: dir === 'asc' || dir === 'desc' ? dir : DEFAULT_DIR[sort],
    page: Number.isFinite(page) && page > 1 ? page : 1,
    per: PER_PAGE_OPTIONS.includes(per) ? per : DEFAULT_PER_PAGE,
  }
}

/** The inclusive dates the API is asked for. A preset is worked out from today in Asia/Manila; a custom range may leave either end open. */
export function rangeDates({ range, from, to }: Pick<TransactionQuery, 'range' | 'from' | 'to'>, now?: Date): { from?: string; to?: string } {
  const today = manilaToday(now).date
  switch (range) {
    case 'today':
      return { from: today, to: today }
    case 'week':
      return { from: addDays(today, -6), to: today }
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today }
    case 'custom':
      return { from: from || undefined, to: to || undefined }
    default:
      return {}
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The dates a month and/or year pick stands for: a whole year, a whole month, or that month of the running Manila year, never past today. `null` when neither is set. */
export function monthYearDates({ month, year }: SalesScope, now?: Date): { from: string; to: string } | null {
  if (!month && !year) return null
  const today = manilaToday(now)
  const y = year ?? today.year
  const last = month ? `${y}-${pad(month)}-${pad(new Date(Date.UTC(y, month, 0)).getUTCDate())}` : `${y}-12-31`
  return { from: `${y}-${pad(month ?? 1)}-01`, to: last < today.date ? last : today.date }
}

/** The month and year a custom range spans exactly (a whole year, or a whole month; the running one up to today), else no scope. */
export function scopeOfRange(from: string, to: string, now?: Date): SalesScope {
  const year = Number(from.slice(0, 4))
  const month = Number(from.slice(5, 7))
  for (const scope of [{ month: null, year }, { month, year }]) {
    const span = monthYearDates(scope, now)
    if (span?.from === from && span.to === to) return scope
  }
  return { month: null, year: null }
}

// Changing what is listed starts again from the first page; paging and sorting keep the page they are on.
const RESETS_PAGE = ['q', 'range', 'from', 'to', 'status', 'method', 'provider', 'per']

/** The URL after `changes` (an empty value removes its key). Search, date and page size writes reset the page; a preset other than custom drops from and to. */
export function withTransactionParams(current: URLSearchParams, changes: Partial<Record<string, string>>): URLSearchParams {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value)
    else next.delete(key)
  }
  if ('range' in changes && changes.range !== 'custom') {
    next.delete('from')
    next.delete('to')
  }
  if (Object.keys(changes).some((key) => RESETS_PAGE.includes(key)) && !('page' in changes)) next.delete('page')
  return next
}
