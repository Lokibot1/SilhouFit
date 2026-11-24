import { useRef, type ReactNode } from 'react'
import { SpinnerIcon, XIcon } from '../../form/icons'
import { KRAL_DANGER, KRAL_SECONDARY } from '../../shop/shopControls'
import { CREATE_BUTTON, DANGER_BUTTON, SECONDARY_BUTTON, UPDATE_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'

interface ConfirmDialogProps {
  open: boolean
  /** The question, naming the account: "Deactivate Sam Reyes?" */
  title: string
  /** What the action does to the account. */
  children: ReactNode
  /** The action as a verb phrase that matches the title: "Deactivate account". */
  confirmLabel: string
  pending: boolean
  /** Keeps the confirm button off until the caller is satisfied (a typed confirmation). */
  confirmDisabled?: boolean
  onConfirm: () => void
  onClose: () => void
  /** 'kral' restyles the dialog flat and square for the KRAL pages. */
  tone?: 'kral'
  /** Shown before the confirm label (16px icon); the spinner takes its place while pending. */
  icon?: ReactNode
  /** 'update' makes the confirm button blue for a non-destructive action; the default is the red tint. */
  intent?: 'create' | 'update'
}

/** "Are you sure?" before a destructive action. Cancel takes focus first. The confirm button is the red-tint danger style (green for intent="create", blue for intent="update"), and both buttons wait while the request is in flight. */
export function ConfirmDialog({ open, title, children, confirmLabel, pending, confirmDisabled, onConfirm, onClose, tone, icon, intent }: ConfirmDialogProps) {
  const kral = tone === 'kral'
  const cancel = useRef<HTMLButtonElement>(null)
  return (
    <Modal
      open={open}
      initialFocusRef={cancel}
      onClose={pending ? () => {} : onClose}
      title={title}
      tone={tone}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button ref={cancel} type="button" onClick={onClose} disabled={pending} className={kral ? KRAL_SECONDARY : `${SECONDARY_BUTTON} disabled:opacity-60`}>
            {!kral && <XIcon />}
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={pending || confirmDisabled} aria-busy={pending} className={kral ? `${KRAL_DANGER} disabled:cursor-progress` : intent === 'create' ? CREATE_BUTTON : intent === 'update' ? UPDATE_BUTTON : DANGER_BUTTON}>
            {pending ? <SpinnerIcon className={kral ? 'mr-2' : undefined} /> : !kral && icon}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="pb-5">
        <p className={kral ? 'font-kral-mono text-base font-medium text-kral-fg uppercase' : 'text-base font-semibold text-fg'}>Are you sure?</p>
        <div className={`mt-2 text-base ${kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'}`}>{children}</div>
      </div>
    </Modal>
  )
}
