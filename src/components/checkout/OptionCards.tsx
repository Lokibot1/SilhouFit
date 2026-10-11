import { useId, type ReactNode } from 'react'
import { CheckIcon } from '../form/icons'

export interface CardOption<T extends string> {
  value: T
  title: string
  description: string
  /** Why this option cannot be chosen; the card is disabled and says so. */
  disabledReason?: string | null
  /** Shown under the card while it is selected (for example the e-wallet provider choice). */
  extra?: ReactNode
}

interface OptionCardsProps<T extends string> {
  legend: string
  name: string
  value: T
  options: CardOption<T>[]
  onChange: (value: T) => void
}

/** Radio cards: native radios in a fieldset, so keyboard and screen readers behave as for any radio group. */
export function OptionCards<T extends string>({ legend, name, value, options, onChange }: OptionCardsProps<T>) {
  const id = useId()
  return (
    <fieldset>
      <legend className="font-ui text-sm font-semibold text-fg">{legend}</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const disabled = Boolean(option.disabledReason)
          const checked = option.value === value
          const noteId = `${id}-${option.value}`
          return (
            <div key={option.value}>
              <label className="relative block">
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={checked}
                  disabled={disabled}
                  aria-describedby={noteId}
                  onChange={() => onChange(option.value)}
                  className="peer sr-only"
                />
                <span
                  className={`flex min-h-16 gap-3 rounded-xl border p-3 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-chrome-strong ${
                    checked ? 'border-fg bg-fg/5' : 'border-line-strong'
                  } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-fg/5'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                      checked ? 'border-fg bg-fg text-canvas' : 'border-line-strong'
                    }`}
                  >
                    {checked && <CheckIcon size={16} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-fg">{option.title}</span>
                    <span id={noteId} className="mt-0.5 block text-sm leading-snug text-fg-muted">
                      {disabled ? option.disabledReason : option.description}
                    </span>
                  </span>
                </span>
              </label>
              {checked && option.extra}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
