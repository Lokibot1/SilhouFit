import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { EASE_OUT } from '../../../motion/tokens'
import { addDays, manilaToday } from '../../../utils/period'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '../../form/icons'
import { SelectField } from '../../staff/inventory/FormField'

const EDGE = 8
const GAP = 8
const FADE = { duration: 0.18, ease: EASE_OUT }
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

// Dates are "YYYY-MM-DD" strings with no zone, so they are read and shown as UTC.
const utc = (date: string) => new Date(`${date}T00:00:00Z`)
const show = (date: string, month: 'short' | 'long') => utc(date).toLocaleDateString('en-US', { timeZone: 'UTC', month, day: 'numeric', year: 'numeric' })
const monthTitle = (date: string) => utc(date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const firstOf = (date: string) => `${date.slice(0, 7)}-01`

/** The same day `by` months away, or the last day of that month when it is shorter. */
function moveMonths(date: string, by: number) {
  const next = utc(date)
  const day = next.getUTCDate()
  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + by)
  next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()))
  return next.toISOString().slice(0, 10)
}

interface DateRangeFieldProps {
  /** The id of the button that opens the calendar. The error is `${id}-error`. */
  id: string
  label: string
  /** "YYYY-MM-DD", or empty. */
  start: string
  end: string
  error?: string
  disabled?: boolean
  onChange: (start: string, end: string) => void
  /** The calendar was closed, so the field has been visited. */
  onBlur?: () => void
}

interface PopoverProps {
  id: string
  label: string
  anchor: HTMLElement
  start: string
  end: string
  /** The first day of the left-hand month. */
  month: string
  focus: string
  gridRef: RefObject<HTMLDivElement | null>
  onPick: (day: string) => void
  onShift: (by: number) => void
  onGridKey: (event: KeyboardEvent) => void
  onClose: () => void
}

// Fixed to the viewport (in a portal) like a tooltip, so the drawer around the field never clips it; it sits under the field, or above when
// there is no room, and stays inside the screen edges.
function Popover({ id, label, anchor, start, end, month, focus, gridRef, onPick, onShift, onGridKey, onClose }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ left: -9999, top: 0 })

  useLayoutEffect(() => {
    function position() {
      const rect = anchor.getBoundingClientRect()
      const box = ref.current!.getBoundingClientRect()
      const left = Math.min(Math.max(EDGE, rect.left), window.innerWidth - box.width - EDGE)
      const below = rect.bottom + GAP
      const top = below + box.height + EDGE <= window.innerHeight ? below : Math.max(EDGE, rect.top - GAP - box.height)
      setPlace({ left, top })
    }
    position()
    window.addEventListener('resize', position)
    document.addEventListener('scroll', position, true) // the drawer's body scrolls, the page does not
    return () => {
      window.removeEventListener('resize', position)
      document.removeEventListener('scroll', position, true)
    }
  }, [anchor, month])

  // A press anywhere else dismisses it, like a menu.
  useEffect(() => {
    function onPress(event: PointerEvent) {
      const target = event.target as Node
      if (!ref.current?.contains(target) && !anchor.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', onPress)
    return () => document.removeEventListener('pointerdown', onPress)
  }, [anchor, onClose])

  const lead = utc(month).getUTCDay()
  const dayCount = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
  const arrow = 'flex size-9 pointer-coarse:size-11 max-md:size-11 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:bg-fg/10 hover:text-fg'

  return createPortal(
    <motion.div
      ref={ref}
      id={id}
      role="group"
      aria-label={`Choose ${label.toLowerCase()}`}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1, transition: FADE }}
      exit={{ opacity: 0, scale: 0.98, transition: FADE }}
      style={place}
      className="font-ui fixed z-[100] w-max max-w-[calc(100vw-1rem)] rounded-xl border border-line-strong bg-canvas p-3 shadow-[0_12px_28px_-10px_rgb(var(--shadow-key)/var(--shadow-b))]"
    >
      <div ref={gridRef} onKeyDown={onGridKey} className="w-[min(18rem,calc(100vw-3.5rem))]">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={() => onShift(-1)} className={arrow}>
            <ChevronLeftIcon />
          </button>
          <p aria-live="polite" className="text-sm font-semibold text-fg">
            {monthTitle(month)}
          </p>
          <button type="button" aria-label="Next month" onClick={() => onShift(1)} className={arrow}>
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
            const banded = Boolean(end) && start !== end && day >= start && day <= end
            const edges = `${isStart || column === 0 ? 'rounded-l-xl' : ''} ${isEnd || column === 6 ? 'rounded-r-xl' : ''}`
            return (
              <div key={day} className={banded ? `bg-fg/10 ${edges}` : ''}>
                <button
                  type="button"
                  tabIndex={day === focus ? 0 : -1}
                  aria-label={show(day, 'long')}
                  aria-pressed={isStart || isEnd}
                  onClick={() => onPick(day)}
                  className={`flex h-9 pointer-coarse:h-11 max-md:h-11 w-full cursor-pointer items-center justify-center rounded-xl text-sm tabular-nums ${
                    isStart || isEnd ? 'bg-fg font-semibold text-canvas' : 'text-fg hover:bg-fg/10'
                  }`}
                >
                  {index + 1}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>,
    document.body,
  )
}

/**
 * One field for a start and end date. It shows the range; opening it floats a calendar of one month under the field (the arrows
 * change month) where the first click picks the first day and the second the last (a click on or before the first day, or after both are set,
 * starts over). Arrow keys move by day and week, PageUp and PageDown by month, Escape or a press outside closes, Tab closes and moves on.
 */
export function DateRangeField({ id, label, start, end, error, disabled, onChange, onBlur }: DateRangeFieldProps) {
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState(start || manilaToday().date)
  const [month, setMonth] = useState(firstOf(focus))
  const panelId = useId()
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const wantFocus = useRef(false)

  // Keyboard moves land on the day; clicking a month arrow leaves focus on the arrow.
  useEffect(() => {
    if (open && wantFocus.current) {
      wantFocus.current = false
      grid.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
    }
  }, [open, focus, month])

  /** Moves the focused day, and the calendar to its month if that is another one. */
  function goTo(day: string) {
    setFocus(day)
    setMonth(firstOf(day))
  }

  function shift(by: number) {
    setMonth(moveMonths(month, by))
    setFocus(moveMonths(focus, by))
  }

  function toggle() {
    if (open) return close()
    const day = start || manilaToday().date
    setFocus(day)
    setMonth(firstOf(day))
    wantFocus.current = true
    setOpen(true)
  }

  function close() {
    setOpen(false)
    trigger?.focus()
    onBlur?.()
  }

  function pick(day: string) {
    setFocus(day)
    if (!start || end || day < start) onChange(day, '')
    else {
      onChange(start, day)
      close()
    }
  }

  function onGridKey(event: KeyboardEvent) {
    if (event.key === 'Tab') return close()
    if (!(event.target as HTMLElement).hasAttribute('aria-pressed')) return // the month arrows keep their own keys
    const step = STEPS[event.key]
    if (step === undefined && event.key !== 'PageUp' && event.key !== 'PageDown') return
    event.preventDefault()
    wantFocus.current = true
    if (step !== undefined) goTo(addDays(focus, step))
    else shift(event.key === 'PageUp' ? -1 : 1)
  }

  const summary = start ? `${show(start, 'short')} – ${end ? show(end, 'short') : 'Select end date'}` : 'Select dates'

  return (
    <div
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation() // closes the calendar, not the drawer around it
          close()
        }
      }}
    >
      <SelectField label={label}>
        <button
          ref={setTrigger}
          id={id}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onClick={toggle}
          className={`font-ui flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl bg-transparent px-3 text-sm tabular-nums disabled:opacity-60 ${start ? 'text-fg' : 'text-fg-muted'}`}
        >
          <span className="sr-only">{label}: </span>
          {summary}
          <CalendarIcon className="shrink-0 text-fg-muted" />
        </button>
      </SelectField>
      {error && (
        <p id={`${id}-error`} className="px-1 pt-1 text-xs text-danger">
          {error}
        </p>
      )}
      <AnimatePresence>
        {open && trigger && (
          <Popover
            id={panelId}
            label={label}
            anchor={trigger}
            start={start}
            end={end}
            month={month}
            focus={focus}
            gridRef={grid}
            onPick={pick}
            onShift={shift}
            onGridKey={onGridKey}
            onClose={() => {
              setOpen(false)
              onBlur?.()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
