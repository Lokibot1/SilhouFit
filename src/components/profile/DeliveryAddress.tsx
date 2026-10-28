import { useEffect, useId, useRef, useState } from 'react'
import {
  deleteAddress,
  getAddressById,
  loadAddresses,
  onAddressesChanged,
  updateAddress,
  type Address,
  type AddressErrorKind,
} from '../../service/addresses'
import { AddressForm } from '../address/AddressForm'
import { AlertIcon, MapPinIcon, SpinnerIcon, TrashIcon } from '../form/icons'
import { useToast } from '../toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON, SECONDARY_BUTTON_SM } from '../ui/buttonStyles'
import { IconEditButton } from '../ui/IconEditButton'
import { Modal } from '../ui/Modal'
import { Tooltip } from '../ui/Tooltip'
import { PROFILE_CARD } from './ProfileSkeleton'

type State =
  | { status: 'loading' }
  | { status: 'error'; kind: Exclude<AddressErrorKind, 'unauthorized'> }
  | { status: 'ready'; addresses: Address[] }

const LOAD_ERROR: Record<Exclude<AddressErrorKind, 'unauthorized'>, string> = {
  network: 'The connection dropped before we got a response. Check your connection, then try again.',
  'rate-limit': 'Our servers are limiting requests right now. Wait a minute, then try again.',
  server: 'Something went wrong on our side. Try again in a moment.',
  invalid: 'The server did not accept the request. Try again in a moment.',
  'not-found': 'No profile is saved for this account. Sign out and sign in again.',
}

const DELETE_ERROR = {
  network: 'The connection dropped before we got a response. Check your connection, then try Delete Address again.',
  'rate-limit': 'Our servers are limiting requests right now. Wait a minute, then try Delete Address again.',
  server: 'Something went wrong on our side. Try Delete Address again in a moment.',
  invalid: 'The server did not accept the request. Try Delete Address again in a moment.',
}

const kindOf = (error: unknown): AddressErrorKind => (error as { kind?: AddressErrorKind } | null)?.kind ?? 'server'

/** The one-line summary of what is saved, largest area last. */
function lines(a: Address) {
  const area = [a.barangay, a.cityMunicipality, a.province].filter(Boolean).join(', ')
  return [a.streetAddress, a.addressLine2, area, `${a.region} ${a.postalCode}`.trim()].filter((line): line is string => Boolean(line))
}

/** What a card is called in a sentence: its label, else its street. */
const nameOf = (a: Address) => a.label || a.streetAddress

// A bar centred in a row of the height the real line takes, so the card is as tall as the loaded one.
const Row = ({ row, bar }: { row: string; bar: string }) => (
  <div className={`flex items-center ${row}`}>
    <div className={`h-4 rounded-xl bg-line ${bar}`} />
  </div>
)

// Mirrors the default saved-address card (name row, recipient and phone, three address lines) so the swap does not shift the list.
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-line p-4">
      <Row row="h-8" bar="w-1/3" />
      <div className="mt-1">
        <Row row="h-6" bar="w-1/2" />
        <Row row="h-6" bar="w-2/5" />
      </div>
      <div className="mt-1">
        <Row row="h-[26px]" bar="w-2/3" />
        <Row row="h-[26px]" bar="w-3/4" />
        <Row row="h-[26px]" bar="w-1/2" />
      </div>
    </div>
  )
}

/** The saved delivery addresses on this profile. It owns its data, so a failure here does not take the page with it. */
export function DeliveryAddress({ onUnauthorized }: { onUnauthorized: () => void }) {
  const toast = useToast()
  const headingId = useId()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const forceNext = useRef(false)
  // The address being edited (null for a new one), and whether its save is in flight.
  const [editor, setEditor] = useState<{ address: Address | null } | null>(null)
  const [saving, setSaving] = useState(false)
  // Which card is being opened for edit or made the default, and the address waiting on a delete confirmation.
  const [opening, setOpening] = useState<string | null>(null)
  const [defaulting, setDefaulting] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<{ address: Address; pending: boolean; error: string | null } | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  // The card whose Set as default just ran: its button is gone once it is the default, so its Edit button takes the focus.
  const defaulted = useRef<string | null>(null)
  const editButtons = useRef(new Map<string, HTMLButtonElement>())

  function refetch() {
    forceNext.current = true
    setAttempt((n) => n + 1)
  }

  useEffect(() => {
    const controller = new AbortController()
    loadAddresses({ signal: controller.signal, force: forceNext.current }).then(
      (addresses) => setState({ status: 'ready', addresses }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        const kind = kindOf(error)
        if (kind === 'unauthorized') onUnauthorized()
        else setState({ status: 'error', kind })
      },
    )
    forceNext.current = false
    return () => controller.abort()
    // `onUnauthorized` is a fresh closure each render; `attempt` is what asks for a new read.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  // Every create, update and delete (here or in the tour) refreshes the list.
  useEffect(() => onAddressesChanged(refetch), [])

  const addresses = state.status === 'ready' ? state.addresses : null

  // The control that opened a dialog may be gone once the list changes (the empty state's Add address, a deleted card):
  // Add address is always there to take focus. The list itself is refreshed by onAddressesChanged.
  useEffect(() => {
    if (!refocus.current || !addresses) return
    refocus.current = false
    addButton.current?.focus()
  }, [addresses])

  useEffect(() => {
    const id = defaulted.current
    if (!id || !addresses) return
    defaulted.current = null
    if (!document.activeElement || document.activeElement === document.body) editButtons.current.get(id)?.focus()
  }, [addresses])

  // Edit and Set as default only look disabled while busy: a disabled button drops the focus, and the dialog would
  // then record the page as its opener.
  const busy = saving || opening !== null || defaulting !== null || deleting?.pending === true

  function failed(error: unknown, message: string) {
    if (kindOf(error) === 'unauthorized') onUnauthorized()
    else toast.show({ kind: 'error', message })
  }

  async function openEditor(address: Address) {
    if (busy) return
    setOpening(address.id)
    try {
      setEditor({ address: await getAddressById(address.id) })
    } catch (error) {
      if (kindOf(error) === 'not-found') {
        refetch()
        toast.show({ kind: 'info', message: 'That address was already deleted.' })
      } else failed(error, "We couldn't open that address. Check your connection, then try Edit again.")
    } finally {
      setOpening(null)
    }
  }

  // The dialog stays open while a save is in flight, so its result is never lost.
  function closeEditor() {
    if (!saving) setEditor(null)
  }

  function saved(address: Address) {
    const edited = editor?.address
    setSaving(false)
    setEditor(null)
    // The form hands back the very same object when nothing changed and sent nothing.
    if (address === edited) return
    // An edited card's Edit button is still there for the dialog to hand focus back to; a new address may have no opener left.
    refocus.current = !edited
    toast.show({ kind: 'success', message: edited ? 'Address updated.' : 'Address saved.' })
  }

  async function makeDefault(address: Address) {
    if (busy) return
    setDefaulting(address.id)
    defaulted.current = address.id
    try {
      await updateAddress(address.id, { isDefault: true })
      toast.show({ kind: 'success', message: 'Default address updated.' })
    } catch (error) {
      defaulted.current = null
      if (kindOf(error) === 'not-found') refetch()
      failed(error, "We couldn't change your default address. Check your connection, then try Set as default again.")
    } finally {
      setDefaulting(null)
    }
  }

  async function confirmDelete() {
    if (!deleting || deleting.pending) return
    const { address } = deleting
    setDeleting({ address, pending: true, error: null })
    try {
      await deleteAddress(address.id)
    } catch (error) {
      const kind = kindOf(error)
      if (kind === 'unauthorized') return onUnauthorized()
      // Already gone elsewhere counts as deleted.
      if (kind !== 'not-found') {
        setDeleting({ address, pending: false, error: `We couldn't delete this address. ${DELETE_ERROR[kind]}` })
        return
      }
      refetch()
    }
    refocus.current = true
    setDeleting(null)
    toast.show({ kind: 'success', message: 'Address deleted.' })
  }

  const closeDelete = () => {
    if (!deleting?.pending) setDeleting(null)
  }
  const promoted = deleting?.address.isDefault && (addresses?.length ?? 0) > 1

  return (
    <section aria-labelledby={headingId} className={`${PROFILE_CARD} w-full max-w-sm min-w-0 lg:absolute! lg:inset-0 lg:flex lg:max-w-none lg:flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="display flex items-center gap-3 text-xl text-fg">
          <MapPinIcon />
          Delivery address
        </h2>
        {!!addresses?.length && (
          <button
            ref={addButton}
            type="button"
            disabled={busy}
            onClick={() => setEditor({ address: null })}
            className={`${SECONDARY_BUTTON_SM} -mt-1`}
          >
            Add address
          </button>
        )}
        {state.status === 'loading' && <div aria-hidden="true" className="-mt-1 h-9 w-32 animate-pulse rounded-xl bg-line-strong pointer-coarse:h-11" />}
      </div>

      {state.status === 'loading' && (
        <div role="status" aria-label="Loading your delivery addresses" className="mt-4 animate-pulse">
          <CardSkeleton />
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="mt-4">
          <p className="flex items-start gap-2 text-base leading-relaxed text-fg">
            <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
            <span>We couldn&apos;t load your delivery addresses. {LOAD_ERROR[state.kind]}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setState({ status: 'loading' })
              refetch()
            }}
            className={`${PRIMARY_BUTTON} mt-4`}
          >
            Try again
          </button>
        </div>
      )}

      {addresses?.length === 0 && (
        <>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-fg-muted">
            You have not saved a delivery address yet. Add one and checkout fills it in for you.
          </p>
          <button ref={addButton} type="button" onClick={() => setEditor({ address: null })} className={`${PRIMARY_BUTTON} mt-4`}>
            Add address
          </button>
        </>
      )}

      {!!addresses?.length && (
        // Two cards show; the rest scroll. From lg the list takes the card's height instead (see ProfilePage).
        <ul
          tabIndex={0}
          aria-label="Saved delivery addresses"
          className="mt-4 max-h-112 space-y-3 overflow-y-auto overscroll-contain lg:max-h-none lg:min-h-0 lg:flex-1"
        >
          {addresses.map((a) => (
            <li key={a.id} className="rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="flex min-w-0 flex-wrap items-center gap-2 text-base font-semibold wrap-anywhere text-fg">
                  {a.label || 'Address'}
                  {a.isDefault && <span className="font-ui rounded-lg bg-fg/10 px-2 text-sm font-semibold text-fg">Default</span>}
                </p>
                <div className="-mt-3 -mr-3 flex shrink-0">
                  <IconEditButton
                    label={`Edit address ${nameOf(a)}`}
                    hint="Edit address"
                    ref={(button) => void (button ? editButtons.current.set(a.id, button) : editButtons.current.delete(a.id))}
                    ariaDisabled={busy}
                    onClick={() => void openEditor(a)}
                  />
                  <Tooltip label="Delete address">
                    <button
                      type="button"
                      aria-label={`Delete address ${nameOf(a)}`}
                      disabled={busy}
                      onClick={() => setDeleting({ address: a, pending: false, error: null })}
                      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <TrashIcon />
                    </button>
                  </Tooltip>
                </div>
              </div>
              <p className="mt-1 text-base wrap-anywhere text-fg">
                {a.recipientName}
                <span className="block text-fg-muted tabular-nums">{a.phone}</span>
              </p>
              <address className="mt-1 text-base leading-relaxed wrap-anywhere text-fg not-italic">
                {lines(a).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
              {!a.isDefault && (
                <button type="button" aria-disabled={busy || undefined} onClick={() => void makeDefault(a)} className={`${SECONDARY_BUTTON_SM} mt-3`}>
                  {defaulting === a.id && <SpinnerIcon />}
                  Set as default
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={editor !== null} onClose={closeEditor} title={editor?.address ? 'Edit your delivery address' : 'Add a delivery address'}>
        {editor && (
          <AddressForm
            initial={editor.address}
            existingCount={addresses?.length ?? 0}
            onSaved={saved}
            onUnauthorized={onUnauthorized}
            onGone={() => {
              refetch()
              setSaving(false)
              setEditor(null)
              toast.show({ kind: 'info', message: 'That address was already deleted.' })
            }}
            onPendingChange={setSaving}
            footer={(submit) => (
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeEditor} disabled={saving} className={`${SECONDARY_BUTTON} disabled:cursor-not-allowed disabled:opacity-60`}>
                  Cancel
                </button>
                {submit}
              </div>
            )}
          />
        )}
      </Modal>

      <Modal open={deleting !== null} onClose={closeDelete} title="Delete this address?">
        {deleting && (
          <>
            <p className="pb-3 text-base leading-relaxed wrap-anywhere text-fg-muted">
              Are you sure? {nameOf(deleting.address)} will be removed from your saved addresses.
              {promoted && ' Your most recently added address becomes the default.'}
            </p>
            {deleting.error && (
              <p role="alert" className="flex items-start gap-2 pb-3 text-base leading-snug text-danger">
                <AlertIcon className="mt-1 shrink-0" />
                <span>{deleting.error}</span>
              </p>
            )}
            <div className="flex flex-col-reverse gap-3 pb-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeDelete} disabled={deleting.pending} className={PRIMARY_BUTTON}>
                Cancel
              </button>
              <button type="button" onClick={() => void confirmDelete()} disabled={deleting.pending} className={`${SECONDARY_BUTTON} disabled:cursor-progress disabled:opacity-70`}>
                {deleting.pending && <SpinnerIcon />}
                Delete Address
              </button>
            </div>
          </>
        )}
      </Modal>
    </section>
  )
}
