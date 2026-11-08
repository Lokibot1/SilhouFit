import { Component, lazy, Suspense, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { usePsgcList, type ListState } from '../../hooks/usePsgcList'
import { createAddress, updateAddress, type Address, type AddressError, type AddressErrorKind, type AddressInput, type AddressPatch } from '../../service/addresses'
import { getBarangays, getCities, getProvinces, getRegions, type Barangay, type City, type Region } from '../../service/psgc'
import { ReverseGeocodeError, lookupPostal, reverseGeocode, type ReverseErrorKind } from '../../service/reverseGeocode'
import {
  ADDRESS_LIMITS,
  NATIONAL_PHONE_MAX,
  cleanText,
  filterCity,
  filterFullName,
  filterLabel,
  filterLine2,
  filterPhone,
  filterPlace,
  filterPostal,
  filterStreet,
  validateAddressPhone,
  validateCity,
  validateFullName,
  validateLabel,
  validateLine2,
  validatePlace,
  validatePostal,
  toNationalPhone,
  validateStreet,
} from '../../utils/checkoutValidation'
import { matchPlace, matchRegion } from '../../utils/psgcMatch'
import { resolveAddressCodes, type Place, type ResolvedAddress } from '../../utils/resolveAddressCodes'
import { normalizePhone } from '../../utils/signUpValidation'
import { FloatingField } from '../form/FloatingField'
import { AlertIcon, SpinnerIcon } from '../form/icons'
import { SearchSelect } from '../form/SearchSelect'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../shop/shopControls'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'
import { Checkbox } from '../ui/Checkbox'

// Leaflet and its stylesheet are only fetched once someone asks for the map. A failed import is cached by React for
// the life of a lazy component, so Back to form swaps in a fresh one and the next Pin on a map fetches again.
const loadMap = () => import('./MapPicker')
let MapPicker = lazy(loadMap)

function MapFailed({ onBack, kral }: { onBack: () => void; kral: boolean }) {
  return (
    <div className="pb-5">
      <p role="alert" className={`flex items-start gap-2 text-base leading-snug ${kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'}`}>
        <AlertIcon className="mt-1 shrink-0 text-danger" />
        The map couldn&apos;t load. Check your connection, then try again, or fill in the form instead.
      </p>
      <button
        type="button"
        onClick={() => {
          MapPicker = lazy(loadMap)
          onBack()
        }}
        className={`${kral ? KRAL_SECONDARY : SECONDARY_BUTTON} mt-4`}
      >
        Back to form
      </button>
    </div>
  )
}

class MapBoundary extends Component<{ onBack: () => void; kral: boolean; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <MapFailed onBack={this.props.onBack} kral={this.props.kral} /> : this.props.children
  }
}

const NONE: Place = { code: null, name: '' }
type Level = 'region' | 'city' | 'barangay'
type Field = 'label' | 'recipientName' | 'phone' | Level | 'street' | 'line2' | 'postal'
type Touched = Partial<Record<Field, boolean>>
// The order of the fields on screen, so a failed submit focuses the first one the user sees.
const FIELD_ORDER: Field[] = ['label', 'recipientName', 'phone', 'region', 'city', 'barangay', 'street', 'line2', 'postal']

const LOOKUP_ERRORS: Record<ReverseErrorKind, string> = {
  network: "We couldn't look up that spot. The connection to OpenStreetMap dropped. Check your connection and try again, or fill in the form yourself.",
  timeout: "We couldn't look up that spot. OpenStreetMap took too long to answer. Try again, or fill in the form yourself.",
  server: "We couldn't look up that spot. OpenStreetMap had a problem on its side. Try again in a moment, or fill in the form yourself.",
  outside: 'That spot is outside the Philippines, and SilhouFit delivers within it. Pick a spot in the Philippines, or fill in the form.',
}
const LIST_ERRORS = {
  network: 'The connection to the address list dropped.',
  timeout: 'The address list took too long to answer.',
  server: 'The address list service had a problem on its side.',
}

const FAILURE_COPY: Record<Exclude<AddressErrorKind, 'unauthorized' | 'invalid'>, string> = {
  network: "We couldn't save your address. The connection dropped before we got a response. Check your connection, then try Save address again.",
  'rate-limit': "We couldn't save your address. Our servers are limiting requests right now. Wait a minute, then try Save address again.",
  server: "We couldn't save your address. Something went wrong on our side. Try Save address again in a moment.",
  'not-found': "We couldn't save your address. It was deleted from another device. Close this window to see your current addresses.",
}

type Lookup =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; kind: ReverseErrorKind; lat: number; lon: number }
  | { status: 'done'; notes: string[] }

const SKELETON_LINE = 'h-11 animate-pulse rounded-xl bg-line'
const KRAL_SKELETON_LINE = 'h-11 animate-pulse bg-kral-porcelain dark:bg-kral-graphite'

interface ListFieldProps {
  id: string
  label: string
  noun: string
  state: ListState<{ code: string; name: string }>
  retry: () => void
  placeholder: string
  value: Place
  error?: string
  /** What to say when the list is empty ("this region"). */
  parent: string
  onPick: (code: string) => void
  onDone: () => void
  onType: () => void
  labelOf?: (item: { code: string; name: string }) => string
  kral: boolean
}

/** One cascading select with its own loading, error and empty states. */
function ListField({ id, label, noun, state, retry, placeholder, value, error, parent, onPick, onDone, onType, labelOf, kral }: ListFieldProps) {
  if (state.status === 'loading') {
    return (
      <div role="status" aria-label={`Loading ${noun}`}>
        <span className={kral ? 'font-kral-mono mb-1 block text-base text-kral-muted md:text-xs md:tracking-[0.08em] md:uppercase' : 'font-ui mb-1 block text-sm text-fg-muted'}>{label}</span>
        <div className={kral ? KRAL_SKELETON_LINE : SKELETON_LINE} />
      </div>
    )
  }
  if (state.status === 'error' || (state.status === 'success' && state.data.length === 0)) {
    const failed = state.status === 'error'
    return (
      <div role={failed ? 'alert' : 'status'} className={kral ? 'border border-kral-rule p-3' : 'rounded-xl border border-line-strong p-3'}>
        <p className={`flex items-start gap-2 text-base leading-snug ${kral ? 'font-kral-mono text-kral-fg' : 'text-fg'}`}>
          <AlertIcon className="mt-1 shrink-0 text-danger" />
          <span>
            {failed
              ? `We couldn't load the list of ${noun}. ${LIST_ERRORS[state.kind]} Check your connection and try again, or type it yourself.`
              : `No ${noun} are listed for ${parent}. Type it yourself instead.`}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {failed && (
            <button type="button" onClick={retry} className={kral ? KRAL_SECONDARY : SECONDARY_BUTTON}>
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={onType}
            className={kral ? 'kral-focus font-kral-mono min-h-11 cursor-pointer text-base font-medium text-kral-fg uppercase underline underline-offset-4 hover:text-kral-red-ink md:text-xs md:tracking-[0.08em]' : 'font-ui min-h-11 cursor-pointer rounded-xl text-base font-semibold text-fg underline underline-offset-4 hover:text-chrome-strong'}
          >
            Type it instead
          </button>
        </div>
      </div>
    )
  }
  const items = state.status === 'success' ? state.data : []
  return (
    <SearchSelect
      id={id}
      label={label}
      noun={noun}
      options={items.map((item) => ({ value: item.code, label: labelOf?.(item) ?? item.name }))}
      value={value.code}
      selectedLabel={value.name || undefined}
      onChange={onPick}
      onDone={onDone}
      placeholder={placeholder}
      disabled={state.status === 'idle'}
      error={error}
      tone={kral ? 'kral' : undefined}
    />
  )
}

const regionLabel = (item: { code: string; name: string }) => {
  const long = (item as Partial<Region>).regionName
  return long && long !== item.name ? `${item.name} (${long})` : item.name
}

interface AddressFormProps {
  /** The saved address to edit; null for a new one. */
  initial: Address | null
  /** How many addresses are saved, so the first one is always the default. */
  existingCount?: number
  /** Leaves out the default checkbox (the tour's step only ever adds the first address). */
  hideDefault?: boolean
  /** The saved address. An edit with nothing changed sends no request and returns `initial` itself. */
  onSaved: (address: Address) => void
  /** The token was rejected: the caller ends the session. */
  onUnauthorized?: () => void
  /** The address no longer exists: the caller closes the form and reloads. */
  onGone?: () => void
  /** Told when a save starts and ends, so the caller can keep the dialog open meanwhile. */
  onPendingChange?: (pending: boolean) => void
  /** Draws the row of buttons under the form; `submit` is the form's own Save button. */
  footer: (submit: ReactNode) => ReactNode
  /** 'kral' restyles the form flat and square for the KRAL pages. */
  tone?: 'kral'
}

/** Puts a saved address's places back on the lists first (the form is a skeleton meanwhile); a new address needs no lookup. */
export function AddressForm(props: AddressFormProps) {
  const { initial, footer } = props
  const kral = props.tone === 'kral'
  const [resolved, setResolved] = useState<ResolvedAddress | null>(null)

  useEffect(() => {
    if (!initial) return
    const controller = new AbortController()
    resolveAddressCodes(initial, controller.signal).then(setResolved, () => {})
    return () => controller.abort()
  }, [initial])

  if (initial && !resolved) {
    return (
      <div className="pt-3 pb-5">
        <div role="status" aria-label="Loading your address" className="grid animate-pulse grid-cols-[minmax(0,1fr)] gap-4">
          <div className={kral ? KRAL_SKELETON_LINE : SKELETON_LINE} />
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className={kral ? KRAL_SKELETON_LINE : SKELETON_LINE} />
          ))}
        </div>
        <div className="mt-5">
          {footer(
            <button type="button" disabled className={`${kral ? KRAL_PRIMARY : PRIMARY_BUTTON} w-full sm:w-auto`}>
              Save address
            </button>,
          )}
        </div>
      </div>
    )
  }
  return <AddressFormBody {...props} resolved={resolved} />
}

function AddressFormBody({
  initial,
  existingCount,
  hideDefault,
  resolved,
  onSaved,
  onUnauthorized,
  onGone,
  onPendingChange,
  footer,
  tone,
}: AddressFormProps & { resolved: ResolvedAddress | null }) {
  const kral = tone === 'kral'
  const user = useCurrentUser()
  const base = useId()
  const fieldId = (name: string) => `${base}-${name}`
  const [typed, setTyped] = useState(resolved?.typed ?? false)
  const [region, setRegion] = useState<Place>(resolved?.region ?? NONE)
  const [city, setCity] = useState<Place>(resolved?.city ?? NONE)
  const [barangay, setBarangay] = useState<Place>(resolved?.barangay ?? NONE)
  const [note, setNote] = useState(resolved?.note ?? null)
  const [label, setLabel] = useState(initial?.label ?? '')
  const [recipient, setRecipient] = useState(initial?.recipientName ?? filterFullName(user?.name ?? ''))
  const [phone, setPhone] = useState(initial ? toNationalPhone(initial.phone) : '')
  const [street, setStreet] = useState(initial?.streetAddress ?? '')
  const [line2, setLine2] = useState(initial?.addressLine2 ?? '')
  const [postal, setPostal] = useState(initial?.postalCode ?? '')
  const [makeDefault, setMakeDefault] = useState(initial ? initial.isDefault : existingCount === 0)
  const [touched, setTouched] = useState<Touched>({})
  const [pending, setPending] = useState(false)
  // A failed save, shown inside the dialog so it stays in view while the dialog traps focus.
  const [failure, setFailure] = useState<string | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' })
  const [postalState, setPostalState] = useState<'idle' | 'loading' | 'filled' | 'none'>('idle')
  // True while the postal code in the field came from a lookup, so a later lookup may replace it but never the user's own.
  const postalAuto = useRef(false)
  const postalAbort = useRef<AbortController | null>(null)
  const inFlight = useRef(false)
  const lookupAbort = useRef<AbortController | null>(null)
  const pinButton = useRef<HTMLButtonElement>(null)
  const wasMapOpen = useRef(false)

  useEffect(
    () => () => {
      lookupAbort.current?.abort()
      postalAbort.current?.abort()
    },
    [],
  )
  useEffect(() => {
    if (wasMapOpen.current && !mapOpen) pinButton.current?.focus()
    wasMapOpen.current = mapOpen
  }, [mapOpen])

  const regions = usePsgcList(getRegions, typed ? null : 'regions')
  const provinces = usePsgcList((s) => getProvinces(region.code!, s), typed || !region.code ? null : `provinces:${region.code}`)
  const cities = usePsgcList((s) => getCities(region.code!, s), typed || !region.code ? null : `cities:${region.code}`)
  const barangays = usePsgcList((s) => getBarangays(city.code!, s), typed || !city.code ? null : `barangays:${city.code}`)

  // The province is read off the chosen city: NCR and independent cities have none.
  let province: string | null = null
  if (!typed && city.code && cities.state.status === 'success') {
    const found = cities.state.data.find((c: City) => c.code === city.code)
    if (found && found.provinceCode === false) province = ''
    else if (found && provinces.state.status === 'success') {
      province = provinces.state.data.find((p) => p.code === found.provinceCode)?.name ?? ''
    } else if (resolved?.city.code === city.code) province = resolved.province
  }
  const provinceText = typed || !city.code ? '' : province === null ? 'Looking it up…' : province || 'Not applicable'

  const errors: Partial<Record<Field, string>> = {}
  const labelError = validateLabel(label)
  // The validator names the field "Full name"; this one is the recipient's.
  const recipientError = validateFullName(recipient)?.replace('Full name', 'Recipient name')
  const phoneError = validateAddressPhone(phone)
  if (labelError) errors.label = labelError
  if (recipientError) errors.recipientName = recipientError
  if (phoneError) errors.phone = phoneError
  if (typed) {
    const r = validatePlace(region.name, 'Region')
    const c = validateCity(city.name)
    const b = validatePlace(barangay.name, 'Barangay')
    if (r) errors.region = r
    if (c) errors.city = c
    if (b) errors.barangay = b
  } else {
    if (!region.code) errors.region = 'Choose your region.'
    if (!city.code) errors.city = 'Choose your city or municipality.'
    if (!barangay.code) errors.barangay = 'Choose your barangay.'
  }
  const streetError = validateStreet(street)
  const line2Error = validateLine2(line2)
  const postalError = validatePostal(postal)
  if (streetError) errors.street = streetError
  if (line2Error) errors.line2 = line2Error
  if (postalError) errors.postal = postalError
  const shown = (name: keyof Touched) => (touched[name] ? errors[name] : undefined)
  const touch = (name: keyof Touched) => () => setTouched((current) => ({ ...current, [name]: true }))

  function pickRegion(code: string) {
    if (code === region.code || regions.state.status !== 'success') return
    const found = regions.state.data.find((r) => r.code === code)
    if (!found) return
    setRegion({ code, name: found.name })
    setCity(NONE)
    setBarangay(NONE)
  }
  function pickCity(code: string) {
    if (code === city.code || cities.state.status !== 'success') return
    const found = cities.state.data.find((c) => c.code === code)
    if (!found) return
    setCity({ code, name: found.name })
    setBarangay(NONE)
  }
  function pickBarangay(code: string) {
    if (barangays.state.status !== 'success') return
    const found = barangays.state.data.find((b) => b.code === code)
    if (!found) return
    setBarangay({ code, name: found.name })
    void autofillPostal(found.name, city.name, province || region.name)
  }

  /** Fills the postal code from the address unless the user typed their own. A miss leaves the field for them. */
  async function autofillPostal(barangayName: string, cityName: string, area: string) {
    postalAbort.current?.abort()
    if (!cityName || (postal && !postalAuto.current)) return
    const abort = new AbortController()
    postalAbort.current = abort
    setPostalState('loading')
    try {
      const code = await lookupPostal({ barangay: barangayName, city: cityName, area }, abort.signal)
      if (abort.signal.aborted) return
      if (code) {
        setPostal(code)
        postalAuto.current = true
      }
      setPostalState(code ? 'filled' : 'none')
    } catch {
      // Aborted by a newer lookup or by closing the form.
    }
  }

  function typeInstead() {
    setNote(null)
    setTyped(true)
    setRegion((current) => ({ code: null, name: current.name }))
    setCity((current) => ({ code: null, name: current.name }))
    setBarangay((current) => ({ code: null, name: current.name }))
  }
  function useLists() {
    setNote(null)
    setTyped(false)
    setRegion(NONE)
    setCity(NONE)
    setBarangay(NONE)
  }

  /**
   * Turns a confirmed pin into form values and closes the map. A level that does not match the lists is left empty,
   * never guessed. A pin outside the country keeps the map open and returns why, so the pin can be dragged.
   */
  async function fillFrom(lat: number, lon: number): Promise<string | null> {
    lookupAbort.current?.abort()
    const abort = new AbortController()
    lookupAbort.current = abort
    setLookup({ status: 'loading' })
    try {
      const found = await reverseGeocode(lat, lon, abort.signal)
      const notes: string[] = []
      const unmatched = (name: string, level: string) =>
        name ? `The map says "${name}", but it isn't in the list. Pick it below.` : `The map didn't name a ${level}. Pick it below.`
      let nextRegion = NONE
      let nextCity = NONE
      let nextBarangay = NONE

      const matched = matchRegion(await getRegions(abort.signal), found.region)
      if (!matched) notes.push(unmatched(found.region, 'region'))
      else {
        nextRegion = { code: matched.code, name: matched.name }
        const match = found.city ? matchPlace(await getCities(matched.code, abort.signal), found.city) : null
        if (!match) notes.push(unmatched(found.city, 'city'))
        else {
          nextCity = { code: match.code, name: match.name }
          const list = await getBarangays(match.code, abort.signal)
          let hit: Barangay | null = null
          for (const name of found.barangays) hit ??= matchPlace(list, name)
          if (!hit) notes.push(unmatched(found.barangays[0] ?? '', 'barangay'))
          else nextBarangay = { code: hit.code, name: hit.name }
        }
      }
      if (abort.signal.aborted) return null
      const foundStreet = filterStreet(found.street)
      const foundPostal = filterPostal(found.postal)
      postalAbort.current?.abort()
      setNote(null)
      setTyped(false)
      setRegion(nextRegion)
      setCity(nextCity)
      setBarangay(nextBarangay)
      if (foundStreet) setStreet(foundStreet)
      if (foundPostal) {
        setPostal(foundPostal)
        postalAuto.current = true
        setPostalState('filled')
      } else {
        // The pin is the newest answer, so it replaces an earlier lookup's code; a code the user typed is kept.
        if (postalAuto.current) setPostal('')
        setPostalState('idle')
        if (nextCity.code) void autofillPostal(nextBarangay.name, nextCity.name, nextRegion.name)
      }
      setLookup({ status: 'done', notes })
      setMapOpen(false)
    } catch (error) {
      if (abort.signal.aborted) return null
      const kind = error instanceof ReverseGeocodeError ? error.kind : 'network'
      if (kind === 'outside') {
        setLookup({ status: 'idle' })
        return LOOKUP_ERRORS.outside
      }
      setLookup({ status: 'error', kind, lat, lon })
      setMapOpen(false)
    }
    return null
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    setTouched(Object.fromEntries(FIELD_ORDER.map((name) => [name, true])))
    const first = FIELD_ORDER.find((name) => errors[name])
    if (first) {
      document.getElementById(fieldId(first))?.focus()
      return
    }
    inFlight.current = true
    setFailure(null)
    setPending(true)
    onPendingChange?.(true)
    const next = {
      label: cleanText(label),
      recipientName: cleanText(recipient),
      phone: normalizePhone(phone, '+63'),
      region: cleanText(region.name),
      province: '',
      cityMunicipality: cleanText(city.name),
      barangay: cleanText(barangay.name),
      streetAddress: cleanText(street),
      addressLine2: cleanText(line2),
      postalCode: postal,
    }
    // Typed places have no province field: keep the saved one only while the area is the same.
    if (!typed) next.province = province ?? ''
    else if (initial && next.region === initial.region && next.cityMunicipality === initial.cityMunicipality) next.province = initial.province ?? ''
    try {
      let saved: Address
      if (!initial) {
        const input: AddressInput = {
          recipientName: next.recipientName,
          phone: next.phone,
          region: next.region,
          cityMunicipality: next.cityMunicipality,
          barangay: next.barangay,
          streetAddress: next.streetAddress,
          postalCode: next.postalCode,
        }
        if (next.label) input.label = next.label
        if (next.province) input.province = next.province
        if (next.addressLine2) input.addressLine2 = next.addressLine2
        if (makeDefault) input.isDefault = true
        saved = await createAddress(input)
      } else {
        const patch: AddressPatch = {}
        // A phone saved as 09181234567 is the same number as +639181234567: only a different number is a change.
        if (next.phone !== normalizePhone(toNationalPhone(initial.phone), '+63')) patch.phone = next.phone
        for (const key of ['recipientName', 'region', 'cityMunicipality', 'barangay', 'streetAddress', 'postalCode'] as const) {
          if (next[key] !== initial[key]) patch[key] = next[key]
        }
        for (const key of ['label', 'province', 'addressLine2'] as const) {
          if (next[key] !== (initial[key] ?? '')) patch[key] = next[key] || null
        }
        if (makeDefault && !initial.isDefault) patch.isDefault = true
        saved = Object.keys(patch).length ? await updateAddress(initial.id, patch) : initial
      }
      onPendingChange?.(false)
      onSaved(saved)
    } catch (error) {
      const { kind, detail } = error as Partial<AddressError>
      setPending(false)
      onPendingChange?.(false)
      if (kind === 'unauthorized') onUnauthorized?.()
      else if (kind === 'invalid') {
        setFailure(
          detail
            ? `We couldn't save your address. The server said: ${detail}. Fix it, then try Save address again.`
            : "We couldn't save your address. The server didn't accept these details. Check each field, then try Save address again.",
        )
      } else {
        setFailure(FAILURE_COPY[kind ?? 'server'])
        if (kind === 'not-found') onGone?.()
      }
    } finally {
      inFlight.current = false
    }
  }

  const lockedDefault = existingCount === 0 || (initial?.isDefault ?? false)

  if (mapOpen) {
    return (
      <MapBoundary onBack={() => setMapOpen(false)} kral={kral}>
        <Suspense
          fallback={
            <div role="status" aria-label="Loading the map" className="pb-5">
              <div className={`h-72 animate-pulse ${kral ? 'bg-kral-porcelain dark:bg-kral-graphite' : 'rounded-xl bg-line'}`} />
            </div>
          }
        >
          <MapPicker onBack={() => setMapOpen(false)} onUse={fillFrom} tone={tone} />
        </Suspense>
      </MapBoundary>
    )
  }

  const submitButton = (
    <button type="submit" disabled={pending} className={`${kral ? KRAL_PRIMARY : PRIMARY_BUTTON} w-full sm:w-auto`}>
      {pending && <SpinnerIcon />}
      Save address
    </button>
  )

  return (
    <form noValidate onSubmit={(event) => void submit(event)} aria-busy={pending} className="pt-3 pb-5">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <FloatingField
          tone={tone}
          id={fieldId('label')}
          label="Label (optional)"
          value={label}
          onChange={(v) => setLabel(filterLabel(v))}
          onBlur={touch('label')}
          error={shown('label')}
          enterKeyHint="next"
          counter={{ current: label.length, max: ADDRESS_LIMITS.label }}
          readOnly={pending}
        />
        <FloatingField
          tone={tone}
          id={fieldId('recipientName')}
          label="Recipient name"
          value={recipient}
          onChange={(v) => setRecipient(filterFullName(v))}
          onBlur={touch('recipientName')}
          error={shown('recipientName')}
          autoComplete="name"
          enterKeyHint="next"
          counter={{ current: recipient.length, max: ADDRESS_LIMITS.name }}
          readOnly={pending}
        />
        <FloatingField
          tone={tone}
          id={fieldId('phone')}
          label="Phone number"
          type="tel"
          prefix={<span className={`flex h-8 w-10 items-center justify-center text-base ${kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'}`}>+63</span>}
          compactPrefix
          value={phone}
          onChange={(v) => setPhone(filterPhone(v, '+63', NATIONAL_PHONE_MAX))}
          onBlur={touch('phone')}
          error={shown('phone')}
          autoComplete="tel-national"
          inputMode="tel"
          enterKeyHint="next"
          counter={{ current: phone.length, max: NATIONAL_PHONE_MAX }}
          readOnly={pending}
        />
      </div>

      <button ref={pinButton} type="button" onClick={() => setMapOpen(true)} className={`${kral ? KRAL_SECONDARY : SECONDARY_BUTTON} mt-4 w-full`}>
        Pin on a map
      </button>
      <p className={`mt-2 leading-snug ${kral ? 'font-kral-mono text-base text-kral-muted md:text-sm' : 'text-xs text-fg-muted'}`}>Drop a pin and we will fill in the fields below.</p>

      <>
        {lookup.status === 'loading' && (
          <p role="status" className={`mt-3 flex items-center gap-2 text-base ${kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'}`}>
            <SpinnerIcon className="shrink-0" />
            Looking up your pin…
          </p>
        )}
        {lookup.status === 'error' && (
          <div role="alert" className={`mt-3 border p-3 ${kral ? 'border-kral-rule' : 'rounded-xl border-line-strong'}`}>
            <p className={`flex items-start gap-2 text-base leading-snug ${kral ? 'font-kral-mono text-kral-fg' : 'text-fg'}`}>
              <AlertIcon className="mt-1 shrink-0 text-danger" />
              <span>{LOOKUP_ERRORS[lookup.kind]}</span>
            </p>
            <button type="button" onClick={() => void fillFrom(lookup.lat, lookup.lon)} className={`${kral ? KRAL_SECONDARY : SECONDARY_BUTTON} mt-2`}>
              Try again
            </button>
          </div>
        )}
        {lookup.status === 'done' && (
          <div role="status" className={`mt-3 text-base leading-snug ${kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'}`}>
            <p>Filled in from your pin. Check each field, then save.</p>
            {lookup.notes.map((note) => (
              <p key={note} className={`mt-1 ${kral ? 'text-kral-fg' : 'text-fg'}`}>
                {note}
              </p>
            ))}
          </div>
        )}
      </>

      {note && (
        <p role="status" className={`mt-3 text-base leading-snug ${kral ? 'font-kral-mono text-kral-fg' : 'text-fg'}`}>
          {note}
        </p>
      )}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
        {typed ? (
          <>
            <FloatingField
          tone={tone}
              id={fieldId('region')}
              label="Region"
              value={region.name}
              onChange={(v) => setRegion({ code: null, name: filterPlace(v) })}
              onBlur={touch('region')}
              error={shown('region')}
              counter={{ current: region.name.length, max: ADDRESS_LIMITS.place }}
              readOnly={pending}
            />
            <FloatingField
          tone={tone}
              id={fieldId('city')}
              label="City or municipality"
              value={city.name}
              onChange={(v) => setCity({ code: null, name: filterCity(v) })}
              onBlur={touch('city')}
              error={shown('city')}
              autoComplete="address-level2"
              counter={{ current: city.name.length, max: ADDRESS_LIMITS.city }}
              readOnly={pending}
            />
            <FloatingField
          tone={tone}
              id={fieldId('barangay')}
              label="Barangay"
              value={barangay.name}
              onChange={(v) => setBarangay({ code: null, name: filterPlace(v) })}
              onBlur={() => {
                touch('barangay')()
                if (barangay.name) void autofillPostal(barangay.name, city.name, region.name)
              }}
              error={shown('barangay')}
              counter={{ current: barangay.name.length, max: ADDRESS_LIMITS.place }}
              readOnly={pending}
            />
          </>
        ) : (
          <>
            <ListField
              kral={kral}
              id={fieldId('region')}
              label="Region"
              noun="regions"
              state={regions.state}
              retry={regions.retry}
              placeholder="Select your region"
              value={region}
              error={shown('region')}
              parent="the Philippines"
              onPick={pickRegion}
              onDone={touch('region')}
              onType={typeInstead}
              labelOf={regionLabel}
            />
            <ListField
              kral={kral}
              id={fieldId('city')}
              label="City or municipality"
              noun="cities and municipalities"
              state={cities.state}
              retry={cities.retry}
              placeholder={region.code ? 'Select your city or municipality' : 'Choose a region first'}
              value={city}
              error={shown('city')}
              parent="this region"
              onPick={pickCity}
              onDone={touch('city')}
              onType={typeInstead}
            />
            <ListField
              kral={kral}
              id={fieldId('barangay')}
              label="Barangay"
              noun="barangays"
              state={barangays.state}
              retry={barangays.retry}
              placeholder={city.code ? 'Select your barangay' : 'Choose a city or municipality first'}
              value={barangay}
              error={shown('barangay')}
              parent="this city or municipality"
              onPick={pickBarangay}
              onDone={touch('barangay')}
              onType={typeInstead}
            />
            <FloatingField tone={tone} id={fieldId('province')} label="Province" value={provinceText} onChange={() => {}} locked />
          </>
        )}
        <FloatingField
          tone={tone}
          id={fieldId('street')}
          label="Street address"
          value={street}
          onChange={(v) => setStreet(filterStreet(v))}
          onBlur={touch('street')}
          error={shown('street')}
          autoComplete="street-address"
          enterKeyHint="next"
          counter={{ current: street.length, max: ADDRESS_LIMITS.street }}
          readOnly={pending}
        />
        <FloatingField
          tone={tone}
          id={fieldId('line2')}
          label="Unit, floor or landmark (optional)"
          value={line2}
          onChange={(v) => setLine2(filterLine2(v))}
          onBlur={touch('line2')}
          error={shown('line2')}
          autoComplete="address-line2"
          enterKeyHint="next"
          counter={{ current: line2.length, max: ADDRESS_LIMITS.line2 }}
          readOnly={pending}
        />
        <FloatingField
          tone={tone}
          id={fieldId('postal')}
          label="Postal code"
          value={postal}
          onChange={(v) => {
            postalAbort.current?.abort()
            postalAuto.current = false
            setPostalState('idle')
            setPostal(filterPostal(v))
          }}
          onBlur={touch('postal')}
          error={shown('postal')}
          autoComplete="postal-code"
          inputMode="tel"
          enterKeyHint="done"
          counter={{ current: postal.length, max: ADDRESS_LIMITS.postal }}
          readOnly={pending}
        />
        {postalState !== 'idle' && (
          <p role="status" className={`-mt-2 flex items-center gap-2 leading-snug ${kral ? 'font-kral-mono text-base text-kral-muted md:text-sm' : 'text-sm text-fg-muted'}`}>
            {postalState === 'loading' && <SpinnerIcon className="shrink-0" />}
            {postalState === 'loading' && 'Looking up your postal code…'}
            {postalState === 'filled' && 'Postal code filled in from your address. Check it before you save.'}
            {postalState === 'none' && "We couldn't find a postal code for this address. Enter it above."}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={typed ? useLists : typeInstead}
        className={kral ? 'kral-focus font-kral-mono mt-2 min-h-11 cursor-pointer text-base font-medium text-kral-fg uppercase underline underline-offset-4 hover:text-kral-red-ink md:text-xs md:tracking-[0.08em]' : 'font-ui mt-2 min-h-11 cursor-pointer rounded-xl text-base font-semibold text-fg underline underline-offset-4 hover:text-chrome-strong'}
      >
        {typed ? 'Pick from the lists instead' : 'Type it instead'}
      </button>

      {!hideDefault && (
        <div className="mt-3">
          <Checkbox
            checked={makeDefault}
            onChange={setMakeDefault}
            disabled={pending || lockedDefault}
            label="Set as default address"
            className={kral ? 'font-kral-mono justify-start text-base' : 'justify-start'}
            tone={tone}
          >
            Set as default address
          </Checkbox>
          {lockedDefault && (
            <p className={`leading-snug ${kral ? 'font-kral-mono text-base text-kral-muted md:text-sm' : 'text-xs text-fg-muted'}`}>
              {existingCount === 0 ? 'Your first address is always your default.' : 'To change your default, set another address as default.'}
            </p>
          )}
        </div>
      )}

      {failure && (
        <p role="alert" className={`mt-3 flex items-start gap-2 text-base leading-snug text-danger ${kral ? 'font-kral-mono' : ''}`}>
          <AlertIcon className="mt-1 shrink-0" />
          <span>{failure}</span>
        </p>
      )}

      <div className="mt-5">{footer(submitButton)}</div>
    </form>
  )
}
