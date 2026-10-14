import { Component, lazy, Suspense, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { usePsgcList, type ListState } from '../../hooks/usePsgcList'
import { saveAddress, type SavedAddress } from '../../service/address'
import { getBarangays, getCities, getProvinces, getRegions, type Barangay, type City, type Region } from '../../service/psgc'
import { ReverseGeocodeError, reverseGeocode, type ReverseErrorKind } from '../../service/reverseGeocode'
import {
  ADDRESS_LIMITS,
  cleanText,
  filterCity,
  filterPlace,
  filterPostal,
  filterStreet,
  validateCity,
  validatePlace,
  validatePostal,
  validateStreet,
} from '../../utils/checkoutValidation'
import { matchPlace, matchRegion } from '../../utils/psgcMatch'
import { FloatingField } from '../form/FloatingField'
import { AlertIcon, SpinnerIcon } from '../form/icons'
import { SearchSelect } from '../form/SearchSelect'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'

// Leaflet and its stylesheet are only fetched once someone asks for the map. A failed import is cached by React for
// the life of a lazy component, so Back to form swaps in a fresh one and the next Pin on a map fetches again.
const loadMap = () => import('./MapPicker')
let MapPicker = lazy(loadMap)

function MapFailed({ onBack }: { onBack: () => void }) {
  return (
    <div className="pb-5">
      <p role="alert" className="flex items-start gap-2 text-base leading-snug text-fg-muted">
        <AlertIcon className="mt-1 shrink-0 text-danger" />
        The map couldn&apos;t load. Check your connection, then try again, or fill in the form instead.
      </p>
      <button
        type="button"
        onClick={() => {
          MapPicker = lazy(loadMap)
          onBack()
        }}
        className={`${SECONDARY_BUTTON} mt-4`}
      >
        Back to form
      </button>
    </div>
  )
}

class MapBoundary extends Component<{ onBack: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <MapFailed onBack={this.props.onBack} /> : this.props.children
  }
}

interface Place {
  code: string | null
  name: string
}
const NONE: Place = { code: null, name: '' }
type Level = 'region' | 'city' | 'barangay'
type Touched = Partial<Record<Level | 'street' | 'postal', boolean>>

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

type Lookup =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; kind: ReverseErrorKind; lat: number; lon: number }
  | { status: 'done'; notes: string[] }

const SKELETON_LINE = 'h-11 animate-pulse rounded-xl bg-line'

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
}

/** One cascading select with its own loading, error and empty states. */
function ListField({ id, label, noun, state, retry, placeholder, value, error, parent, onPick, onDone, onType, labelOf }: ListFieldProps) {
  if (state.status === 'loading') {
    return (
      <div role="status" aria-label={`Loading ${noun}`}>
        <span className="font-ui mb-1 block text-sm text-fg-muted">{label}</span>
        <div className={SKELETON_LINE} />
      </div>
    )
  }
  if (state.status === 'error' || (state.status === 'success' && state.data.length === 0)) {
    const failed = state.status === 'error'
    return (
      <div role={failed ? 'alert' : 'status'} className="rounded-xl border border-line-strong p-3">
        <p className="flex items-start gap-2 text-base leading-snug text-fg">
          <AlertIcon className="mt-1 shrink-0 text-danger" />
          <span>
            {failed
              ? `We couldn't load the list of ${noun}. ${LIST_ERRORS[state.kind]} Check your connection and try again, or type it yourself.`
              : `No ${noun} are listed for ${parent}. Type it yourself instead.`}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {failed && (
            <button type="button" onClick={retry} className={SECONDARY_BUTTON}>
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={onType}
            className="font-ui min-h-11 cursor-pointer rounded-xl text-base font-semibold text-fg underline underline-offset-4 hover:text-chrome-strong"
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
    />
  )
}

const regionLabel = (item: { code: string; name: string }) => {
  const long = (item as Partial<Region>).regionName
  return long && long !== item.name ? `${item.name} (${long})` : item.name
}

interface AddressFormProps {
  /** The saved address to edit; null for a new one. */
  initial: SavedAddress | null
  onSaved: (address: SavedAddress) => void
  /** Draws the row of buttons under the form; `submit` is the form's own Save button. */
  footer: (submit: ReactNode) => ReactNode
}

export function AddressForm({ initial, onSaved, footer }: AddressFormProps) {
  const user = useCurrentUser()
  const base = useId()
  const fieldId = (name: string) => `${base}-${name}`
  const [typed, setTyped] = useState(initial !== null && initial.regionCode === null)
  const [region, setRegion] = useState<Place>(initial ? { code: initial.regionCode, name: initial.region } : NONE)
  const [city, setCity] = useState<Place>(initial ? { code: initial.cityCode, name: initial.city } : NONE)
  const [barangay, setBarangay] = useState<Place>(initial ? { code: initial.barangayCode, name: initial.barangay } : NONE)
  const [street, setStreet] = useState(initial?.street ?? '')
  const [postal, setPostal] = useState(initial?.postal ?? '')
  const [touched, setTouched] = useState<Touched>({})
  const [pending, setPending] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' })
  const inFlight = useRef(false)
  const lookupAbort = useRef<AbortController | null>(null)
  const pinButton = useRef<HTMLButtonElement>(null)
  const wasMapOpen = useRef(false)

  useEffect(() => () => lookupAbort.current?.abort(), [])
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
    } else if (initial && initial.cityCode === city.code) province = initial.province
  }
  const provinceText = typed || !city.code ? '' : province === null ? 'Looking it up…' : province || 'Not applicable'

  const errors: Partial<Record<Level | 'street' | 'postal', string>> = {}
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
  const postalError = validatePostal(postal)
  if (streetError) errors.street = streetError
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
    if (found) setBarangay({ code, name: found.name })
  }

  function typeInstead() {
    setTyped(true)
    setRegion((current) => ({ code: null, name: current.name }))
    setCity((current) => ({ code: null, name: current.name }))
    setBarangay((current) => ({ code: null, name: current.name }))
  }
  function useLists() {
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
      if (!foundPostal) notes.push('The map has no postal code for this spot. Enter it below.')
      setTyped(false)
      setRegion(nextRegion)
      setCity(nextCity)
      setBarangay(nextBarangay)
      if (foundStreet) setStreet(foundStreet)
      if (foundPostal) setPostal(foundPostal)
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
    setTouched({ region: true, city: true, barangay: true, street: true, postal: true })
    const first = (['region', 'city', 'barangay', 'street', 'postal'] as const).find((name) => errors[name])
    if (first) {
      document.getElementById(fieldId(first))?.focus()
      return
    }
    inFlight.current = true
    setSaveFailed(false)
    setPending(true)
    const address: SavedAddress = {
      regionCode: typed ? null : region.code,
      region: cleanText(region.name),
      province: typed ? '' : (province ?? ''),
      cityCode: typed ? null : city.code,
      city: cleanText(city.name),
      barangayCode: typed ? null : barangay.code,
      barangay: cleanText(barangay.name),
      street: cleanText(street),
      postal,
    }
    try {
      if (!user?.email) throw new Error('signed out')
      await saveAddress(user.email, address)
      onSaved(address)
    } catch {
      setSaveFailed(true)
      setPending(false)
    } finally {
      inFlight.current = false
    }
  }

  if (mapOpen) {
    return (
      <MapBoundary onBack={() => setMapOpen(false)}>
        <Suspense
          fallback={
            <div role="status" aria-label="Loading the map" className="pb-5">
              <div className="h-72 animate-pulse rounded-xl bg-line" />
            </div>
          }
        >
          <MapPicker onBack={() => setMapOpen(false)} onUse={fillFrom} />
        </Suspense>
      </MapBoundary>
    )
  }

  const submitButton = (
    <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON} w-full sm:w-auto`}>
      {pending && <SpinnerIcon />}
      Save address
    </button>
  )

  return (
    <form noValidate onSubmit={(event) => void submit(event)} aria-busy={pending} className="pb-5">
      <button ref={pinButton} type="button" onClick={() => setMapOpen(true)} className={`${SECONDARY_BUTTON} w-full`}>
        Pin on a map
      </button>
      <p className="mt-2 text-sm leading-snug text-fg-muted">Drop a pin and we will fill in the fields below.</p>

      <>
        {lookup.status === 'loading' && (
          <p role="status" className="mt-3 flex items-center gap-2 text-base text-fg-muted">
            <SpinnerIcon className="shrink-0" />
            Looking up your pin…
          </p>
        )}
        {lookup.status === 'error' && (
          <div role="alert" className="mt-3 rounded-xl border border-line-strong p-3">
            <p className="flex items-start gap-2 text-base leading-snug text-fg">
              <AlertIcon className="mt-1 shrink-0 text-danger" />
              <span>{LOOKUP_ERRORS[lookup.kind]}</span>
            </p>
            <button type="button" onClick={() => void fillFrom(lookup.lat, lookup.lon)} className={`${SECONDARY_BUTTON} mt-2`}>
              Try again
            </button>
          </div>
        )}
        {lookup.status === 'done' && (
          <div role="status" className="mt-3 text-base leading-snug text-fg-muted">
            <p>Filled in from your pin. Check each field, then save.</p>
            {lookup.notes.map((note) => (
              <p key={note} className="mt-1 text-fg">
                {note}
              </p>
            ))}
          </div>
        )}
      </>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
        {typed ? (
          <>
            <FloatingField
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
              id={fieldId('barangay')}
              label="Barangay"
              value={barangay.name}
              onChange={(v) => setBarangay({ code: null, name: filterPlace(v) })}
              onBlur={touch('barangay')}
              error={shown('barangay')}
              counter={{ current: barangay.name.length, max: ADDRESS_LIMITS.place }}
              readOnly={pending}
            />
          </>
        ) : (
          <>
            <ListField
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
            <FloatingField id={fieldId('province')} label="Province" value={provinceText} onChange={() => {}} locked />
          </>
        )}
        <FloatingField
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
          id={fieldId('postal')}
          label="Postal code"
          value={postal}
          onChange={(v) => setPostal(filterPostal(v))}
          onBlur={touch('postal')}
          error={shown('postal')}
          autoComplete="postal-code"
          inputMode="tel"
          enterKeyHint="done"
          counter={{ current: postal.length, max: ADDRESS_LIMITS.postal }}
          readOnly={pending}
        />
      </div>

      <button
        type="button"
        onClick={typed ? useLists : typeInstead}
        className="font-ui mt-2 min-h-11 cursor-pointer rounded-xl text-base font-semibold text-fg underline underline-offset-4 hover:text-chrome-strong"
      >
        {typed ? 'Pick from the lists instead' : 'Type it instead'}
      </button>

      {saveFailed && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-base leading-snug text-danger">
          <AlertIcon className="mt-1 shrink-0" />
          <span>
            We couldn&apos;t save your address. Your browser is blocking storage on this device, or you were signed out.
            Allow site storage or sign in again, then try Save address.
          </span>
        </p>
      )}

      <div className="mt-5">{footer(submitButton)}</div>
    </form>
  )
}
