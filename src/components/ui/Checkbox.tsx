import type { ReactNode } from 'react'
import { CheckIcon } from '../form/icons'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** The accessible name. */
  label: string
  /** Visible text beside the box; clicking it toggles too. */
  children?: ReactNode
  className?: string
}

/** A 44px touch target around a 24px box that follows the theme. */
export function Checkbox({ checked, onChange, label, children, className = '' }: CheckboxProps) {
  return (
    <label className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 text-fg ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer sr-only"
      />
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-fg bg-canvas peer-checked:bg-fg peer-checked:text-canvas peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-chrome-strong">
        {checked && <CheckIcon size={16} />}
      </span>
      {children}
    </label>
  )
}
