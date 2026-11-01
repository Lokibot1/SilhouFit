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
}

/**
 * A month calendar for choosing a range, with no frame or position of its own (a popover or a submenu holds it). The first click picks the
 * first day and the second the last; a click on or before the first day, or after both are set, starts over. The arrows change month. Arrow
 * keys move by day and week, PageUp and PageDown by month.
 */
export function RangeCalendar({ start, end, max, label = 'Choose dates', autoFocus, onChange, onClose }: RangeCalendarProps) {
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

  function pick(day: string) {
    setFocus(day)
    if (!start || end || day < start) onChange(day, '')
    else {
      onChange(start, day)
      onClose()
    }
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Tab') return onClose()
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
  const arrow = 'flex size-9 pointer-coarse:size-11 max-md:size-11 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:bg-fg/10 hover:text-fg'

  return (
    <div ref={grid} role="group" aria-label={label} onKeyDown={onKey} className="font-ui w-[min(18rem,calc(100vw-3.5rem))]">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className={arrow}>
          <ChevronLeftIcon />
        </button>
        <p aria-live="polite" className="text-sm font-semibold text-fg">
          {monthTitle(month)}
        </p>
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
      <div className="grid grid-cols-7 text-center text-xs text-fg-muted">
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
                className={`flex h-9 pointer-coarse:h-11 max-md:h-11 w-full cursor-pointer items-center justify-center rounded-xl text-sm tabular-nums disabled:cursor-not-allowed ${
                  tooLate ? 'text-fg-muted opacity-40' : isStart || isEnd ? 'bg-fg font-semibold text-canvas' : 'text-fg hover:bg-fg/10'
                }`}
              >
                {index + 1}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
