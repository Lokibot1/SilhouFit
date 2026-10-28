import type { ReactNode } from 'react'
import { SpinnerIcon } from '../../form/icons'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'

interface ConfirmDialogProps {
  open: boolean
  /** The question, naming the account: "Archive Sam Reyes?" */
  title: string
  /** What the action does to the account. */
  children: ReactNode
  /** The action as a verb phrase that matches the title: "Archive account". */
  confirmLabel: string
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}

/** "Are you sure?" before a destructive action. The confirm button is the secondary style, and both buttons wait while the request is in flight. */
export function ConfirmDialog({ open, title, children, confirmLabel, pending, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className={`${SECONDARY_BUTTON} disabled:opacity-60`}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={pending} aria-busy={pending} className={`${SECONDARY_BUTTON} disabled:cursor-progress disabled:opacity-70`}>
            {pending && <SpinnerIcon className="mr-2" />}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="pb-5">
        <p className="text-base font-semibold text-fg">Are you sure?</p>
        <div className="mt-2 text-base text-fg-muted">{children}</div>
      </div>
    </Modal>
  )
}
