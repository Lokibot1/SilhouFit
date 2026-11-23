// Where Lalamove riders collect orders: the API's /pickup-locations endpoints (admin or above). The list comes back default first.
// The API rejects body keys it does not know, so only PickupInput's keys (and isDefault) are ever sent.
import { isTime } from './adminOrdersApi'
import { ProductListError, request } from './fetchProductList'
import { isRecord } from './ordersApi'
import type { RequestOptions } from './simulateRequest'

const PATH = '/pickup-locations'

/** What a save sends. */
export interface PickupInput {
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
}

export type PickupLocation = PickupInput & { id: string; /** The one riders are booked from and checkout quotes against. */ isDefault: boolean; /** ISO time. */ updatedAt: string }

const text = (value: unknown) => typeof value === 'string'
const orNull = (value: unknown) => (value === null || text(value) ? (value as string | null) : undefined)
const coordinate = (value: unknown) => typeof value === 'number' && Number.isFinite(value)

function toLocation(body: unknown): PickupLocation {
  if (!isRecord(body)) throw new ProductListError('server')
  const { id, contactName, contactPhone, region, cityMunicipality, barangay, streetAddress, postalCode, latitude, longitude, isDefault, updatedAt } = body
  const label = body.label ?? null
  const province = body.province ?? null
  const addressLine2 = body.addressLine2 ?? null
  if (![id, contactName, contactPhone, region, cityMunicipality, barangay, streetAddress, postalCode].every(text)) throw new ProductListError('server')
  if (orNull(label) === undefined || orNull(province) === undefined || orNull(addressLine2) === undefined) throw new ProductListError('server')
  if (!coordinate(latitude) || !coordinate(longitude) || typeof isDefault !== 'boolean' || !isTime(updatedAt)) throw new ProductListError('server')
  return {
    id: id as string,
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
    isDefault,
    updatedAt,
  }
}

/** GET /pickup-locations: every saved location, the default first. Empty when there is none. */
export async function fetchPickupLocations({ signal }: RequestOptions = {}): Promise<PickupLocation[]> {
  const body = await request('GET', PATH, undefined, signal)
  if (!Array.isArray(body)) throw new ProductListError('server')
  return body.map(toLocation)
}

/** What a write may carry on top of the fields. */
type Default = { isDefault?: boolean }

/** POST /pickup-locations. The first location is always the default; a later one is only when `isDefault` is sent. */
export async function createPickupLocation(input: PickupInput & Default, { signal }: RequestOptions = {}): Promise<PickupLocation> {
  return toLocation(await request('POST', PATH, input, signal))
}

/** PATCH /pickup-locations/:id with any subset of the fields; `{ isDefault: true }` makes it the default and demotes the old one. */
export async function updatePickupLocation(id: string, body: Partial<PickupInput> & Default, { signal }: RequestOptions = {}): Promise<PickupLocation> {
  return toLocation(await request('PATCH', `${PATH}/${encodeURIComponent(id)}`, body, signal))
}

/** DELETE /pickup-locations/:id. Deleting the default promotes the newest other one; the only location cannot be deleted (400). */
export async function deletePickupLocation(id: string, { signal }: RequestOptions = {}): Promise<void> {
  await request('DELETE', `${PATH}/${encodeURIComponent(id)}`, undefined, signal)
}
