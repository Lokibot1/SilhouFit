// Turns a map position into address parts with OpenStreetMap's Nominatim. It is called only when the user confirms
// a pin (never while panning), at most once a second, and the same spot is answered from memory. Usage policy:
// https://operations.osmfoundation.org/policies/nominatim/ (1 request per second, no bulk use).
const URL_BASE = 'https://nominatim.openstreetmap.org/reverse'
const MIN_GAP_MS = 1000
const TIMEOUT_MS = 8000

export interface ReverseResult {
  street: string
  postal: string
  /** OpenStreetMap's state/region name; matched against PSGC by the caller. */
  region: string
  city: string
  /** Candidates, best first: OpenStreetMap is loose about which tag holds the barangay. */
  barangays: string[]
}

export type ReverseErrorKind = 'network' | 'timeout' | 'server' | 'outside'
export class ReverseGeocodeError extends Error {
  readonly kind: ReverseErrorKind
  constructor(kind: ReverseErrorKind) {
    super(`Reverse geocoding failed: ${kind}`)
    this.kind = kind
  }
}

interface NominatimResponse {
  address?: Record<string, string | undefined>
  error?: string
}

const cache = new Map<string, ReverseResult>()
let lastRequestAt = 0
// Lookups queue behind one another so the 1 s gap holds even when two are started together.
let queue: Promise<unknown> = Promise.resolve()

/** Forgets the cache and the throttle (tests). */
export function resetReverseGeocode() {
  cache.clear()
  lastRequestAt = 0
  queue = Promise.resolve()
}

const aborted = () => new DOMException('The request was aborted.', 'AbortError')

export function mapAddress(address: Record<string, string | undefined>): ReverseResult {
  const pick = (...keys: string[]) => keys.map((key) => address[key]?.trim()).filter((v): v is string => !!v)
  return {
    street: pick('house_number', 'road').join(' '),
    postal: address.postcode?.replace(/\D/g, '').slice(0, 4) ?? '',
    // `region` is the PSGC-style region ("Calabarzon"); `state` can be the province ("Batangas"), so it is the fallback.
    region: pick('region', 'state')[0] ?? '',
    city: pick('city', 'town', 'municipality')[0] ?? '',
    barangays: [...new Set(pick('quarter', 'suburb', 'village', 'neighbourhood'))],
  }
}

async function request(lat: number, lon: number): Promise<ReverseResult> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lon),
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'en',
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${URL_BASE}?${params}`, { signal: controller.signal })
    if (!response.ok) throw new ReverseGeocodeError('server')
    const body = (await response.json()) as NominatimResponse
    if (!body.address) throw new ReverseGeocodeError(body.error ? 'outside' : 'server')
    if (body.address.country_code && body.address.country_code !== 'ph') throw new ReverseGeocodeError('outside')
    return mapAddress(body.address)
  } catch (error) {
    if (error instanceof ReverseGeocodeError) throw error
    throw new ReverseGeocodeError(controller.signal.aborted ? 'timeout' : 'network')
  } finally {
    clearTimeout(timer)
  }
}

export function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<ReverseResult> {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)

  const run = queue.then(async () => {
    if (signal?.aborted) throw aborted()
    const wait = lastRequestAt + MIN_GAP_MS - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    if (signal?.aborted) throw aborted()
    lastRequestAt = Date.now()
    const result = await request(Number(lat.toFixed(5)), Number(lon.toFixed(5)))
    cache.set(key, result)
    return result
  })
  queue = run.catch(() => undefined)
  return run
}
