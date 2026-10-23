import type { ReactNode } from 'react'

export const FIELD_INPUT =
  'font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas px-3 text-base text-fg placeholder:text-fg-muted aria-invalid:border-danger disabled:opacity-60'

/** A labelled field with an optional counter and inline error. `id` is the control's id; the error and counter are `${id}-error` and `${id}-count`. */
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
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-fg">
          {label}
          {optional && <span className="font-normal text-fg-muted"> (optional)</span>}
        </label>
        {count && (
          <span id={`${id}-count`} className="text-xs text-fg-muted tabular-nums">
            {count.value}/{count.max}
          </span>
        )}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

