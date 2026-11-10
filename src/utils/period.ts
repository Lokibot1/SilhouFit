import { formatDay } from './format'

// The dashboard's per-card time filter. Dates are YYYY-MM-DD in Asia/Manila; calendar math runs on UTC dates so the
// machine's own zone never leaks in (same trick as formatDay).

export type Period = 'day' | 'week' | 'month' | 'quarter' | 'year'
export interface PeriodFilterValue {
  period: Period
  year: number
  /** 1 to 12. Narrows the Sales chart to that month; nothing else reads it. */
  month?: number
}
/** What one point of the sales chart stands for. It is the same as the chosen period. */
export type Granularity = Period

export interface ResolvedPeriod {
  /** Inclusive. `end < start` means nothing to show (a year that has not begun). */
  start: string
  end: string
  /** Where the figures are from, for descriptions and summaries: "October 2026". */
  scope: string
  /** Fills "No orders ___.": "this month". */
  when: string
  /** The selected year is the current one, so the period is still running. */
  isCurrent: boolean
}

export const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
]
export const SALES_NOUN: Record<Granularity, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' }
const ANALYTICS_YEARS_BACK = 2

const pad = (n: number) => String(n).padStart(2, '0')
const utc = (date: string) => new Date(`${date}T00:00:00Z`)

/** Now in Asia/Manila (no daylight saving). */
export function manilaToday(now = new Date()) {
  const stamp = now.toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }) // "2026-10-22 15:45:12"
  return { date: stamp.slice(0, 10), minutes: Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16)), year: Number(stamp.slice(0, 4)) }
}

export function addDays(date: string, days: number) {
  const next = utc(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

/** The Monday on or before `date`. */
export const mondayOf = (date: string) => addDays(date, -((utc(date).getUTCDay() + 6) % 7))

const monthName = (date: string) => utc(date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long' })

/** "Oct 19 to 23", or "Oct 28 to Nov 3" across a month. */
function dayRange(start: string, end: string) {
  if (start === end) return formatDay(start)
  return start.slice(0, 7) === end.slice(0, 7) ? `${formatDay(start)} to ${Number(end.slice(8))}` : `${formatDay(start)} to ${formatDay(end)}`
}

/** [this year, last year, the year before]: how far back the dashboard looks. */
export const yearOptions = (now?: Date) => {
  const { year } = manilaToday(now)
  return Array.from({ length: ANALYTICS_YEARS_BACK + 1 }, (_, n) => year - n)
}

export const defaultFilter = (now?: Date): PeriodFilterValue => ({ period: 'month', year: manilaToday(now).year })

/**
 * The latest day, week, month or quarter inside the year, or the whole year. In the current year that runs up to
 * today; in a past year it is the last one (Dec 31, the week holding it, December, Q4).
 */
export function resolvePeriod({ period, year }: PeriodFilterValue, now?: Date): ResolvedPeriod {
  const today = manilaToday(now)
  if (year > today.year) return { start: `${year}-01-01`, end: `${year - 1}-12-31`, scope: String(year), when: `in ${year}`, isCurrent: false }

  const isCurrent = year === today.year
  const end = isCurrent ? today.date : `${year}-12-31`
  const base = { isCurrent }
  const first = `${year}-01-01`
  switch (period) {
    case 'day':
      return { ...base, start: end, end, scope: isCurrent ? `Today, ${formatDay(end)}` : `${formatDay(end)}, ${year}`, when: isCurrent ? 'today' : `on ${formatDay(end)}, ${year}` }
    case 'week': {
      const monday = mondayOf(end)
      const start = monday < first ? first : monday
      return { ...base, start, end, scope: dayRange(start, end), when: isCurrent ? 'this week' : `on ${dayRange(start, end)}, ${year}` }
    }
    case 'month': {
      const start = `${end.slice(0, 7)}-01`
      return { ...base, start, end, scope: `${monthName(end)} ${year}`, when: isCurrent ? 'this month' : `in ${monthName(end)} ${year}` }
    }
    case 'quarter': {
      const quarter = Math.floor((Number(end.slice(5, 7)) - 1) / 3)
      return {
        ...base,
        start: `${year}-${pad(quarter * 3 + 1)}-01`,
        end,
        scope: isCurrent ? `Q${quarter + 1} ${year} so far` : `Q${quarter + 1} ${year}`,
        when: isCurrent ? 'this quarter' : `in Q${quarter + 1} ${year}`,
      }
    }
    case 'year':
      return { ...base, start: first, end, scope: isCurrent ? `${year} so far` : String(year), when: isCurrent ? 'this year' : `in ${year}` }
  }
}

/** One line under a card title: "Daily totals · October 2026". Never longer than 38 characters, so it never wraps. */
export const describe = (filter: PeriodFilterValue, subject: string, now?: Date) => `${subject} · ${resolvePeriod(filter, now).scope}`

export interface SalesWindow {
  /** Inclusive dates. */
  start: string
  end: string
  /** What one point stands for: the selected filter. */
  granularity: Granularity
  /** The span is one month, so a week is week 1 to 4 of it rather than a Monday-to-Sunday week. */
  inMonth: boolean
  scope: string
  /** Fills "No orders ___.". */
  when: string
}

/**
 * The span of the Sales chart, whose filter sets the size of each point. Day covers the latest month of the year,
 * week, month and quarter cover the year, and year covers the chosen year and the two before it. The current year
 * runs to today; a past year is complete.
 */
export function resolveSalesWindow({ period, year, month }: PeriodFilterValue, now?: Date): SalesWindow {
  const today = manilaToday(now)
  const isCurrent = year === today.year
  const end = isCurrent ? today.date : `${year}-12-31`
  if (month) {
    const first = `${year}-${pad(month)}-01`
    const last = `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`
    const label = `${monthName(first)} ${year}`
    const running = isCurrent && today.date.startsWith(first.slice(0, 7))
    // Only days and weeks make sense inside a month.
    return { start: first, end: last < end ? last : end, granularity: period === 'week' ? 'week' : 'day', inMonth: true, scope: label, when: running ? 'this month' : `in ${label}` }
  }
  if (period === 'year') return { start: `${year - ANALYTICS_YEARS_BACK}-01-01`, end, granularity: period, inMonth: false, scope: `${year - ANALYTICS_YEARS_BACK} to ${year}`, when: `from ${year - ANALYTICS_YEARS_BACK} to ${year}` }
  if (period === 'day') {
    const month = `${monthName(end)} ${year}`
    return { start: `${end.slice(0, 7)}-01`, end, granularity: period, inMonth: false, scope: month, when: isCurrent ? 'this month' : `in ${month}` }
  }
  return { start: `${year}-01-01`, end, granularity: period, inMonth: false, scope: isCurrent ? `${year} so far` : String(year), when: isCurrent ? 'this year' : `in ${year}` }
}

/** The Sales card's description: "Monthly totals · 2026 so far". Within 38 characters, like `describe`. */
export const describeSales = (filter: PeriodFilterValue, now?: Date) => `${SALES_NOUN[filter.period]} totals · ${resolveSalesWindow(filter, now).scope}`
