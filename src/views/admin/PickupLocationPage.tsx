import { lazy, Suspense, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { AddressForm } from '../../components/address/AddressForm'
import { CopyButton } from '../../components/admin/pickup/CopyButton'
import {
  PICKUP_CARD,
  PICKUP_FOOT,
  PICKUP_GRID,
  PICKUP_HEAD,
  PICKUP_MAP,
  PICKUP_MAP_FOOT,
  PICKUP_MAP_HEAD,
  PICKUP_ROW,
  PICKUP_TILE,
  PICKUP_UPDATED,
  PickupBodySkeleton,
} from '../../components/admin/pickup/PickupLocationSkeleton'
import { ConfirmDialog } from '../../components/admin/users/ConfirmDialog'
import { MapPinIcon, PhoneIcon, StoreIcon, TargetIcon } from '../../components/form/icons'
import { SectionBody } from '../../components/staff/StaffSection'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON, SECONDARY_BUTTON_SM } from '../../components/ui/buttonStyles'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useSection } from '../../hooks/useSection'
import { AddressError, type Address, type AddressErrorKind, type AddressInput } from '../../service/addresses'
import { ProductListError } from '../../service/fetchProductList'
import {
  createPickupLocation,
  deletePickupLocation,
  fetchPickupLocations,
  updatePickupLocation,
  type PickupInput,
  type PickupLocation,
} from '../../service/pickupLocation'
import { signOut } from '../../service/signOut'
import { formatPlacedAt } from '../../utils/format'

// Leaflet stays out of the page's bundle until the saved location is on screen.
const PickupMapPreview = lazy(() => import('../../components/admin/pickup/PickupMapPreview'))

const META_DESCRIPTION =
  'Set where Lalamove riders collect SilhouFit orders. Pin the pickup location on a map or use your current location, then save the address and contact for riders.'

const PIN_COPY = {
  hint: 'Drop a pin and we will fill in the fields below. Riders are sent to this exact spot.',
  missing: 'Pin the pickup spot on the map so riders can find it.',
  mapNote: 'Your location is sent to OpenStreetMap only to fill these fields. The pin is saved as the pickup spot when you save.',
}

const DEFAULT_COPY = {
  label: 'Make this the default location',
  first: 'Your first pickup location is always the default.',
  locked: 'To change the default, set another location as default.',
  help: 'Riders are booked from the default location for all new orders. Leave this off to keep it saved as a spare.',
}

/** The form edits an Address, so a saved pickup location is dressed as one. Contact name and phone ride in the recipient fields. */
const toAddress = (l: PickupLocation): Address => ({
  id: l.id,
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
  isDefault: l.isDefault,
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

const ADDRESS_KIND: Record<string, AddressErrorKind> = { forbidden: 'unauthorized', validation: 'invalid', 'not-found': 'not-found', 'rate-limit': 'rate-limit', network: 'network' }

/** The form words failures by AddressError kind; 401 and 403 both end the session. */
function asAddressError(error: unknown) {
  if (!(error instanceof ProductListError)) return new AddressError('server')
  return new AddressError(ADDRESS_KIND[error.kind] ?? 'server', error.detail)
}

const addressOf = (l: PickupInput) =>
  [l.streetAddress, l.addressLine2, l.barangay, l.cityMunicipality, l.province, l.region, l.postalCode].filter(Boolean).join(', ')
const coordinatesOf = (l: PickupInput) => `${l.latitude.toFixed(6)}, ${l.longitude.toFixed(6)}`

const labelOf = (l: PickupLocation) => l.label ?? l.cityMunicipality

const openMapUrl = (l: PickupInput) => `https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}#map=17/${l.latitude}/${l.longitude}`
/** City or municipality and province; NCR has no province, so its region stands in. */
const zoneOf = (l: PickupInput) => [l.cityMunicipality, l.province ?? (l.region.includes('NCR') ? l.region : null)].filter(Boolean).join(', ')

/** A detail row: an icon tile on the left, the term and its value, and a copy button on the right. */
function Row({ icon, term, copy, children }: { icon: ReactNode; term: string; copy: { text: string; what: string }; children: ReactNode }) {
  return (
    <div className={PICKUP_ROW}>
      <dt className="text-sm leading-5 text-fg-muted">
        <span aria-hidden="true" className={`${PICKUP_TILE} bg-fg/5 text-fg-muted`}>
          {icon}
        </span>
        {term}
      </dt>
      <dd className="mt-0.5 min-w-0 text-base leading-6 break-words text-fg">
        {children}
        <CopyButton text={copy.text} what={copy.what} className="absolute top-1/2 right-3 -translate-y-1/2" />
      </dd>
    </div>
  )
}

/** Whether checkout can quote and riders can be booked; shown once the location is known. */
function StatusPill({ active, label = active ? 'Active for dispatch' : 'Not set' }: { active: boolean; label?: string }) {
  return (
    <span
      className={`font-ui inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-sm whitespace-nowrap ${
        active ? 'border-success/40 bg-success/5 text-success dark:bg-success/15' : 'border-line-strong text-fg-muted'
      }`}
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${active ? 'bg-success' : 'border-2 border-dashed border-fg-muted'}`} />
      {label}
    </span>
  )
}

/** What a failed action says: what happened, why, and what to do next. */
function failureMessage(error: unknown, what: string) {
  const { kind, detail } = error instanceof ProductListError ? error : { kind: 'server', detail: undefined }
  const why =
    kind === 'not-found'
      ? 'That pickup location no longer exists, probably deleted on another device. We reloaded the list.'
      : kind === 'validation' && /only pickup location/i.test(detail ?? '')
        ? 'It is the only pickup location, and riders need somewhere to collect orders. Add another one first.'
        : kind === 'validation'
          ? `The server said: ${(detail ?? 'it did not accept this').replace(/[.\s]+$/, '')}. Reload the page, then try again.`
          : kind === 'rate-limit'
            ? 'Our servers are limiting requests right now. Try again shortly.'
            : kind === 'network'
              ? 'The connection dropped. Check your connection, then try again.'
              : 'Something went wrong on our side. Try again in a moment.'
  return `We couldn't ${what}. ${why}`
}

interface CardProps {
  location: PickupLocation
  headingRef?: Ref<HTMLHeadingElement>
  /** The row under the details: a note and the buttons. */
  footer: ReactNode
}

/** One saved location: its details with copy buttons, and `footer` for what can be done to it. The details are also the map's text alternative. */
function LocationCard({ location, headingRef, footer }: CardProps) {
  const address = addressOf(location)
  const coordinates = coordinatesOf(location)
  const labelId = `pickup-label-${location.id}`
  return (
    <section aria-labelledby={location.isDefault ? 'pickup-heading' : labelId} className={PICKUP_CARD}>
      <div className={PICKUP_HEAD}>
        <span aria-hidden="true" className="row-span-2 flex size-11 items-center justify-center rounded-xl bg-fg/5 text-fg">
          <StoreIcon />
        </span>
        {location.isDefault ? (
          <h2 id="pickup-heading" ref={headingRef} tabIndex={-1} className="text-sm leading-5 text-fg-muted outline-none">
            Pickup address
          </h2>
        ) : (
          <p className="text-sm leading-5 text-fg-muted">Saved location</p>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3">
          <p id={labelId} className="display min-w-0 text-lg leading-7 break-words text-fg">
            {labelOf(location)}
          </p>
          {location.isDefault && <StatusPill active label="Default" />}
        </div>
        <p className={`${PICKUP_UPDATED} text-sm leading-5 text-fg-muted tabular-nums sm:self-center sm:text-right`}>
          Updated <time dateTime={location.updatedAt}>{formatPlacedAt(location.updatedAt)}</time>
        </p>
      </div>
      <dl className="divide-y divide-line">
        <Row icon={<MapPinIcon />} term="Address" copy={{ text: address, what: 'address' }}>
          {address}
        </Row>
        <Row icon={<PhoneIcon />} term="Rider contact" copy={{ text: location.contactPhone, what: 'rider phone number' }}>
          {location.contactName}, <span className="tabular-nums">{location.contactPhone}</span>
          <span className="mt-1 block text-sm leading-5 text-fg-muted">Shared with assigned Lalamove riders upon pickup arrival.</span>
        </Row>
        <Row icon={<TargetIcon />} term="Coordinates" copy={{ text: coordinates, what: 'coordinates' }}>
          <span className="font-mono tabular-nums">{coordinates}</span>
        </Row>
      </dl>
      <div className={PICKUP_FOOT}>{footer}</div>
    </section>
  )
}

const FOOT_NOTE = 'min-w-0 text-sm leading-5 text-fg-muted'
const FOOT_BUTTONS = 'flex flex-col gap-3 sm:shrink-0 sm:flex-row sm:flex-wrap'

interface SummaryProps {
  location: PickupLocation
  /** Whether another location could take over as the default, which is what lets this one be deleted. */
  hasOthers: boolean
  headingRef: Ref<HTMLHeadingElement>
  onEdit: () => void
  onDelete: () => void
}

/** The default location as two cards: its details, and a read-only map. */
function Summary({ location, hasOthers, headingRef, onEdit, onDelete }: SummaryProps) {
  return (
    <div className={PICKUP_GRID}>
      <LocationCard
        location={location}
        headingRef={headingRef}
        footer={
          <>
            <p className={FOOT_NOTE}>
              Used for all new Lalamove rider bookings and checkout quotes.
            </p>
            <div className={FOOT_BUTTONS}>
              {hasOthers && (
                <button type="button" aria-label={`Delete ${labelOf(location)}`} onClick={onDelete} className={SECONDARY_BUTTON}>
                  Delete
                </button>
              )}
              <button id={`pickup-edit-${location.id}`} type="button" aria-label={`Edit ${labelOf(location)}`} onClick={onEdit} className={PRIMARY_BUTTON}>
                Edit
              </button>
            </div>
          </>
        }
      />
      <section aria-labelledby="pickup-map-heading" className={PICKUP_CARD}>
        <div className={PICKUP_MAP_HEAD}>
          <MapPinIcon className="text-fg-muted" />
          <h2 id="pickup-map-heading" className="text-base font-semibold text-fg">
            Rider pin preview
          </h2>
        </div>
        <div className={`${PICKUP_MAP} relative`}>
          <Suspense fallback={<div role="status" aria-label="Loading the map" className="absolute inset-0 animate-pulse bg-line" />}>
            <PickupMapPreview key={`${location.latitude},${location.longitude}`} lat={location.latitude} lon={location.longitude} label={labelOf(location)} />
          </Suspense>
        </div>
        <div className={PICKUP_MAP_FOOT}>
          <div className="min-w-0">
            <p className="text-sm leading-5 text-fg-muted">Dispatch zone</p>
            <p className="mt-0.5 text-base leading-6 break-words text-fg">{zoneOf(location)}</p>
          </div>
          <a href={openMapUrl(location)} target="_blank" rel="noopener noreferrer" className={`${SECONDARY_BUTTON_SM} shrink-0`}>
            Open map
            <span className="sr-only">, opens in a new tab</span>
          </a>
        </div>
      </section>
    </div>
  )
}

interface SavedProps {
  location: PickupLocation
  onEdit: () => void
  onMakeDefault: () => void
  onDelete: () => void
}

/** A saved spare: kept for later, and not used for riders until it is made the default. */
function SavedLocation({ location, onEdit, onMakeDefault, onDelete }: SavedProps) {
  return (
    <li className="min-w-0">
      <LocationCard
        location={location}
        footer={
          <>
            <p className={FOOT_NOTE}>A saved spare. Riders are not booked here until you set it as default.</p>
            <div className={FOOT_BUTTONS}>
              <button type="button" aria-label={`Set as default ${labelOf(location)}`} onClick={onMakeDefault} className={SECONDARY_BUTTON}>
                Set as default
              </button>
              <button id={`pickup-edit-${location.id}`} type="button" aria-label={`Edit ${labelOf(location)}`} onClick={onEdit} className={SECONDARY_BUTTON}>
                Edit
              </button>
              <button type="button" aria-label={`Delete ${labelOf(location)}`} onClick={onDelete} className={SECONDARY_BUTTON}>
                Delete
              </button>
            </div>
          </>
        }
      />
    </li>
  )
}

const STEPS = ['Pin the spot on the map', 'Add the rider contact', 'Save and riders are sent there']

/** Nothing saved yet: what is missing, what setting it takes, and the button that starts. */
function EmptyCard({ onSet }: { onSet: () => void }) {
  return (
    <section aria-label="Pickup address" className={`${PICKUP_CARD} mx-auto w-full max-w-3xl text-center`}>
      <div className="relative isolate flex h-44 items-center justify-center border-b border-line bg-canvas">
        {/* A faint dotted map grid from tokens, fading out toward the edges, with the pin on its middle. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle,var(--line-strong)_1px,transparent_1.5px)] bg-size-[18px_18px] mask-[radial-gradient(ellipse_at_center,black_35%,transparent_75%)]"
        />
        <span aria-hidden="true" className="relative flex size-20 items-center justify-center rounded-full bg-fg/5">
          <span className="block size-7 -translate-y-1 -rotate-45 rounded-[50%_50%_50%_0] border-2 border-canvas bg-fg shadow-md" />
        </span>
      </div>
      <div className="p-5 sm:p-8">
        <h2 className="display text-xl text-fg">No pickup location yet</h2>
        <p className="mx-auto mt-2 max-w-prose text-base text-fg-muted">No pickup location is set. Checkout can't quote delivery and riders can't be booked until you set one.</p>
        <ol className="mt-6 grid gap-3 text-left sm:grid-cols-3">
          {STEPS.map((step, n) => (
            <li key={step} className="flex items-start gap-3 rounded-xl border border-line p-3">
              <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-fg/5 text-sm font-semibold text-fg tabular-nums">
                {n + 1}
              </span>
              <span className="text-base leading-6 text-fg">{step}</span>
            </li>
          ))}
        </ol>
        <button id="pickup-add" type="button" onClick={onSet} className={`${PRIMARY_BUTTON} mt-6 w-full sm:mx-auto sm:w-auto`}>
          Set pickup location
        </button>
      </div>
    </section>
  )
}

/** The one-card states (empty, error, form): the same card, with the heading that takes focus. */
function PlainCard({ headingRef, wide = false, children }: { headingRef: Ref<HTMLHeadingElement>; wide?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby="pickup-heading" className={`${PICKUP_CARD} ${wide ? 'max-w-6xl' : 'max-w-2xl'} p-5 sm:p-6`}>
      <h2 id="pickup-heading" ref={headingRef} tabIndex={-1} className="display mb-3 text-xl text-fg outline-none">
        Pickup address
      </h2>
      {children}
    </section>
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
  input: AddressInput
  resolve: (address: Address | null) => void
  reject: (error: unknown) => void
}

interface Action {
  kind: 'default' | 'delete'
  location: PickupLocation
}

/** Where Lalamove riders collect orders: the locations an admin saves, with one default that dispatch and checkout quotes use. */
export function PickupLocationPage() {
  useDocumentTitle('Pickup location — SilhouFit')
  useMetaDescription(META_DESCRIPTION)
  const toast = useToast()
  const section = useSection(fetchPickupLocations)
  // The form's starting point: the location being edited dressed as an address, or null for a new one.
  const [form, setForm] = useState<{ id?: string; initial: Address | null } | null>(null)
  const [edited, setEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [replacing, setReplacing] = useState<Replacing | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [writing, setWriting] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // The id of the button that opened the form: its card is off the page meanwhile, so it is looked up again on return.
  const opener = useRef('pickup-add')
  const focusHeading = useRef(false)
  const focusAfterAction = useRef(false)
  const wasOpen = useRef(false)
  const locations = section.state.status === 'success' ? section.state.data : []
  const current = locations.find((l) => l.isDefault)
  const others = locations.filter((l) => !l.isDefault)
  const editing = locations.find((l) => l.id === form?.id)

  // Back on the list: after a save the heading takes focus, after Cancel the button that opened the form.
  useEffect(() => {
    if (wasOpen.current && !form) (focusHeading.current ? headingRef.current : document.getElementById(opener.current))?.focus()
    wasOpen.current = form !== null
  }, [form])

  // Set as default and Delete take their button off the page, so once their dialog is gone the heading takes focus.
  useEffect(() => {
    if (action || !focusAfterAction.current) return
    focusAfterAction.current = false
    headingRef.current?.focus()
  }, [action])

  // There is no router blocker, so a reload or closing the tab is the only exit that can be warned about.
  useEffect(() => {
    if (!form || !edited) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [form, edited])

  function open(location?: PickupLocation) {
    opener.current = location ? `pickup-edit-${location.id}` : 'pickup-add'
    focusHeading.current = false
    setEdited(false)
    setForm({ id: location?.id, initial: location ? toAddress(location) : null })
  }

  // A write can demote or promote other rows, so the list is read again rather than patched.
  const reload = () =>
    fetchPickupLocations().then(section.swap, () => toast.show({ kind: 'error', message: "We couldn't refresh the list. Check your connection, then reload the page." }))

  async function write(input: AddressInput): Promise<Address> {
    const fields = toPickup(input)
    try {
      // The first location is the default on its own; a later one only when asked, and an edit only when it is not already.
      const location = editing
        ? await updatePickupLocation(editing.id, { ...fields, ...(input.isDefault && !editing.isDefault && { isDefault: true }) })
        : await createPickupLocation({ ...fields, ...(input.isDefault && locations.length > 0 && { isDefault: true }) })
      await reload()
      return toAddress(location)
    } catch (error) {
      throw asAddressError(error)
    }
  }

  // Only the default decides where riders go, so only editing it waits for the dialog's answer.
  function save(input: AddressInput): Promise<Address | null> {
    if (!editing?.isDefault) return write(input)
    return new Promise((resolve, reject) => setReplacing({ input, resolve, reject }))
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
    toast.show({ kind: 'success', message: editing ? 'Pickup location saved' : 'Pickup location added' })
  }

  async function runAction() {
    if (!action) return
    const { kind, location } = action
    setWriting(true)
    try {
      if (kind === 'delete') await deletePickupLocation(location.id)
      else await updatePickupLocation(location.id, { isDefault: true })
      await reload()
      focusAfterAction.current = true
      toast.show({ kind: 'success', message: kind === 'delete' ? 'Pickup location deleted' : 'Default pickup location changed' })
    } catch (error) {
      if (error instanceof ProductListError && error.kind === 'forbidden') signOut()
      else {
        if (error instanceof ProductListError && error.kind === 'not-found') {
          focusAfterAction.current = true
          void reload()
        }
        toast.show({ kind: 'error', message: failureMessage(error, kind === 'delete' ? 'delete the pickup location' : 'change the default pickup location') })
      }
    } finally {
      setWriting(false)
      setAction(null)
    }
  }

  return (
    <div className="grid gap-3">
      <header className="flex min-h-8 flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="display text-2xl text-fg sm:text-3xl">Pickup location</h1>
            {section.state.status === 'success' && <StatusPill active={locations.length > 0} />}
          </div>
          <p className="mt-1 text-xs text-fg-muted">Where Lalamove riders collect orders.</p>
        </div>
        {locations.length > 0 && !form && (
          <button id="pickup-add" type="button" onClick={() => open()} className={`${SECONDARY_BUTTON} w-full sm:w-auto`}>
            Add pickup location
          </button>
        )}
      </header>
      {section.state.status === 'error' ? (
        <PlainCard headingRef={headingRef}>
          <SectionBody section={section} what="the pickup location" skeleton={null}>
            {() => null}
          </SectionBody>
        </PlainCard>
      ) : (
        <SectionBody
          section={section}
          what="the pickup location"
          skeleton={
            <div role="status" aria-label="Loading the pickup location">
              <PickupBodySkeleton />
            </div>
          }
        >
          {() =>
            form ? (
              <PlainCard headingRef={headingRef} wide>
                <div onInput={() => setEdited(true)} onClick={() => setEdited(true)}>
                  <AddressForm
                    wide
                    initial={form.initial}
                    existingCount={locations.length}
                    defaultCopy={DEFAULT_COPY}
                    requirePin
                    nameLabel="Contact name"
                    saveLabel="Save pickup location"
                    pinCopy={PIN_COPY}
                    save={save}
                    onSaved={finishSave}
                    onUnauthorized={signOut}
                    // Reload behind the form, which stays open with its message and the edit; the next Save adds it again.
                    onGone={() => void reload()}
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
              </PlainCard>
            ) : current ? (
              <>
                <Summary location={current} hasOthers={others.length > 0} headingRef={headingRef} onEdit={() => open(current)} onDelete={() => setAction({ kind: 'delete', location: current })} />
                {others.length > 0 && (
                  <section aria-labelledby="pickup-others-heading" className="flex max-w-6xl min-w-0 flex-col gap-3">
                    <h2 id="pickup-others-heading" className="text-base font-semibold text-fg">
                      Other pickup locations
                    </h2>
                    <ul className="flex flex-col gap-3">
                      {others.map((location) => (
                        <SavedLocation
                          key={location.id}
                          location={location}
                          onEdit={() => open(location)}
                          onMakeDefault={() => setAction({ kind: 'default', location })}
                          onDelete={() => setAction({ kind: 'delete', location })}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </>
            ) : (
              <EmptyCard onSet={() => open()} />
            )
          }
        </SectionBody>
      )}
      <ConfirmDialog open={replacing !== null} title="Replace the pickup location?" confirmLabel="Replace pickup location" pending={writing} onConfirm={() => void confirm()} onClose={cancelReplace}>
        {replacing && editing && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Place heading="Now" place={editing} />
              <Place heading="New" place={toPickup(replacing.input)} />
            </div>
            <p className="mt-3">Riders booked after this go to the new spot. Orders already handed to a rider are not affected.</p>
          </>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={action !== null}
        title={action?.kind === 'delete' ? 'Delete this pickup location?' : 'Change the default pickup location?'}
        confirmLabel={action?.kind === 'delete' ? 'Delete pickup location' : 'Set as default'}
        pending={writing}
        onConfirm={() => void runAction()}
        onClose={() => setAction(null)}
      >
        {action?.kind === 'delete' && (
          <>
            <Place heading="Delete" place={action.location} />
            {action.location.isDefault && <p className="mt-3">This is the default location. Your newest other pickup location becomes the default, so riders can still be booked.</p>}
            <p className="mt-3">Orders already shipped keep the pickup details they left from. This can't be undone.</p>
          </>
        )}
        {action?.kind === 'default' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {current && <Place heading="Now" place={current} />}
              <Place heading="New" place={action.location} />
            </div>
            <p className="mt-3">Riders are booked from the new location for all orders dispatched from now on. Orders already handed to a rider are not affected.</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}
