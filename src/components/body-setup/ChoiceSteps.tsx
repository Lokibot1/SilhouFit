import type { ReactNode, Ref } from 'react'
import type { BodyBuildId, BodyModelId } from '../../service/bodyProfile'
import { CheckIcon } from '../form/icons'
import { BUILDS, MODELS } from './draft'
import { BUILD_LABEL, MODEL_LABEL } from './measurements'

const MODEL_TEXT: Record<BodyModelId, string> = {
  male: 'A male body shape for your avatar.',
  female: 'A female body shape for your avatar. It also adds a bust measurement.',
}

const BUILD_TEXT: Record<BodyBuildId, string> = {
  skinny: 'Slender frame with relatively little body fat and muscle mass.',
  lean: 'Slim, defined physique with relatively low body fat.',
  skinny_fat: 'Relatively slim appearance with less visible muscle definition and potentially more body fat around the midsection.',
  regular: 'Average build with a balanced overall body shape.',
  muscular: 'More developed muscles and a broader or more defined appearance.',
  overweight: 'Fuller body shape with more body fat distributed across different areas.',
}

// Half-widths (in a 80 x 160 box) of the shoulders, waist and hips: enough to tell the options apart at a glance.
const SHAPE: Record<BodyModelId, [number, number, number]> = { male: [19, 13, 14], female: [15, 10, 16] }
const BUILD_SCALE: Record<BodyBuildId, [number, number, number]> = {
  skinny: [0.85, 0.8, 0.85],
  lean: [0.92, 0.88, 0.92],
  skinny_fat: [0.95, 1.1, 1.02],
  regular: [1, 1, 1],
  muscular: [1.15, 1, 1.05],
  overweight: [1.15, 1.4, 1.25],
}

/** A flat figure. Decorative: the card's text carries the meaning. */
function Figure({ model, build }: { model: BodyModelId; build: BodyBuildId }) {
  const [sh, wa, hi] = SHAPE[model].map((v, i) => v * BUILD_SCALE[build][i])
  const c = 40
  const left = [
    [c - 4, 30], [c - sh, 36], [c - sh - 3, 74], [c - sh + 1, 76], [c - wa, 80], [c - hi, 104], [c - hi + 2, 150], [c - 3, 150], [c - 2, 108],
  ]
  const right = [...left].reverse().map(([x, y]) => [2 * c - x, y])
  const points = [...left, ...right].map(([x, y]) => `${x.toFixed(1)},${y}`).join(' ')
  return (
    <svg viewBox="0 0 80 160" aria-hidden="true" focusable="false" className="h-28 w-auto text-fg">
      <circle cx={c} cy="16" r="10" fill="currentColor" opacity="0.8" />
      <polygon points={points} fill="currentColor" opacity="0.8" strokeLinejoin="round" stroke="currentColor" strokeWidth="3" />
    </svg>
  )
}

interface OptionCardsProps<T extends string> {
  name: string
  labelledBy: string
  options: T[]
  value: T | null
  onChange: (value: T) => void
  label: (option: T) => string
  text: (option: T) => string
  figure: (option: T) => ReactNode
  columns: string
}

function OptionCards<T extends string>({ name, labelledBy, options, value, onChange, label, text, figure, columns }: OptionCardsProps<T>) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className={`grid gap-3 ${columns}`}>
      {options.map((option) => {
        const selected = option === value
        return (
          <label
            key={option}
            className={`glass-card relative flex min-h-11 cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-chrome-strong ${
              selected ? 'border-fg' : 'border-transparent'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={selected}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {selected && (
              <span className="font-ui absolute top-2 right-2 flex items-center gap-1 rounded-full bg-fg px-2 py-0.5 text-sm text-canvas">
                <CheckIcon size={16} />
                Selected
              </span>
            )}
            {figure(option)}
            <span className="font-ui text-base font-semibold text-fg">{label(option)}</span>
            <span className="text-base leading-snug text-fg-muted">{text(option)}</span>
          </label>
        )
      })}
    </div>
  )
}

interface StepProps<T> {
  headingRef: Ref<HTMLHeadingElement>
  headingId: string
  value: T | null
  onChange: (value: T) => void
}

export function ModelStep({ headingRef, headingId, value, onChange }: StepProps<BodyModelId>) {
  return (
    <>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="display text-2xl text-fg outline-none">
        Which body model would you like to use for your AR Fitting avatar?
      </h2>
      <p className="mt-2 text-base leading-relaxed text-fg-muted">
        This only picks the avatar you will see. It does not limit the clothing you can browse, try on or buy.
      </p>
      <div className="mt-6">
        <OptionCards
          name="body-model"
          labelledBy={headingId}
          options={MODELS}
          value={value}
          onChange={onChange}
          label={(m) => MODEL_LABEL[m]}
          text={(m) => MODEL_TEXT[m]}
          figure={(m) => <Figure model={m} build="regular" />}
          columns="grid-cols-1 min-[480px]:grid-cols-2"
        />
      </div>
    </>
  )
}

export function BuildStep({ headingRef, headingId, value, onChange, model }: StepProps<BodyBuildId> & { model: BodyModelId }) {
  return (
    <>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="display text-2xl text-fg outline-none">
        Which body build best describes you?
      </h2>
      <p className="mt-2 text-base leading-relaxed text-fg-muted">
        Your build only gives the preview a starting shape. Your tape measurements always decide the sizes, and the avatar
        never measures you.
      </p>
      <div className="mt-6">
        <OptionCards
          name="body-build"
          labelledBy={headingId}
          options={BUILDS}
          value={value}
          onChange={onChange}
          label={(b) => BUILD_LABEL[b]}
          text={(b) => BUILD_TEXT[b]}
          figure={(b) => <Figure model={model} build={b} />}
          columns="grid-cols-1 min-[480px]:grid-cols-2"
        />
      </div>
    </>
  )
}
