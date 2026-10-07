import { useRef, type ReactNode } from 'react'
import { AlertIcon, XIcon } from './icons'

interface FloatingFieldProps {
  id: string
  label: string
  /** Leading outline icon. Omit for compact fields (names, suffix). */
  icon?: ReactNode
  /** Interactive leading control (country picker), drawn inside the outline. */
  prefix?: ReactNode
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  /** Shown as "current/max" in the field's bottom-right corner. */
  counter?: { current: number; max: number }
  type?: 'text' | 'email' | 'tel'
  autoComplete?: string
  inputMode?: 'text' | 'email' | 'tel'
  enterKeyHint?: 'next' | 'done'
  readOnly?: boolean
}

export function FloatingField({
  id,
  label,
  icon,
  prefix,
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
}: FloatingFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = `${id}-error`

  return (
    <div
      className={`field scroll-mt-28 ${prefix ? 'field--prefix' : icon ? '' : 'field--plain'}`}
      data-invalid={error ? '' : undefined}
    >
      <div className="field__box">
        <input
          ref={inputRef}
          id={id}
          name={id}
          type={type}
          value={value}
          placeholder=" "
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          inputMode={inputMode}
          enterKeyHint={enterKeyHint}
          autoCapitalize={type === 'email' ? 'off' : undefined}
          spellCheck={false}
          readOnly={readOnly}
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

        {value && !readOnly && (
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
