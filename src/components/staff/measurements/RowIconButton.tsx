import type { ReactNode } from 'react'
import { Tooltip } from '../../ui/Tooltip'

interface RowIconButtonProps {
  /** The accessible name and the tooltip, e.g. "Edit Hoodie XS". */
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  /** Marks the button so focus can return to its row after the list reloads. */
  rowId?: string
}

/** An icon-only row action: 44px target, named for assistive tech, hinted on hover and focus. */
export function RowIconButton({ label, icon, onClick, disabled, rowId }: RowIconButtonProps) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        data-row-action={rowId}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-line/60 hover:text-chrome-strong disabled:cursor-progress disabled:opacity-60"
      >
        {icon}
      </button>
    </Tooltip>
  )
}
