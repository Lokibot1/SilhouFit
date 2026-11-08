import { useRef, type ReactNode } from 'react'
import { SpinnerIcon } from '../../form/icons'
import { KRAL_DANGER, KRAL_SECONDARY } from '../../shop/shopControls'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
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
  onConfirm: () => void
  onClose: () => void
  /** 'kral' restyles the dialog flat and square for the KRAL pages. */
  tone?: 'kral'
}

/** "Are you sure?" before a destructive action. Cancel takes focus first. The confirm button is the secondary style with a danger border and text, and both buttons wait while the request is in flight. */
export function ConfirmDialog({ open, title, children, confirmLabel, pending, onConfirm, onClose, tone }: ConfirmDialogProps) {
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
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={pending} aria-busy={pending} className={kral ? `${KRAL_DANGER} disabled:cursor-progress` : `${SECONDARY_BUTTON} border-danger! text-danger! hover:text-danger! disabled:cursor-progress disabled:opacity-70`}>
            {pending && <SpinnerIcon className="mr-2" />}
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
