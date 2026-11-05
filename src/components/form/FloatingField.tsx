import { useRef, useState, type ReactNode } from 'react'
import { AlertIcon, EyeIcon, EyeOffIcon, XIcon } from './icons'

interface FloatingFieldProps {
  id: string
  label: string
  /** Leading outline icon. Omit for compact fields (names, suffix). */
  icon?: ReactNode
  /** Interactive leading control (country picker), drawn inside the outline. */
  prefix?: ReactNode
  /** For a static prefix like "+63" that needs less room than a country picker. */
  compactPrefix?: boolean
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  /** Shown as "current/max" in the field's bottom-right corner. */
  counter?: { current: number; max: number }
  type?: 'text' | 'email' | 'tel' | 'password'
  autoComplete?: string
  inputMode?: 'text' | 'email' | 'tel' | 'decimal'
  enterKeyHint?: 'next' | 'done'
  readOnly?: boolean
  /** A value the user cannot change (a derived one): muted, skipped by Tab, and no keyboard on a phone. */
  locked?: boolean
  /** Names the field in the password toggle's label ("Show <toggleLabel>"); defaults to "password". */
  toggleLabel?: string
}

export function FloatingField({
  id,
  label,
  icon,
  prefix,
  compactPrefix,
  value,
  onChange,
  onBlur,
  error,
  counter,
  type = 'text',
  autoComplete,
  inputMode,
  enterKeyHint,
  readOnly,
  locked,
  toggleLabel = 'password',
}: FloatingFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  const errorId = `${id}-error`

  return (
    <div
      className={`field scroll-mt-28 ${prefix ? (compactPrefix ? 'field--prefix-compact' : 'field--prefix') : icon ? '' : 'field--plain'}`}
      data-invalid={error ? '' : undefined}
      data-locked={locked ? '' : undefined}
    >
      <div className="field__box">
        <input
          ref={inputRef}
          id={id}
          name={id}
          type={isPassword && revealed ? 'text' : type}
          value={value}
          placeholder=" "
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          inputMode={locked ? 'none' : inputMode}
          enterKeyHint={enterKeyHint}
          autoCapitalize={type === 'email' || isPassword ? 'off' : undefined}
          autoCorrect={isPassword ? 'off' : undefined}
          spellCheck={false}
          readOnly={readOnly || locked}
          aria-readonly={locked ? true : undefined}
          tabIndex={locked ? -1 : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="field__input"
        />
        {icon && <span className="field__icon">{icon}</span>}
        {prefix && <div className="field__prefix">{prefix}</div>}
        <label htmlFor={id} className="field__label">
          {label}
        </label>
        <fieldset aria-hidden="true" className="field__outline">
          <legend>
            <span>{label}</span>
          </legend>
        </fieldset>
        {counter && (
          <span className="field__counter" aria-hidden="true">
            {counter.current}/{counter.max}
          </span>
        )}

        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((shown) => !shown)}
            aria-pressed={revealed}
            aria-label={`${revealed ? 'Hide' : 'Show'} ${toggleLabel}`}
            className="field__action"
          >
            {revealed ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </button>
        )}
        {!isPassword && value && !readOnly && !locked && (
          <button
            type="button"
            onClick={() => {
              onChange('')
              inputRef.current?.focus()
            }}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="field__action"
          >
            <XIcon />
          </button>
        )}
      </div>

      {error && (
        <p id={errorId} className="flex items-start gap-1.5 px-1 pt-1 text-xs leading-snug text-danger">
          <AlertIcon className="mt-px size-3.5" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
