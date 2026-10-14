// Philippine Standard Geographic Code (PSGC) lists from the public PSGC Cloud API. No key, CORS open. Lists are
// loaded by region (never by province) because NCR has no provinces and its cities hang off the region itself.
const BASE = 'https://psgc.gitlab.io/api'
const TIMEOUT_MS = 8000
const ATTEMPTS = 3
const BACKOFF_MS = [500, 1000, 2000]

export interface Region {
  code: string
  name: string
  /** "Region IV-A": the number people still say. Equal to `name` for a few regions. */
  regionName: string
}
export interface Province {
  code: string
  name: string
  regionCode: string
}
export interface City {
  code: string
  name: string
  isCity: boolean
  isMunicipality: boolean
  /** The province's code, or `false` for NCR and independent cities, which sit under no province. */
  provinceCode: string | false
  regionCode: string
}
export interface Barangay {
  code: string
  name: string
}

export type PsgcErrorKind = 'network' | 'timeout' | 'server'
export class PsgcError extends Error {
  readonly kind: PsgcErrorKind
  constructor(kind: PsgcErrorKind) {
    super(`PSGC request failed: ${kind}`)
    this.kind = kind
  }
}

const cache = new Map<string, Promise<unknown>>()

/** Forgets every cached list (tests, and a manual refresh). */
export function resetPsgcCache() {
  cache.clear()
}

const aborted = () => new DOMException('The request was aborted.', 'AbortError')

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function attempt(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new PsgcError('server')
    return await response.json()
  } catch (error) {
    if (error instanceof PsgcError) throw error
    throw new PsgcError(controller.signal.aborted ? 'timeout' : 'network')
  } finally {
    clearTimeout(timer)
  }
}

async function load(url: string): Promise<unknown> {
  let last: unknown
  for (let i = 0; i < ATTEMPTS; i += 1) {
    try {
      return await attempt(url)
    } catch (error) {
      last = error
      if (i < ATTEMPTS - 1) await sleep(BACKOFF_MS[i])
    }
  }
  throw last
}

/** One request per URL: callers share it, and a failure is forgotten so a retry starts fresh. */
function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${BASE}${path}`
  let shared = cache.get(url)
  if (!shared) {
    shared = load(url)
    cache.set(url, shared)
    shared.catch(() => cache.delete(url))
  }
  if (!signal) return shared as Promise<T>
  // Aborting stops waiting; the shared request carries on so the next caller finds it cached.
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(aborted())
    signal.addEventListener('abort', () => reject(aborted()), { once: true })
    shared.then((value) => resolve(value as T), reject)
  })
}

const byName = <T extends { name: string }>(list: T[]) =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }))

export const getRegions = (signal?: AbortSignal) => get<Region[]>('/regions/', signal)
/** Empty for NCR. */
export const getProvinces = (regionCode: string, signal?: AbortSignal) =>
  get<Province[]>(`/regions/${regionCode}/provinces/`, signal).then(byName)
export const getCities = (regionCode: string, signal?: AbortSignal) =>
  get<City[]>(`/regions/${regionCode}/cities-municipalities/`, signal).then(byName)
export const getBarangays = (cityCode: string, signal?: AbortSignal) =>
  get<Barangay[]>(`/cities-municipalities/${cityCode}/barangays/`, signal).then(byName)
