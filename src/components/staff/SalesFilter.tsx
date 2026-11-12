import { useEffect, useId, useRef, useState } from 'react'
import { manilaToday, yearOptions } from '../../utils/period'
import { ChevronDownIcon } from '../form/icons'
import { SECONDARY_BUTTON_SM } from '../ui/buttonStyles'
import { Select } from '../ui/Select'
import { YEAR_BOX } from './PeriodFilter'

/** The Sales card's own narrowing. `null` means no filter: every month, and the current year. */
export interface SalesScope {
  month: number | null
  year: number | null
}

const MONTHS = Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(2000, m, 1)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long' }))

const triggerText = ({ month, year }: SalesScope, idle: string) => {
  if (month && year) return `${MONTHS[month - 1].slice(0, 3)} ${year}`
  if (month) return MONTHS[month - 1].slice(0, 3)
  return year ? String(year) : idle
}

/** A button that opens a small panel with a month and a year; either, both, or neither narrows the chart. */
export function SalesFilter({ value, onChange, name = 'Sales', idle = 'Filter', className = YEAR_BOX }: { value: SalesScope; onChange: (value: SalesScope) => void; name?: string; idle?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const today = manilaToday()
  const shownYear = value.year ?? today.year
  // The running year has no future months to look at.
  const monthCount = shownYear === today.year ? Number(today.date.slice(5, 7)) : 12

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Element
      // The lists of the two selects sit in the page body, not in this panel.
      if (!root.current?.contains(target) && !target.closest('[role="listbox"]')) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const pickYear = (year: number) => {
    const picked = year || null
    const limit = (picked ?? today.year) === today.year ? Number(today.date.slice(5, 7)) : 12
    onChange({ year: picked, month: value.month && value.month > limit ? null : value.month })
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${name} filter, ${value.month || value.year ? triggerText(value, idle) : 'none'}`}
        onClick={() => setOpen((was) => !was)}
        className="skeuo font-ui flex h-full w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 text-sm font-semibold"
      >
        <span className="truncate">{triggerText(value, idle)}</span>
        <ChevronDownIcon className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={`${name} filter`}
          // Under the selects' lists (z-85), which open from inside this panel.
          className="absolute top-full right-0 z-[80] mt-2 flex w-56 flex-col gap-3 rounded-xl border border-line-strong bg-canvas-raised p-3 text-fg shadow-popover"
        >
          <div className="flex flex-col gap-1">
            <span className="font-ui text-xs font-medium text-fg-muted">Month</span>
            <Select
              label={`${name} month`}
              value={value.month ?? 0}
              options={[{ value: 0, label: 'All months' }, ...MONTHS.slice(0, monthCount).map((label, m) => ({ value: m + 1, label }))]}
              onChange={(month) => onChange({ ...value, month: month || null })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-ui text-xs font-medium text-fg-muted">Year</span>
            <Select
              label={`${name} year`}
              value={value.year === today.year ? 0 : (value.year ?? 0)}
              options={[{ value: 0, label: 'Current year' }, ...yearOptions().slice(1).map((year) => ({ value: year, label: String(year) }))]}
              onChange={pickYear}
            />
          </div>
          <button type="button" onClick={() => onChange({ month: null, year: null })} className={SECONDARY_BUTTON_SM}>
            Clear filter
          </button>
        </div>
      )}
    </div>
  )
}
