import { PRIMARY_BUTTON } from '../ui/buttonStyles'
import { Modal } from '../ui/Modal'

/** Shown once the session has ended because an administrator deactivated the account. Only the button closes it: no Escape, no backdrop, no close icon. */
export function DeactivatedModal({ open, onAcknowledge }: { open: boolean; onAcknowledge: () => void }) {
  return (
    <Modal
      open={open}
      onClose={() => {}}
      closable={false}
      title="This account has been deactivated"
      size="sm"
      footer={
        <button type="button" onClick={onAcknowledge} className={`${PRIMARY_BUTTON} w-full`}>
          I understand
        </button>
      }
    >
      <p className="text-base leading-relaxed text-fg-muted">
        An administrator turned this account off, so you have been signed out. Contact an administrator to have it activated again.
      </p>
    </Modal>
  )
}
