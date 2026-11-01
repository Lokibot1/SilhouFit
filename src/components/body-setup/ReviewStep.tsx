import type { Ref } from 'react'
import { SpinnerIcon } from '../form/icons'
import { Checkbox } from '../ui/Checkbox'
import { IconEditButton } from '../ui/IconEditButton'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'
import type { Draft } from './draft'
import { Warnings } from './MeasureStep'
import { STEP_BODY, STEP_BODY_PINNED, STEP_FOOTER } from './stepLayout'
import {
  BUILD_LABEL,
  fieldsFor,
  formatValue,
  MODEL_LABEL,
  missingForAr,
  SPECS,
  unitLabel,
} from './measurements'

export const CONSENT_LABEL = 'Save my measurements to my account so SilhouFit can recommend sizes'

interface ReviewStepProps {
  draft: Draft
  warnings: string[]
  consent: boolean
  pending: boolean
  headingRef: Ref<HTMLHeadingElement>
  onConsent: (consent: boolean) => void
  onEditStep: (step: number) => void
  onFinish: () => void
}

export function ReviewStep({ draft, warnings, consent, pending, headingRef, onConsent, onEditStep, onFinish }: ReviewStepProps) {
  const { model, build, unit, entered } = draft
  const fields = fieldsFor(model)
  const missing = missingForAr(entered).filter((f) => fields.includes(f))
  const hasHeight = entered.height !== undefined

  return (
    <>
      <div className={`${STEP_BODY} ${STEP_BODY_PINNED}`}>
        <h2 ref={headingRef} tabIndex={-1} className="display text-2xl text-fg outline-none">
          Review your measurements
        </h2>
        <p className="mt-2 text-base leading-relaxed text-fg-muted">
          Check everything below, then finish. You can change any of it later from your profile.
        </p>

        <dl className="mt-4 divide-y divide-line">
          {[
            { key: 'model', label: 'Body model', value: model ? MODEL_LABEL[model] : 'Not chosen', step: 0 },
            { key: 'build', label: 'Body build', value: build ? BUILD_LABEL[build] : 'Not chosen', step: 1 },
          ].map((row) => (
            <div key={row.key} className="flex min-h-11 items-center gap-3 py-1">
              <dt className="text-base text-fg-muted">{row.label}</dt>
              <dd className="ml-auto text-base text-fg">{row.value}</dd>
              <IconEditButton label={`Change ${row.label.toLowerCase()}`} onClick={() => onEditStep(row.step)} />
            </div>
          ))}
          {fields.map((field, i) => {
            const value = entered[field]
            return (
              <div key={field} className="flex min-h-11 items-center gap-3 py-1">
                <dt className="text-base text-fg-muted">
                  {SPECS[field].label}
                  {SPECS[field].required && <span className="sr-only"> (required for AR try-on)</span>}
                </dt>
                <dd className="ml-auto text-right text-base text-fg tabular-nums">
                  {value === undefined ? 'Not entered' : `${formatValue(field, value, unit)} ${unitLabel(field, unit)}`}
                </dd>
                <IconEditButton
                  label={`${value === undefined ? 'Add' : 'Edit'} ${SPECS[field].label.toLowerCase()}`}
                  hint={value === undefined ? 'Add measurement' : 'Edit measurement'}
                  onClick={() => onEditStep(2 + i)}
                />
              </div>
            )
          })}
        </dl>

        {!hasHeight && (
          <p role="alert" className="mt-4 text-base leading-snug text-danger">
            Height is needed to save. It is the one measurement every profile requires, so choose the pencil next to height.
          </p>
        )}
        {hasHeight && missing.length > 0 && (
          <p className="mt-4 text-base leading-snug text-fg-muted">
            AR try-on needs {missing.map((f) => SPECS[f].label.toLowerCase()).join(', ')}. You can finish now and add{' '}
            {missing.length === 1 ? 'it' : 'them'} later from your profile.
          </p>
        )}
        <Warnings items={warnings} />
      </div>

      <div className={STEP_FOOTER}>
        <Checkbox checked={consent} onChange={onConsent} label={CONSENT_LABEL} className="!justify-start">
          <span className="text-base leading-snug">{CONSENT_LABEL}</span>
        </Checkbox>
        {!consent && hasHeight && <p className="px-1 text-xs text-fg-muted">Tick the box to turn on Finish Setup.</p>}

        <div className="mt-3 flex flex-wrap justify-between gap-3">
          <button type="button" onClick={() => onEditStep(draft.step)} className={SECONDARY_BUTTON}>
            Back
          </button>
          <button type="button" onClick={onFinish} disabled={pending || !consent || !hasHeight} className={`${PRIMARY_BUTTON} disabled:cursor-not-allowed`}>
            {pending && <SpinnerIcon />}
            Finish Setup
          </button>
        </div>
      </div>
    </>
  )
}
