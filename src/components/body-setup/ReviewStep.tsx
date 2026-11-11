import type { Ref } from 'react'
import { CheckIcon, ChevronLeftIcon, SpinnerIcon } from '../form/icons'
import { Checkbox } from '../ui/Checkbox'
import { IconEditButton } from '../ui/IconEditButton'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../shop/shopControls'
import type { Draft } from './draft'
import { Warnings } from './MeasureStep'
import { skinToneHex, skinToneLabel } from './skinTone'
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
        <h2 ref={headingRef} tabIndex={-1} className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase outline-none sm:text-2xl">
          Review your measurements
        </h2>
        <p className="font-kral-mono mt-3 text-base leading-relaxed text-kral-muted">
          Check everything below, then finish. You can change any of it later from your profile.
        </p>

        <dl className="mt-4 divide-y divide-kral-rule">
          {[
            { key: 'model', label: 'Body model', value: model ? MODEL_LABEL[model] : 'Not chosen', step: 0 },
            { key: 'build', label: 'Body build', value: build ? BUILD_LABEL[build] : 'Not chosen', step: 1 },
          ].map((row) => (
            <div key={row.key} className="flex min-h-11 items-center gap-3 py-1">
              <dt className="font-kral-mono text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]">{row.label}</dt>
              <dd className="font-kral-mono ml-auto text-base text-kral-fg">{row.value}</dd>
              <IconEditButton tone="kral" label={`Change ${row.label.toLowerCase()}`} onClick={() => onEditStep(row.step)} />
            </div>
          ))}
          <div className="flex min-h-11 items-center gap-3 py-1">
            <dt className="font-kral-mono text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]">Skin tone</dt>
            <dd className="font-kral-mono ml-auto flex items-center gap-2 text-base text-kral-fg">
              <span aria-hidden="true" className="size-6 shrink-0 border border-kral-fg" style={{ backgroundColor: skinToneHex(draft.skinTone) }} />
              {skinToneLabel(draft.skinTone)}
            </dd>
            <IconEditButton tone="kral" label="Change skin tone" onClick={() => onEditStep(1)} />
          </div>
          {fields.map((field, i) => {
            const value = entered[field]
            return (
              <div key={field} className="flex min-h-11 items-center gap-3 py-1">
                <dt className="font-kral-mono text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]">
                  {SPECS[field].label}
                  {SPECS[field].required && <span className="sr-only"> (required for AR try-on)</span>}
                </dt>
                <dd className="font-kral-mono ml-auto text-right text-base text-kral-fg tabular-nums">
                  {value === undefined ? 'Not entered' : `${formatValue(field, value, unit)} ${unitLabel(field, unit)}`}
                </dd>
                <IconEditButton
                  tone="kral"
                  label={`${value === undefined ? 'Add' : 'Edit'} ${SPECS[field].label.toLowerCase()}`}
                  hint={value === undefined ? 'Add measurement' : 'Edit measurement'}
                  onClick={() => onEditStep(2 + i)}
                />
              </div>
            )
          })}
        </dl>

        {!hasHeight && (
          <p role="alert" className="font-kral-mono mt-4 text-base leading-snug text-kral-red-ink">
            Height is needed to save. It is the one measurement every profile requires, so choose the pencil next to height.
          </p>
        )}
        {hasHeight && missing.length > 0 && (
          <p className="font-kral-mono mt-4 text-base leading-snug text-kral-muted">
            AR try-on needs {missing.map((f) => SPECS[f].label.toLowerCase()).join(', ')}. You can finish now and add{' '}
            {missing.length === 1 ? 'it' : 'them'} later from your profile.
          </p>
        )}
        <Warnings items={warnings} />
      </div>

      <div className={STEP_FOOTER}>
        <Checkbox tone="kral" checked={consent} onChange={onConsent} label={CONSENT_LABEL} className="!justify-start">
          <span className="font-kral-mono text-base leading-snug">{CONSENT_LABEL}</span>
        </Checkbox>
        {!consent && hasHeight && <p className="font-kral-mono px-1 text-base text-kral-muted md:text-sm">Tick the box to turn on Finish Setup.</p>}

        <div className="mt-3 flex flex-wrap justify-between gap-3">
          <button type="button" onClick={() => onEditStep(draft.step)} className={KRAL_SECONDARY}>
            <ChevronLeftIcon size={16} />
            Back
          </button>
          <button type="button" onClick={onFinish} disabled={pending || !consent || !hasHeight} className={KRAL_PRIMARY}>
            {pending ? <SpinnerIcon /> : <CheckIcon size={16} />}
            Finish Setup
          </button>
        </div>
      </div>
    </>
  )
}
