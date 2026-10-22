import { useEffect, useId, useRef, useState } from 'react'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { getAddress, type SavedAddress } from '../../service/address'
import { AddressForm } from '../address/AddressForm'
import { AlertIcon } from '../form/icons'
import { useToast } from '../toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'
import { IconEditButton } from '../ui/IconEditButton'
import { Modal } from '../ui/Modal'
import { PROFILE_CARD } from './ProfileSkeleton'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; address: SavedAddress | null }

/** The one-line summary of what is saved, largest area last. */
function lines(a: SavedAddress) {
  const area = [a.barangay, a.city, a.province].filter(Boolean).join(', ')
  return [a.street, area, `${a.region} ${a.postal}`.trim()]
}

/** The delivery address on this profile. It owns its data, so a failure here does not take the page with it. */
export function DeliveryAddress() {
  const user = useCurrentUser()
  const toast = useToast()
  const headingId = useId()
  const email = user?.email
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [editing, setEditing] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)

  useEffect(() => {
    if (!email) return
    let live = true
    getAddress(email).then(
      (address) => {
        if (live) setState({ status: 'ready', address })
      },
      () => {
        if (live) setState({ status: 'error' })
      },
    )
    return () => {
      live = false
    }
  }, [email, attempt])

  const address = state.status === 'ready' ? state.address : null

  // Add address unmounts when the first save lands, so the dialog has nothing to hand focus back to: Edit address is it.
  useEffect(() => {
    if (!refocus.current || !address) return
    refocus.current = false
    editButton.current?.focus()
  }, [address])

  return (
    <section aria-labelledby={headingId} className={`${PROFILE_CARD} w-full max-w-sm sm:aspect-square`}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="display text-xl text-fg">
          Delivery address
        </h2>
        {address && (
          <IconEditButton ref={editButton} label="Edit address" onClick={() => setEditing(true)} className="-mt-2 -mr-2" />
        )}
      </div>

      {state.status === 'loading' && (
        <div role="status" aria-label="Loading your delivery address" className="mt-4 animate-pulse">
          <div className="h-6 w-2/3 rounded-xl bg-line" />
          <div className="mt-2 h-6 w-1/2 rounded-xl bg-line" />
          <div className="mt-2 h-6 w-1/3 rounded-xl bg-line" />
          <div className="mt-4 h-11 w-36 rounded-xl bg-line-strong" />
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="mt-4">
          <p className="flex items-start gap-2 text-base leading-relaxed text-fg">
            <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
            <span>
              We couldn&apos;t read your saved address. Your browser is blocking storage on this device, so nothing could
              be loaded. Allow site storage, then try again.
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              setState({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
            className={`${PRIMARY_BUTTON} mt-4`}
          >
            Try again
          </button>
        </div>
      )}

      {state.status === 'ready' && !address && (
        <>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-fg-muted">
            You have not saved a delivery address yet. Add one and checkout fills it in for you.
          </p>
          <button type="button" onClick={() => setEditing(true)} className={`${PRIMARY_BUTTON} mt-4`}>
            Add address
          </button>
        </>
      )}

      {address && (
        <>
          <address className="mt-2 text-base leading-relaxed wrap-break-word text-fg not-italic">
            {lines(address).map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
          <p className="mt-2 text-sm text-fg-muted">Saved on this device only.</p>
        </>
      )}

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={address ? 'Edit your delivery address' : 'Add your delivery address'}
      >
        <AddressForm
          initial={address}
          onSaved={(saved) => {
            refocus.current = true
            setState({ status: 'ready', address: saved })
            setEditing(false)
            toast.show({ kind: 'success', message: 'Address saved.' })
          }}
          footer={(submit) => (
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setEditing(false)} className={SECONDARY_BUTTON}>
                Cancel
              </button>
              {submit}
            </div>
          )}
        />
      </Modal>
    </section>
  )
}
