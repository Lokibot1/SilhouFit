import { useState, type Ref } from 'react'
import type { BodyModelId } from '../../service/bodyProfile'
import { AlertIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '../form/icons'
import { FloatingField } from '../form/FloatingField'
import { KRAL_CHIP, KRAL_PRIMARY, KRAL_SECONDARY } from '../shop/shopControls'
import { STEP_BODY, STEP_BODY_PINNED, STEP_FOOTER } from './stepLayout'
import {
  formatValue,
  howTo,
  sanitizeInput,
  SPECS,
  unitLabel,
  validateField,
  type Entered,
  type Field,
  type Unit,
} from './measurements'

/** Soft cross-field checks. They never block the user. */
export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <ul role="status" className="mt-4 space-y-2">
      {items.map((item) => (
        <li key={item} className="font-kral-mono flex items-start gap-2 text-base leading-snug text-kral-fg">
          <AlertIcon size={20} className="mt-0.5 shrink-0 text-kral-red-ink" />
          <span>
            <span className="font-medium uppercase">Worth a second look. </span>
            {item}
          </span>
        </li>
      ))}
    </ul>
  )
}

interface MeasureStepProps {
  field: Field
  fields: Field[]
  model: BodyModelId
  unit: Unit
  entered: Entered
  warnings: string[]
  headingRef: Ref<HTMLHeadingElement>
  onValue: (value: number | undefined) => void
  onUnit: (unit: Unit) => void
  /** Jump to a measurement by its position in `fields`. */
  onGo: (index: number) => void
  /** Opened from the review screen: Done goes back there. */
  fromReview?: boolean
  onPrev: () => void
  onNext: () => void
}

/** The text is local while it is typed; the canonical value goes up as soon as it is valid. */
function MeasureInput({ field, unit, value, onValue, onSubmit }: {
  field: Field
  unit: Unit
  value: number | undefined
  onValue: (value: number | undefined) => void
  onSubmit: (valid: boolean) => void
}) {
  const [text, setText] = useState(value === undefined ? '' : formatValue(field, value, unit))
  const result = text ? validateField(field, text, unit) : null
  const { min, max } = SPECS[field]
  const label = unitLabel(field, unit)

  return (
    <form
      id="measure-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(!result || result.ok)
      }}
    >
      <FloatingField
        tone="kral"
        id="measure-input"
        label={`${SPECS[field].label} (${label})`}
        value={text}
        inputMode="decimal"
        enterKeyHint="next"
        error={result && !result.ok ? result.error : undefined}
        onChange={(next) => {
          const clean = sanitizeInput(next)
          setText(clean)
          const parsed = clean ? validateField(field, clean, unit) : null
          onValue(parsed?.ok ? parsed.value : undefined)
        }}
      />
      <p className="font-kral-mono mt-2 px-1 text-base text-kral-muted tabular-nums md:text-sm">
        Typical range {formatValue(field, min, unit)} to {formatValue(field, max, unit)} {label}.
      </p>
    </form>
  )
}

export function MeasureStep({
  field,
  fields,
  model,
  unit,
  entered,
  warnings,
  headingRef,
  onValue,
  onUnit,
  onGo,
  fromReview = false,
  onPrev,
  onNext,
}: MeasureStepProps) {
  const spec = SPECS[field]
  const index = fields.indexOf(field)
  const [listOpen, setListOpen] = useState(false)
  const [howOpenFor, setHowOpenFor] = useState<Field | null>(null)
  const howOpen = howOpenFor === field
  const done = fields.filter((f) => entered[f] !== undefined).length

  // Enter and Next both come here: stay put while the typed value is not valid, so the error is the next thing read.
  function advance(valid: boolean) {
    if (valid) onNext()
    else document.getElementById('measure-input')?.focus()
  }

  return (
    <>
      <div className={`${STEP_BODY} ${STEP_BODY_PINNED}`}>
        <p className="font-kral-mono text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]">({spec.required ? 'Required for AR try-on' : 'Optional'})</p>
        <h2 ref={headingRef} tabIndex={-1} className="font-kral-display mt-1 text-xl leading-[1.05] font-extrabold text-kral-fg uppercase outline-none sm:text-2xl">
          {spec.label}
        </h2>
        <p className="font-kral-mono mt-3 text-base leading-relaxed text-kral-muted">{spec.what}</p>

        {/* A phone keeps this folded so the field stays in view; from lg up it is always open. */}
        <div className="mt-4 border border-kral-rule px-4">
          <p className="font-kral-mono pt-4 text-base font-medium text-kral-fg uppercase max-lg:hidden">How to measure</p>
          <button
            type="button"
            aria-expanded={howOpen}
            aria-controls="measure-how-to"
            onClick={() => setHowOpenFor(howOpen ? null : field)}
            className="kral-focus font-kral-mono flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 text-left text-base font-medium text-kral-fg uppercase lg:hidden"
          >
            How to measure
            <ChevronDownIcon className={howOpen ? 'rotate-180' : ''} />
          </button>
          <div id="measure-how-to" className={`pb-4 ${howOpen ? '' : 'max-lg:hidden'}`}>
            <p className="font-kral-mono mt-1 text-base leading-relaxed text-kral-muted">{howTo(field, model)}</p>
            <p className="font-kral-mono mt-2 text-base leading-relaxed text-kral-muted">
              Use a soft, flexible tape and keep it snug, not tight.
              {spec.kind === 'length' || field === 'height' ? ' Ask someone to help hold the tape if you can.' : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p id="unit-label" className="font-kral-mono text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]">
            Units
          </p>
          <div role="group" aria-labelledby="unit-label" className="flex gap-2">
            {(['metric', 'imperial'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={unit === option}
                onClick={() => onUnit(option)}
                className={`${KRAL_CHIP} tabular-nums`}
              >
                {option === 'metric' ? 'cm, kg' : 'in, lb'}
              </button>
            ))}
          </div>
        </div>
        <Warnings items={warnings} />

        <div className="mt-4">
          <button
            type="button"
            aria-expanded={listOpen}
            aria-controls="measure-list"
            onClick={() => setListOpen((open) => !open)}
            className="kral-focus font-kral-mono flex min-h-11 cursor-pointer items-center gap-2 text-base font-medium text-kral-fg uppercase md:text-xs md:tracking-[0.08em]"
          >
            <ChevronDownIcon className={listOpen ? 'rotate-180' : ''} />
            {done} of {fields.length} measurements entered
          </button>
          <ol id="measure-list" hidden={!listOpen} className="mt-2 flex flex-wrap gap-2">
            {fields.map((f, i) => (
              <li key={f}>
                <button
                  type="button"
                  aria-current={f === field ? 'step' : undefined}
                  onClick={() => onGo(i)}
                  className={`${KRAL_CHIP} ${f === field ? 'border-kral-fg bg-kral-fg text-kral-bg hover:bg-kral-fg' : ''}`}
                >
                  {entered[f] !== undefined ? (
                    <CheckIcon size={16} />
                  ) : (
                    <span aria-hidden="true" className="size-4 border border-current" />
                  )}
                  {SPECS[f].label}
                  <span className="sr-only">
                    {entered[f] !== undefined ? ', entered' : ', not entered'}
                    {SPECS[f].required ? ', required for AR try-on' : ', optional'}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className={STEP_FOOTER}>
        <MeasureInput key={`${field}-${unit}`} field={field} unit={unit} value={entered[field]} onValue={onValue} onSubmit={advance} />
        <div className="mt-3 flex flex-wrap justify-between gap-3 lg:mt-6">
          <button type="button" onClick={onPrev} className={KRAL_SECONDARY}>
            <ChevronLeftIcon size={16} />
            Back
          </button>
          <button type="submit" form="measure-form" className={KRAL_PRIMARY}>
            {fromReview ? 'Review answers' : index === fields.length - 1 ? 'Review' : 'Next'}
            <ChevronRightIcon size={16} />
          </button>
        </div>
      </div>
    </>
  )
}
