import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

/** The control of a Field: the compact floating-label input (see `.field--compact` in index.css). Use inside <Field>. */
export const FIELD_INPUT = 'field__input'

/** A bare text box with no label (a search box that names itself with aria-label), at the same compact size. */
export const PLAIN_INPUT =
  'font-ui min-h-9 pointer-coarse:min-h-11 max-md:min-h-11 w-full rounded-xl border border-line-strong bg-canvas px-3 text-base md:text-sm text-fg placeholder:text-fg-muted aria-invalid:border-danger disabled:opacity-60'

type Control = ReactElement<{ placeholder?: string; type?: string }>
const CONTROLS = ['input', 'textarea', 'datalist']

/**
 * A compact outlined field whose label sits inside as the placeholder and floats up to the border once the field is focused or filled
 * (like the login and sign-up fields). The input, textarea or datalist children go in the box; any other child (a hint) goes below it.
 * `id` is the control's id; the error and counter are `${id}-error` and `${id}-count`.
 */
export function Field({
  id,
  label,
  optional,
  count,
  error,
  children,
}: {
  id: string
  label: string
  optional?: boolean
  /** Shown as "typed/max". */
  count?: { value: number; max: number }
  error?: string
  children: ReactNode
}) {
  const shown = optional ? `${label} (optional)` : label
  const nodes = Children.toArray(children)
  const isControl = (node: ReactNode): node is Control => isValidElement(node) && CONTROLS.includes(node.type as string)
  // The label floats by :placeholder-shown, so every box needs a placeholder; a date box always shows its format, so it is always floated.
  const controls = nodes.filter(isControl).map((node) => (node.type === 'datalist' || node.props.placeholder !== undefined ? node : cloneElement(node, { placeholder: ' ' })))
  const floated = controls.some((node) => node.props.type === 'date')
  return (
    <div className={`field field--compact scroll-mt-28 ${floated ? 'field--floated' : ''}`} data-invalid={error ? '' : undefined}>
      <div className="field__box">
        {controls}
        <label htmlFor={id} className="field__label">
          {shown}
        </label>
        <fieldset aria-hidden="true" className="field__outline">
          <legend>
            <span>{shown}</span>
          </legend>
        </fieldset>
      </div>
      {nodes.filter((node) => !isControl(node))}
      {(error || count) && (
        <div className="flex items-start justify-between gap-2 px-1 pt-1">
          {error ? (
            <p id={`${id}-error`} className="text-xs text-danger">
              {error}
            </p>
          ) : (
            <span />
          )}
          {count && (
            <span id={`${id}-count`} className="text-xs text-fg-muted tabular-nums">
              {count.value}/{count.max}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Pass as the Select's `className` inside a SelectField: the field's outline replaces the raised button face. */
export const SELECT_FLAT = 'bg-none! bg-transparent! shadow-none! border-0! font-normal!'

/** A <Select> in the same compact outlined box as a Field, its label sitting on the border (a pick is always showing, so it is always up). */
export function SelectField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field field--compact field--floated">
      <div className="field__box">
        {children}
        <span aria-hidden="true" className="field__label">
          {label}
        </span>
        <fieldset aria-hidden="true" className="field__outline">
          <legend>
            <span>{label}</span>
          </legend>
        </fieldset>
      </div>
    </div>
  )
}
