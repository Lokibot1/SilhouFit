// Where Lalamove riders collect orders: the API's /pickup-locations endpoints (admin or above). Only one location is supported today, so the
// list is read as "the first row or nothing". The API rejects body keys it does not know, so only PickupInput's keys are ever sent.
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

export type PickupLocation = PickupInput & { id: string; /** ISO time. */ updatedAt: string }

const text = (value: unknown) => typeof value === 'string'
const orNull = (value: unknown) => (value === null || text(value) ? (value as string | null) : undefined)
const coordinate = (value: unknown) => typeof value === 'number' && Number.isFinite(value)

function toLocation(body: unknown): PickupLocation {
  if (!isRecord(body)) throw new ProductListError('server')
  const { id, contactName, contactPhone, region, cityMunicipality, barangay, streetAddress, postalCode, latitude, longitude, updatedAt } = body
  const label = body.label ?? null
  const province = body.province ?? null
  const addressLine2 = body.addressLine2 ?? null
  if (![id, contactName, contactPhone, region, cityMunicipality, barangay, streetAddress, postalCode].every(text)) throw new ProductListError('server')
  if (orNull(label) === undefined || orNull(province) === undefined || orNull(addressLine2) === undefined) throw new ProductListError('server')
  if (!coordinate(latitude) || !coordinate(longitude) || !isTime(updatedAt)) throw new ProductListError('server')
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
    updatedAt,
  }
}

/** GET /pickup-locations: the saved location, or null when there is none. */
export async function fetchPickupLocation({ signal }: RequestOptions = {}): Promise<PickupLocation | null> {
  const body = await request('GET', PATH, undefined, signal)
  if (!Array.isArray(body)) throw new ProductListError('server')
  return body.length ? toLocation(body[0]) : null
}

/** POST /pickup-locations when nothing is saved (409 once one is), PATCH /pickup-locations/:id to replace it. Resolves to the saved location. */
export async function savePickupLocation(input: PickupInput, id?: string, { signal }: RequestOptions = {}): Promise<PickupLocation> {
  const body = id ? await request('PATCH', `${PATH}/${encodeURIComponent(id)}`, input, signal) : await request('POST', PATH, input, signal)
  return toLocation(body)
}
