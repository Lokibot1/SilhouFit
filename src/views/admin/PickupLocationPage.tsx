import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AddressForm } from '../../components/address/AddressForm'
import { PICKUP_ROW, PickupBodySkeleton } from '../../components/admin/pickup/PickupLocationSkeleton'
import { ConfirmDialog } from '../../components/admin/users/ConfirmDialog'
import { EmptyNote, SectionBody } from '../../components/staff/StaffSection'
import { STAFF_SECTION } from '../../components/staff/StaffSkeleton'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { SampleDataBadge } from '../../components/ui/SampleDataBadge'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useSection } from '../../hooks/useSection'
import { AddressError, type Address, type AddressErrorKind, type AddressInput } from '../../service/addresses'
import { ProductListError } from '../../service/fetchProductList'
import { PICKUP_SAMPLE_DATA, fetchPickupLocation, savePickupLocation, type PickupInput, type PickupLocation } from '../../service/pickupLocation'
import { signOut } from '../../service/signOut'
import { formatPlacedAt } from '../../utils/format'

const META_DESCRIPTION =
  'Set where Lalamove riders collect SilhouFit orders. Pin the pickup location on a map or use your current location, then save the address and contact for riders.'

const PIN_COPY = {
  hint: 'Drop a pin and we will fill in the fields below. Riders are sent to this exact spot.',
  missing: 'Pin the pickup spot on the map so riders can find it.',
  mapNote: 'Your location is sent to OpenStreetMap only to fill these fields. The pin is saved as the pickup spot when you save.',
}

/** The form edits an Address, so a saved pickup location is dressed as one. Contact name and phone ride in the recipient fields. */
const toAddress = (l: PickupLocation): Address => ({
  id: 'pickup-location',
  label: l.label,
  recipientName: l.contactName,
  phone: l.contactPhone,
  region: l.region,
  province: l.province,
  cityMunicipality: l.cityMunicipality,
  barangay: l.barangay,
  streetAddress: l.streetAddress,
  addressLine2: l.addressLine2,
  postalCode: l.postalCode,
  country: 'PH',
  latitude: l.latitude,
  longitude: l.longitude,
  isDefault: false,
  createdAt: l.updatedAt,
  updatedAt: l.updatedAt,
})

const toPickup = (input: AddressInput): PickupInput => ({
  label: input.label ?? null,
  contactName: input.recipientName,
  contactPhone: input.phone,
  region: input.region,
  province: input.province ?? null,
  cityMunicipality: input.cityMunicipality,
  barangay: input.barangay,
  streetAddress: input.streetAddress,
  addressLine2: input.addressLine2 ?? null,
  postalCode: input.postalCode,
  latitude: input.latitude,
  longitude: input.longitude,
})

const ADDRESS_KIND: Record<string, AddressErrorKind> = { forbidden: 'unauthorized', validation: 'invalid', 'rate-limit': 'rate-limit', network: 'network' }

/** The form words failures by AddressError kind; 401 and 403 both end the session. */
function asAddressError(error: unknown) {
  if (!(error instanceof ProductListError)) return new AddressError('server')
  return new AddressError(ADDRESS_KIND[error.kind] ?? 'server', error.detail)
}

const addressOf = (l: PickupInput) =>
  [l.streetAddress, l.addressLine2, l.barangay, l.cityMunicipality, l.province, l.region, l.postalCode].filter(Boolean).join(', ')
const coordinatesOf = (l: PickupInput) => `${l.latitude.toFixed(6)}, ${l.longitude.toFixed(6)}`

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className={PICKUP_ROW}>
      <dt className="text-sm leading-6 text-fg-muted">{term}</dt>
      <dd className="min-w-0 text-base leading-6 break-words text-fg">{children}</dd>
    </div>
  )
}

/** Also the text alternative for the pin: the coordinates and the address are written out. */
function Summary({ location }: { location: PickupLocation }) {
  return (
    <dl className="divide-y divide-line border-y border-line">
      <Row term="Label">{location.label ?? <span className="text-fg-muted">No label</span>}</Row>
      <Row term="Address">{addressOf(location)}</Row>
      <Row term="Contact">
        {location.contactName}, <span className="tabular-nums">{location.contactPhone}</span>
      </Row>
      <Row term="Coordinates">
        <span className="tabular-nums">{coordinatesOf(location)}</span>
      </Row>
      <Row term="Updated">
        {formatPlacedAt(location.updatedAt)}
        {location.updatedBy && ` by ${location.updatedBy.fullName}`}
      </Row>
    </dl>
  )
}

function Place({ heading, place }: { heading: string; place: PickupInput }) {
  return (
    <div className="min-w-0 rounded-xl border border-line p-3">
      <p className="text-sm font-semibold text-fg">{heading}</p>
      <p className="mt-1 text-base break-words text-fg">{place.label ?? 'No label'}</p>
      <p className="text-base break-words text-fg-muted">{addressOf(place)}</p>
      <p className="text-base break-words text-fg-muted">
        {place.contactName}, <span className="tabular-nums">{place.contactPhone}</span>
      </p>
      <p className="text-base text-fg-muted tabular-nums">{coordinatesOf(place)}</p>
    </div>
  )
}

interface Replacing {
  input: PickupInput
  resolve: (address: Address | null) => void
  reject: (error: unknown) => void
}

/** Where Lalamove riders collect orders: one saved location an admin sets, changes and replaces. */
export function PickupLocationPage() {
  useDocumentTitle('Pickup location — SilhouFit')
  useMetaDescription(META_DESCRIPTION)
  const toast = useToast()
  const section = useSection(fetchPickupLocation)
  // The form's starting point: the saved location dressed as an address, or null for the first one.
  const [form, setForm] = useState<{ initial: Address | null } | null>(null)
  const [edited, setEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [replacing, setReplacing] = useState<Replacing | null>(null)
  const [writing, setWriting] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const openRef = useRef<HTMLButtonElement>(null)
  const focusHeading = useRef(false)
  const wasOpen = useRef(false)
  const saved = section.state.status === 'success' ? section.state.data : null

  // Back on the summary: after a save the heading takes focus, after Cancel the button that opened the form.
  useEffect(() => {
    if (wasOpen.current && !form) (focusHeading.current ? headingRef : openRef).current?.focus()
    wasOpen.current = form !== null
  }, [form])

  // There is no router blocker, so a reload or closing the tab is the only exit that can be warned about.
  useEffect(() => {
    if (!form || !edited) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [form, edited])

  function open() {
    focusHeading.current = false
    setEdited(false)
    setForm({ initial: saved ? toAddress(saved) : null })
  }

  async function write(input: PickupInput): Promise<Address> {
    try {
      const location = await savePickupLocation(input)
      section.swap(location)
      return toAddress(location)
    } catch (error) {
      throw asAddressError(error)
    }
  }

  // The first save goes straight through; replacing a saved one waits for the dialog's answer.
  function save(input: AddressInput): Promise<Address | null> {
    const next = toPickup(input)
    if (!saved) return write(next)
    return new Promise((resolve, reject) => setReplacing({ input: next, resolve, reject }))
  }

  async function confirm() {
    if (!replacing) return
    setWriting(true)
    try {
      replacing.resolve(await write(replacing.input))
    } catch (error) {
      replacing.reject(error)
    } finally {
      setWriting(false)
      setReplacing(null)
    }
  }

  function cancelReplace() {
    replacing?.resolve(null)
    setReplacing(null)
  }

  function finishSave() {
    focusHeading.current = true
    setForm(null)
    toast.show({ kind: 'success', message: 'Pickup location saved' })
  }

  return (
    <div className="grid gap-3">
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl text-fg sm:text-3xl">Pickup location</h1>
          <p className="mt-1 text-xs text-fg-muted">Where Lalamove riders collect orders.</p>
        </div>
        {PICKUP_SAMPLE_DATA && <SampleDataBadge reason="Saved in this browser only. Riders still go to the server's pickup address until the backend is connected." />}
      </header>
      <section aria-labelledby="pickup-heading" className={STAFF_SECTION}>
        <h2 id="pickup-heading" ref={headingRef} tabIndex={-1} className="display mb-3 text-xl text-fg outline-none">
          Pickup address
        </h2>
        <SectionBody section={section} what="the pickup location" skeleton={<div role="status" aria-label="Loading the pickup location"><PickupBodySkeleton /></div>}>
          {(location) =>
            form ? (
              <div className="max-w-xl" onInput={() => setEdited(true)} onClick={() => setEdited(true)}>
                <AddressForm
                  initial={form.initial}
                  hideDefault
                  requirePin
                  nameLabel="Contact name"
                  saveLabel="Save pickup location"
                  pinCopy={PIN_COPY}
                  save={save}
                  onSaved={finishSave}
                  onUnauthorized={signOut}
                  onPendingChange={setSaving}
                  footer={(submit) => (
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button type="button" onClick={() => setForm(null)} disabled={saving} className={`${SECONDARY_BUTTON} disabled:opacity-60`}>
                        Cancel
                      </button>
                      {submit}
                    </div>
                  )}
                />
              </div>
            ) : location ? (
              <>
                <Summary location={location} />
                <button ref={openRef} type="button" onClick={open} className={`${SECONDARY_BUTTON} mt-4 w-full sm:w-auto`}>
                  Change pickup location
                </button>
              </>
            ) : (
              <>
                <EmptyNote>No pickup location is saved here yet. Until you save one, riders go to the address in the server settings.</EmptyNote>
                <button ref={openRef} type="button" onClick={open} className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}>
                  Set pickup location
                </button>
              </>
            )
          }
        </SectionBody>
      </section>
      <ConfirmDialog open={replacing !== null} title="Replace the pickup location?" confirmLabel="Replace pickup location" pending={writing} onConfirm={() => void confirm()} onClose={cancelReplace}>
        {replacing && saved && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Place heading="Now" place={saved} />
              <Place heading="New" place={replacing.input} />
            </div>
            <p className="mt-3">Riders booked after this go to the new spot. Orders already handed to a rider are not affected.</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}
