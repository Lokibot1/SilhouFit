import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EASE_OUT } from '../../motion/tokens'
import { CalendarIcon } from '../form/icons'
import { SelectField } from '../staff/inventory/FormField'
import { formatDayWithYear } from '../../utils/format'
import { RangeCalendar } from './RangeCalendar'

const EDGE = 8
const GAP = 8
const FADE = { duration: 0.18, ease: EASE_OUT }

interface PopoverProps {
  id: string
  anchor: HTMLElement
  onClose: () => void
  children: ReactNode
  /** 'kral' draws the panel flat and square with a hairline, for the KRAL pages. */
  tone?: 'kral'
}

// Fixed to the viewport (in a portal) like a tooltip, so the drawer around the field never clips it; it sits under the field, or above when
// there is no room, and stays inside the screen edges.
export function Popover({ id, anchor, onClose, children, tone }: PopoverProps) {
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
    // A month with six weeks is taller than one with five.
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position)
    resize?.observe(ref.current!)
    window.addEventListener('resize', position)
    document.addEventListener('scroll', position, true) // the drawer's body scrolls, the page does not
    return () => {
      resize?.disconnect()
      window.removeEventListener('resize', position)
      document.removeEventListener('scroll', position, true)
    }
  }, [anchor])

  // A press anywhere else dismisses it, like a menu.
  useEffect(() => {
    function onPress(event: PointerEvent) {
      const target = event.target as Node
      if (!ref.current?.contains(target) && !anchor.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', onPress)
    return () => document.removeEventListener('pointerdown', onPress)
  }, [anchor, onClose])

  return createPortal(
    <motion.div
      ref={ref}
      id={id}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1, transition: FADE }}
      exit={{ opacity: 0, scale: 0.98, transition: FADE }}
      style={place}
      className={`fixed z-(--z-popover) w-max max-w-[calc(100vw-1rem)] border p-3 ${tone === 'kral' ? 'rounded-none border-kral-fg bg-kral-bg' : 'rounded-xl border-line-strong bg-canvas shadow-popover'}`}
    >
      {children}
    </motion.div>,
    document.body,
  )
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

/**
 * One field for a start and end date. It shows the range; opening it floats a calendar under the field (see RangeCalendar for how it is
 * used). Escape or a press outside closes it, and so does finishing the range or pressing Tab.
 */
export function DateRangeField({ id, label, start, end, error, disabled, onChange, onBlur }: DateRangeFieldProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null)

  function close() {
    setOpen(false)
    trigger?.focus()
    onBlur?.()
  }

  const summary = start ? `${formatDayWithYear(start)} – ${end ? formatDayWithYear(end) : 'Select end date'}` : 'Select dates'

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
          onClick={() => (open ? close() : setOpen(true))}
          className={`font-ui flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl bg-transparent px-3 text-sm tabular-nums disabled:opacity-60 ${
            start ? 'text-fg' : 'text-fg-muted'
          }`}
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
            anchor={trigger}
            onClose={() => {
              setOpen(false)
              onBlur?.()
            }}
          >
            <RangeCalendar autoFocus label={`Choose ${label.toLowerCase()}`} start={start} end={end} onChange={onChange} onClose={close} />
          </Popover>
        )}
      </AnimatePresence>
    </div>
  )
}
