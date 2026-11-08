import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { formatDayWithYear } from '../../utils/format'
import { addDays, manilaToday } from '../../utils/period'
import { ChevronLeftIcon, ChevronRightIcon } from '../form/icons'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

// Dates are "YYYY-MM-DD" strings with no zone, so they are read and shown as UTC.
const utc = (date: string) => new Date(`${date}T00:00:00Z`)
const monthTitle = (date: string) => utc(date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const firstOf = (date: string) => `${date.slice(0, 7)}-01`
/** The day the calendar opens on when no start is chosen: today, or `max` if that is earlier. */
const opening = (max?: string) => (max && manilaToday().date > max ? max : manilaToday().date)

/** The same day `by` months away, or the last day of that month when it is shorter. */
function moveMonths(date: string, by: number) {
  const next = utc(date)
  const day = next.getUTCDate()
  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + by)
  next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()))
  return next.toISOString().slice(0, 10)
}

interface RangeCalendarProps {
  /** "YYYY-MM-DD", or empty. */
  start: string
  end: string
  /** The latest day that can be picked ("YYYY-MM-DD"); later days are dimmed and cannot be chosen. */
  max?: string
  /** The accessible name of the group. */
  label?: string
  /** Put keyboard focus on the highlighted day as soon as the calendar appears. */
  autoFocus?: boolean
  onChange: (start: string, end: string) => void
  /** The range is complete, or the person tabbed away. */
  onClose: () => void
  /** One date instead of a range, in the KRAL look: `start` is the value, a pick calls `onChange(day, '')` and closes, and the header has month and year selects plus Today and Clear. */
  single?: boolean
}

/**
 * A month calendar for choosing a range, with no frame or position of its own (a popover or a submenu holds it). The first click picks the
 * first day and the second the last; a click on or before the first day, or after both are set, starts over. The arrows change month. Arrow
 * keys move by day and week, PageUp and PageDown by month.
 */
export function RangeCalendar({ start, end, max, label = 'Choose dates', autoFocus, onChange, onClose, single = false }: RangeCalendarProps) {
  const [focus, setFocus] = useState(start || opening(max))
  const [month, setMonth] = useState(firstOf(focus))
  const grid = useRef<HTMLDivElement>(null)
  const wantFocus = useRef(Boolean(autoFocus))

  // Keyboard moves land on the day; clicking a month arrow leaves focus on the arrow.
  useEffect(() => {
    if (!wantFocus.current) return
    wantFocus.current = false
    grid.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  }, [focus, month])

  /** Moves the focused day, and the calendar to its month if that is another one. */
  function goTo(day: string) {
    if (max && day > max) return
    setFocus(day)
    setMonth(firstOf(day))
  }

  function shift(by: number) {
    const next = moveMonths(focus, by)
    setMonth(moveMonths(month, by))
    setFocus(max && next > max ? max : next)
  }

  /** Jumps to a month and year (the month and year selects), keeping the day where it fits and never passing `max`. */
  function jump(year: number, monthNumber: number) {
    const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
    const day = `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}-${String(Math.min(Number(focus.slice(8)), last)).padStart(2, '0')}`
    goTo(max && day > max ? max : day)
  }

  function pick(day: string) {
    setFocus(day)
    if (single) {
      onChange(day, '')
      onClose()
      return
    }
    if (!start || end || day < start) onChange(day, '')
    else {
      onChange(start, day)
      onClose()
    }
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      if (!single) return onClose()
      // A single-date calendar has more stops (selects, Today, Clear): it closes only when Tab leaves either end.
      const stops = [...(grid.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select') ?? [])].filter((el) => el.tabIndex >= 0)
      if (event.shiftKey ? event.target === stops[0] : event.target === stops[stops.length - 1]) onClose()
      return
    }
    if (!(event.target as HTMLElement).hasAttribute('aria-pressed')) return // the month arrows keep their own keys
    const step = STEPS[event.key]
    if (step === undefined && event.key !== 'PageUp' && event.key !== 'PageDown') return
    event.preventDefault()
    wantFocus.current = true
    if (step !== undefined) goTo(addDays(focus, step))
    else shift(event.key === 'PageUp' ? -1 : 1)
  }

  const lead = utc(month).getUTCDay()
  const dayCount = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
  const todayDay = opening(max)
  const maxYear = Number((max ?? manilaToday().date).slice(0, 4))
  const field = 'kral-focus font-kral-mono min-h-11 cursor-pointer rounded-none border border-kral-fg bg-kral-bg px-2 text-base text-kral-fg md:min-h-9 md:text-xs'
  const textBtn = 'kral-focus font-kral-mono flex min-h-11 cursor-pointer items-center px-3 text-base font-medium text-kral-fg uppercase hover:bg-kral-fg/10 md:min-h-9 md:text-xs md:tracking-[0.08em]'
  const arrow = single
    ? 'kral-focus flex size-11 md:size-9 cursor-pointer items-center justify-center text-kral-fg hover:bg-kral-fg/10 disabled:cursor-not-allowed disabled:opacity-40'
    : 'flex size-9 pointer-coarse:size-11 max-md:size-11 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:bg-fg/10 hover:text-fg'

  return (
    <div ref={grid} role="group" aria-label={label} onKeyDown={onKey} className={single ? 'font-kral-mono w-[min(19rem,calc(100vw-3.5rem))]' : 'font-ui w-[min(18rem,calc(100vw-3.5rem))]'}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className={arrow}>
          <ChevronLeftIcon />
        </button>
        {single ? (
          <div className="flex items-center gap-1">
            <select aria-label="Month" value={Number(month.slice(5, 7))} onChange={(e) => jump(Number(month.slice(0, 4)), Number(e.target.value))} className={field}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1} disabled={Boolean(max) && `${month.slice(0, 4)}-${String(i + 1).padStart(2, '0')}-01` > max!}>
                  {new Date(Date.UTC(2000, i, 1)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' })}
                </option>
              ))}
            </select>
            <select aria-label="Year" value={Number(month.slice(0, 4))} onChange={(e) => jump(Number(e.target.value), Number(month.slice(5, 7)))} className={`${field} tabular-nums`}>
              {Array.from({ length: 121 }, (_, i) => maxYear - i).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <span aria-live="polite" className="sr-only">
              {monthTitle(month)}
            </span>
          </div>
        ) : (
          <p aria-live="polite" className="text-sm font-semibold text-fg">
            {monthTitle(month)}
          </p>
        )}
        <button
          type="button"
          aria-label="Next month"
          disabled={Boolean(max) && firstOf(moveMonths(month, 1)) > max!}
          onClick={() => shift(1)}
          className={`${arrow} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronRightIcon />
        </button>
      </div>
      <div className={`grid grid-cols-7 text-center text-xs ${single ? 'text-kral-muted uppercase' : 'text-fg-muted'}`}>
        {WEEKDAYS.map((name) => (
          <span key={name} className="py-1">
            {name}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: lead }, (_, blank) => (
          <span key={`blank-${blank}`} />
        ))}
        {Array.from({ length: dayCount }, (_, index) => {
          const day = `${month.slice(0, 7)}-${String(index + 1).padStart(2, '0')}`
          const column = (lead + index) % 7
          const isStart = day === start
          const isEnd = day === end
          const tooLate = Boolean(max) && day > max!
          const banded = Boolean(end) && start !== end && day >= start && day <= end
          const edges = `${isStart || column === 0 ? 'rounded-l-xl' : ''} ${isEnd || column === 6 ? 'rounded-r-xl' : ''}`
          return (
            <div key={day} className={banded ? `bg-fg/10 ${edges}` : ''}>
              <button
                type="button"
                disabled={tooLate}
                tabIndex={day === focus ? 0 : -1}
                aria-label={formatDayWithYear(day, 'long')}
                aria-pressed={isStart || isEnd}
                onClick={() => pick(day)}
                className={`flex h-9 pointer-coarse:h-11 max-md:h-11 w-full cursor-pointer items-center justify-center text-sm tabular-nums disabled:cursor-not-allowed ${
                  single
                    ? `kral-focus rounded-none text-kral-fg ${tooLate ? 'opacity-40' : isStart ? 'bg-kral-fg font-medium text-kral-bg' : `hover:bg-kral-fg/10 ${day === todayDay ? 'outline outline-1 -outline-offset-1 outline-kral-muted' : ''}`}`
                    : `rounded-xl ${tooLate ? 'text-fg-muted opacity-40' : isStart || isEnd ? 'bg-fg font-semibold text-canvas' : 'text-fg hover:bg-fg/10'}`
                }`}
              >
                {index + 1}
              </button>
            </div>
          )
        })}
      </div>
      {single && (
        <div className="mt-2 flex items-center justify-between border-t border-kral-rule pt-2">
          <button type="button" onClick={() => pick(todayDay)} className={textBtn}>
            Today
          </button>
          <button
            type="button"
            onClick={() => {
              onChange('', '')
              onClose()
            }}
            className={textBtn}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
