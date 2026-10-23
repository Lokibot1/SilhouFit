import { useId, useRef, type KeyboardEvent } from 'react'
import { PERIODS, yearOptions, type PeriodFilterValue } from '../../utils/period'
import { Select } from '../ui/Select'

// Shared with the skeleton so a card's header is the same height loading and loaded. Narrow tiles stack title and
// year, the description, then the segments; tiles from 672px put the segments and year beside the title block.
export const FILTER_HEAD = 'mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 @2xl:grid-cols-[minmax(0,1fr)_auto_auto]'
export const FILTER_DESCRIPTION = 'col-span-full h-4 @2xl:col-span-1'
const CONTROL_HEIGHT = 'h-9 pointer-coarse:h-11'
export const SEGMENTS_BOX = `col-span-full ${CONTROL_HEIGHT} @2xl:col-span-1 @2xl:col-start-2 @2xl:row-span-2 @2xl:row-start-1 @2xl:w-80`
export const YEAR_BOX = `w-24 ${CONTROL_HEIGHT} @2xl:col-start-3 @2xl:row-span-2 @2xl:row-start-1`

interface FilterProps {
  /** The card's name, for the controls' accessible names. */
  name: string
  value: PeriodFilterValue
  onChange: (value: PeriodFilterValue) => void
}

/** Day | Week | Month | Quarter | Year as one radio group. Arrow keys move focus and select, as radios do. */
export function PeriodSegments({ name, value, onChange }: FilterProps) {
  const labelId = useId()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent, index: number) {
    const target = { ArrowLeft: index - 1, ArrowUp: index - 1, ArrowRight: index + 1, ArrowDown: index + 1, Home: 0, End: PERIODS.length - 1 }[event.key]
    if (target === undefined) return
    event.preventDefault()
    const next = (target + PERIODS.length) % PERIODS.length
    buttons.current[next]?.focus()
    onChange({ ...value, period: PERIODS[next].value })
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} className={`relative flex overflow-hidden rounded-xl ring-1 ring-inset ring-line-strong ${SEGMENTS_BOX}`}>
      <span id={labelId} className="sr-only">
        {name} period
      </span>
      {PERIODS.map(({ value: period, label }, index) => {
        const checked = value.period === period
        return (
          <button
            key={period}
            ref={(button) => {
              buttons.current[index] = button
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange({ ...value, period })}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`font-ui h-full min-w-11 flex-auto cursor-pointer border-l border-line px-2 text-xs transition-colors first:border-l-0 focus-visible:-outline-offset-2 motion-reduce:transition-none ${
              checked ? 'bg-fg/10 font-semibold text-fg shadow-[inset_0_-2px_0_0_currentColor]' : 'font-medium text-fg-muted hover:bg-fg/5'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** This year and the two before it. */
export function YearSelect({ name, value, onChange }: FilterProps) {
  return (
    <div className={YEAR_BOX}>
      <Select
        label={`${name} year`}
        value={value.year}
        options={yearOptions().map((year) => ({ value: year, label: String(year) }))}
        onChange={(year) => onChange({ ...value, year })}
        className="h-full"
      />
    </div>
  )
}
