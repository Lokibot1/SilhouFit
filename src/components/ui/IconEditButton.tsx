import type { Ref } from 'react'
import { Link } from 'react-router-dom'
import { PencilIcon } from '../form/icons'
import { Tooltip } from './Tooltip'

const KRAL_EDIT =
  'kral-focus flex size-11 shrink-0 cursor-pointer items-center justify-center text-kral-fg transition-colors duration-150 ease-out hover:bg-kral-fg/10 disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 motion-reduce:transition-none'
const EDIT = 'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:text-chrome-strong disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60'

interface IconEditButtonProps {
  /** The accessible name and the tooltip text, e.g. "Edit address". */
  label: string
  /** Tooltip text when it should be shorter than the accessible name, e.g. "Edit measurement" for "Edit height". */
  hint?: string
  /** Renders a link to this path instead of a button. */
  to?: string
  onClick?: () => void
  disabled?: boolean
  /** Looks disabled but stays focusable, so focus is not lost while the caller ignores clicks. */
  ariaDisabled?: boolean
  /** Reaches the button only; a link has nothing to refocus. */
  ref?: Ref<HTMLButtonElement>
  className?: string
  /** 'kral' sets the button borderless and square for the KRAL pages. */
  tone?: 'kral'
}

/** A pencil for any edit or change action: 44px target, named for assistive tech, hinted on hover and focus. */
export function IconEditButton({ label, hint, to, onClick, disabled, ariaDisabled, ref, className = '', tone }: IconEditButtonProps) {
  const classes = `${tone === 'kral' ? KRAL_EDIT : EDIT} ${className}`
  return (
    <Tooltip label={hint ?? label} tone={tone}>
      {to ? (
        <Link to={to} aria-label={label} className={classes}>
          <PencilIcon />
        </Link>
      ) : (
        <button ref={ref} type="button" onClick={onClick} disabled={disabled} aria-disabled={ariaDisabled || undefined} aria-label={label} className={classes}>
          <PencilIcon />
        </button>
      )}
    </Tooltip>
  )
}
