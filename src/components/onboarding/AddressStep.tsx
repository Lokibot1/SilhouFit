import { useState } from 'react'
import { SECONDARY_BUTTON } from '../ui/buttonStyles'
import { Modal } from '../ui/Modal'
import { useToast } from '../toast/useToast'
import { AddressForm } from '../address/AddressForm'

interface AddressStepProps {
  /** Leaves the step, saved or skipped. */
  onDone: () => void
}

/** The tour's optional last stop: the first delivery address. Skipping saves nothing. */
export function AddressStep({ onDone }: AddressStepProps) {
  const toast = useToast()
  // Leaving mid-save would drop the result: its success toast, or the error that says why it failed.
  const [saving, setSaving] = useState(false)

  return (
    <Modal open onClose={() => !saving && onDone()} title="Save your delivery address">
      <p className="pb-4 text-base leading-relaxed text-fg-muted">
        Checkout can fill this in for you. You can skip it and add it later from your profile.
      </p>
      <AddressForm
        initial={null}
        hideDefault
        existingCount={0}
        onSaved={() => {
          toast.show({ kind: 'success', message: 'Address saved.' })
          onDone()
        }}
        onUnauthorized={onDone}
        onPendingChange={setSaving}
        footer={(submit) => (
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onDone} disabled={saving} className={`${SECONDARY_BUTTON} disabled:cursor-not-allowed disabled:opacity-60`}>
              Skip this step
            </button>
            {submit}
          </div>
        )}
      />
    </Modal>
  )
}
