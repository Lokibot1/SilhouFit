// Where Lalamove riders collect orders. The backend only has this as server config today, so with PICKUP_SAMPLE_DATA on
// the location is kept in this browser (like permissionStore). Turn the flag off to call the proposed endpoint instead.
import { isTime } from './adminOrdersApi'
import { ProductListError, request } from './fetchProductList'
import { isRecord } from './ordersApi'
import { getSession } from './session'
import { simulateRequest, type RequestOptions } from './simulateRequest'

export const PICKUP_SAMPLE_DATA = true

export const PICKUP_KEY = 'silhoufit.pickup-location.v1'

// Proposed contract, admin and superadmin only: GET returns the saved row or null; PUT replaces the whole row and returns it.
// 400 carries the validation message, 401 and 403 mean not allowed, 429 means slow down.
const PATH = '/admin/settings/pickup-location'

export interface PickupLocation {
  label: string | null
  contactName: string
  /** E.164, such as +639171234567. */
  contactPhone: string
  region: string
  province: string | null
  cityMunicipality: string
  barangay: string
  streetAddress: string
  addressLine2: string | null
  postalCode: string
  latitude: number
  longitude: number
  /** ISO time. */
  updatedAt: string
  updatedBy: { id: string; fullName: string } | null
}

/** What a save sends: the whole location, because PUT replaces the saved one. The server stamps the last two fields. */
export type PickupInput = Omit<PickupLocation, 'updatedAt' | 'updatedBy'>

const SAMPLE_DELAY_MS = 400

const text = (value: unknown) => typeof value === 'string'
const orNull = (value: unknown) => (value === null || text(value) ? (value as string | null) : undefined)
const coordinate = (value: unknown) => typeof value === 'number' && Number.isFinite(value)

function toLocation(body: unknown): PickupLocation {
  if (!isRecord(body)) throw new ProductListError('server')
  const { contactName, contactPhone, region, cityMunicipality, barangay, streetAddress, postalCode, latitude, longitude, updatedAt, updatedBy } = body
  const label = body.label ?? null
  const province = body.province ?? null
  const addressLine2 = body.addressLine2 ?? null
  if (![contactName, contactPhone, region, cityMunicipality, barangay, streetAddress, postalCode].every(text)) throw new ProductListError('server')
  if (orNull(label) === undefined || orNull(province) === undefined || orNull(addressLine2) === undefined) throw new ProductListError('server')
  if (!coordinate(latitude) || !coordinate(longitude) || !isTime(updatedAt)) throw new ProductListError('server')
  const by = isRecord(updatedBy) && text(updatedBy.id) && text(updatedBy.fullName) ? { id: updatedBy.id as string, fullName: updatedBy.fullName as string } : null
  return {
    label: label as string | null,
    contactName: contactName as string,
    contactPhone: contactPhone as string,
    region: region as string,
    province: province as string | null,
    cityMunicipality: cityMunicipality as string,
    barangay: barangay as string,
    streetAddress: streetAddress as string,
    addressLine2: addressLine2 as string | null,
    postalCode: postalCode as string,
    latitude: latitude as number,
    longitude: longitude as number,
    updatedAt,
    updatedBy: by,
  }
}

/** The stored location; a missing, blocked or corrupt entry reads as nothing saved. */
function readStored(): PickupLocation | null {
  try {
    const raw = localStorage.getItem(PICKUP_KEY)
    return raw ? toLocation(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/** `sample` picks the browser copy or the API; it is a parameter so both can be tested while the flag is a constant. */
export async function readPickupLocation(sample: boolean, signal?: AbortSignal): Promise<PickupLocation | null> {
  if (sample) {
    await simulateRequest(SAMPLE_DELAY_MS, signal, () => false)
    return readStored()
  }
  const body = await request('GET', PATH, undefined, signal)
  return body === null ? null : toLocation(body)
}

/** REPLACE: PUT /admin/settings/pickup-location  { the whole PickupInput }. Resolves to the saved location. */
export async function writePickupLocation(sample: boolean, input: PickupInput, signal?: AbortSignal): Promise<PickupLocation> {
  if (!sample) return toLocation(await request('PUT', PATH, input, signal))
  await simulateRequest(SAMPLE_DELAY_MS, signal, () => false)
  const name = getSession()?.name
  const saved: PickupLocation = { ...input, updatedAt: new Date().toISOString(), updatedBy: name ? { id: 'sample', fullName: name } : null }
  // Storage can be blocked or full; the page still shows what was saved until it is reloaded.
  try {
    localStorage.setItem(PICKUP_KEY, JSON.stringify(saved))
  } catch {
    // Not stored: nothing more to do.
  }
  return saved
}

export const fetchPickupLocation = ({ signal }: RequestOptions = {}) => readPickupLocation(PICKUP_SAMPLE_DATA, signal)

export const savePickupLocation = (input: PickupInput, { signal }: RequestOptions = {}) => writePickupLocation(PICKUP_SAMPLE_DATA, input, signal)
