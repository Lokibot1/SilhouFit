import { AnimatePresence } from 'motion/react'
import { useId, useState } from 'react'
import { AlertIcon, CalendarIcon } from '../form/icons'
import { Popover } from '../ui/DateRangeField'
import { RangeCalendar } from '../ui/RangeCalendar'

interface BirthdayFieldProps {
  /** The text input's id; its error is `${id}-error`. */
  id: string
  label: string
  /** "YYYY-MM-DD", or empty (or what is half typed). */
  value: string
  /** The latest day that can be picked: today. */
  max: string
  error?: string
  readOnly?: boolean
  onChange: (value: string) => void
  onBlur: () => void
}

/** The profile's birthday: a typed "YYYY-MM-DD" field with a calendar (the shared one, in single-date mode) that opens under it. */
export function BirthdayField({ id, label, value, max, error, readOnly, onChange, onBlur }: BirthdayFieldProps) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null)
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null)
  const panelId = useId()
  const complete = /^\d{4}-\d{2}-\d{2}$/.test(value)

  function close() {
    setOpen(false)
    trigger?.focus()
    onBlur()
  }

  return (
    <div
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation() // closes the calendar, not the dialog around it
          close()
        }
      }}
    >
      <label htmlFor={id} className="font-kral-mono mb-1 block text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]">
        {label}
      </label>
      <div ref={setAnchor} className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          placeholder="YYYY-MM-DD"
          maxLength={10}
          value={value}
          max={max}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value.replace(/[^\d-]/g, ''))}
          onBlur={() => {
            if (!open) onBlur()
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="kral-focus font-kral-mono min-h-11 w-full rounded-none border border-kral-fg bg-transparent pr-12 pl-3 text-base text-kral-fg tabular-nums placeholder:text-kral-muted"
        />
        <button
          ref={setTrigger}
          type="button"
          disabled={readOnly}
          aria-label="Open birthday calendar"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => (open ? close() : setOpen(true))}
          className="kral-focus absolute top-0 right-0 flex size-11 cursor-pointer items-center justify-center text-kral-fg transition-colors duration-150 ease-out hover:bg-kral-fg/10 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        >
          <CalendarIcon />
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="font-kral-mono flex items-start gap-1.5 px-1 pt-1 text-base leading-snug text-kral-red-ink md:text-sm">
          <AlertIcon className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      <AnimatePresence>
        {open && anchor && (
          <Popover
            tone="kral"
            id={panelId}
            anchor={anchor}
            onClose={() => {
              setOpen(false)
              onBlur()
            }}
          >
            <RangeCalendar single autoFocus label="Choose your birthday" start={complete ? value : ''} end="" max={max} onChange={(day) => onChange(day)} onClose={close} />
          </Popover>
        )}
      </AnimatePresence>
    </div>
  )
}
