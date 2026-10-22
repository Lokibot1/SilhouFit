import { useState, type Ref } from 'react'
import type { BodyModelId } from '../../service/bodyProfile'
import { AlertIcon, CheckIcon, ChevronDownIcon } from '../form/icons'
import { FloatingField } from '../form/FloatingField'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'
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
        <li key={item} className="flex items-start gap-2 text-base leading-snug text-fg">
          <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
          <span>
            <span className="font-semibold">Worth a second look. </span>
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
      <p className="mt-2 px-1 text-sm text-fg-muted tabular-nums">
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
        <p className="font-ui text-base text-fg-muted">{spec.required ? 'Required for AR try-on' : 'Optional'}</p>
        <h2 ref={headingRef} tabIndex={-1} className="display mt-1 text-2xl text-fg outline-none">
          {spec.label}
        </h2>
        <p className="mt-2 text-base leading-relaxed text-fg-muted">{spec.what}</p>

        {/* A phone keeps this folded so the field stays in view; from lg up it is always open. */}
        <div className="mt-4 rounded-xl bg-fg/5 px-4">
          <p className="font-ui pt-4 text-base font-semibold text-fg max-lg:hidden">How to measure</p>
          <button
            type="button"
            aria-expanded={howOpen}
            aria-controls="measure-how-to"
            onClick={() => setHowOpenFor(howOpen ? null : field)}
            className="font-ui flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 text-left text-base font-semibold text-fg lg:hidden"
          >
            How to measure
            <ChevronDownIcon className={howOpen ? 'rotate-180' : ''} />
          </button>
          <div id="measure-how-to" className={`pb-4 ${howOpen ? '' : 'max-lg:hidden'}`}>
            <p className="mt-1 text-base leading-relaxed text-fg-muted">{howTo(field, model)}</p>
            <p className="mt-2 text-base leading-relaxed text-fg-muted">
              Use a soft, flexible tape and keep it snug, not tight.
              {spec.kind === 'length' || field === 'height' ? ' Ask someone to help hold the tape if you can.' : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p id="unit-label" className="font-ui text-base text-fg-muted">
            Units
          </p>
          <div role="group" aria-labelledby="unit-label" className="flex gap-2">
            {(['metric', 'imperial'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={unit === option}
                onClick={() => onUnit(option)}
                className={`font-ui min-h-11 cursor-pointer rounded-xl px-4 text-base font-semibold tabular-nums ${
                  unit === option ? 'bg-fg text-canvas' : 'glass-btn bg-fg/5 text-fg hover:bg-fg/10'
                }`}
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
            className="font-ui flex min-h-11 cursor-pointer items-center gap-2 text-base font-semibold text-fg"
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
                  className={`font-ui flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-base text-fg ${
                    f === field ? 'border-2 border-fg' : 'glass-btn bg-fg/5'
                  }`}
                >
                  {entered[f] !== undefined ? (
                    <CheckIcon size={16} className="text-success" />
                  ) : (
                    <span aria-hidden="true" className="size-4 rounded-full border-2 border-fg-muted" />
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
          <button type="button" onClick={onPrev} className={SECONDARY_BUTTON}>
            Back
          </button>
          <button type="submit" form="measure-form" className={PRIMARY_BUTTON}>
            {fromReview ? 'Done' : index === fields.length - 1 ? 'Review' : 'Next'}
          </button>
        </div>
      </div>
    </>
  )
}
