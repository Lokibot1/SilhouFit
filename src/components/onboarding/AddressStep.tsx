import { SECONDARY_BUTTON } from '../ui/buttonStyles'
import { Modal } from '../ui/Modal'
import { useToast } from '../toast/useToast'
import { AddressForm } from '../address/AddressForm'

interface AddressStepProps {
  /** Leaves the step, saved or skipped. */
  onDone: () => void
}

/** The tour's optional last stop: a delivery address, saved on this device. Skipping saves nothing. */
export function AddressStep({ onDone }: AddressStepProps) {
  const toast = useToast()

  return (
    <Modal open onClose={onDone} title="Save your delivery address">
      <p className="pb-4 text-base leading-relaxed text-fg-muted">
        Checkout can fill this in for you. It is saved on this device only, and you can skip it and add it later from
        your profile.
      </p>
      <AddressForm
        initial={null}
        onSaved={() => {
          toast.show({ kind: 'success', message: 'Address saved.' })
          onDone()
        }}
        footer={(submit) => (
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onDone} className={SECONDARY_BUTTON}>
              Skip this step
            </button>
            {submit}
          </div>
        )}
      />
    </Modal>
  )
}
