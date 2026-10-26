import { getSession } from './session'
import type { RequestOptions } from './simulateRequest'
import { getSupabase } from './supabase'
import { errorDetail } from './updateMe'

export type AddressErrorKind = 'unauthorized' | 'invalid' | 'not-found' | 'rate-limit' | 'network' | 'server'

// Lets the UI pick accurate copy; 'unauthorized' means there is no valid Supabase session.
export class AddressError extends Error {
  kind: AddressErrorKind
  /** What the server said was wrong, when it said (the Nest validation message on a 400). */
  detail?: string

  constructor(kind: AddressErrorKind, detail?: string) {
    super(`The address request failed (${kind}).`)
    this.kind = kind
    this.detail = detail
  }
}

export interface Address {
  id: string
  label: string | null
  recipientName: string
  phone: string
  region: string
  province: string | null
  cityMunicipality: string
  barangay: string
  streetAddress: string
  addressLine2: string | null
  postalCode: string
  country: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

/** The POST body. The API rejects any other key, so no PSGC codes. */
export interface AddressInput {
  label?: string
  recipientName: string
  phone: string
  region: string
  province?: string
  cityMunicipality: string
  barangay: string
  streetAddress: string
  addressLine2?: string
  postalCode: string
  isDefault?: boolean
}

/** Only the fields to change. A null clears label, province or addressLine2. */
export type AddressPatch = Partial<Omit<AddressInput, 'label' | 'province' | 'addressLine2'>> & {
  label?: string | null
  province?: string | null
  addressLine2?: string | null
}

const STATUS_KIND: Record<number, AddressErrorKind> = { 400: 'invalid', 401: 'unauthorized', 404: 'not-found', 422: 'invalid', 429: 'rate-limit' }

const REQUIRED = ['id', 'recipientName', 'phone', 'region', 'cityMunicipality', 'barangay', 'streetAddress', 'postalCode', 'country', 'createdAt', 'updatedAt'] as const
const OPTIONAL = ['label', 'province', 'addressLine2'] as const

/** The API row as an Address, or null when a required field is missing or not text. */
function toAddress(body: unknown): Address | null {
  if (!body || typeof body !== 'object') return null
  const row = body as Record<string, unknown>
  if (REQUIRED.some((key) => typeof row[key] !== 'string')) return null
  const optional = (key: (typeof OPTIONAL)[number]) => (typeof row[key] === 'string' ? (row[key] as string) : null)
  return {
    id: row.id as string,
    label: optional('label'),
    recipientName: row.recipientName as string,
    phone: row.phone as string,
    region: row.region as string,
    province: optional('province'),
    cityMunicipality: row.cityMunicipality as string,
    barangay: row.barangay as string,
    streetAddress: row.streetAddress as string,
    addressLine2: optional('addressLine2'),
    postalCode: row.postalCode as string,
    country: row.country as string,
    isDefault: row.isDefault === true,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  }
}

/** Calls /users/me/addresses{path} with the Supabase access token and returns the parsed JSON body. An abort rejects with the AbortError itself. */
async function request(path: string, init: { method?: string; body?: unknown } = {}, signal?: AbortSignal): Promise<unknown> {
  let token: string | undefined
  try {
    const supabase = await getSupabase()
    token = (await supabase.auth.getSession()).data.session?.access_token
  } catch {
    throw new AddressError('server')
  }
  signal?.throwIfAborted()
  if (!token) throw new AddressError('unauthorized')

  let response: Response
  try {
    response = await fetch(`${import.meta.env.VITE_API_URL}/users/me/addresses${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal,
    })
  } catch (failure) {
    if (signal?.aborted) throw failure
    throw new AddressError('network')
  }
  if (!response.ok) {
    const kind = STATUS_KIND[response.status] ?? 'server'
    throw new AddressError(kind, kind === 'invalid' ? await errorDetail(response) : undefined)
  }
  try {
    return await response.json()
  } catch {
    throw new AddressError('server')
  }
}

function one(body: unknown) {
  const address = toAddress(body)
  if (!address) throw new AddressError('server')
  return address
}

export async function listAddresses({ signal }: RequestOptions = {}): Promise<Address[]> {
  const body = await request('', {}, signal)
  if (!Array.isArray(body)) throw new AddressError('server')
  return body.map(one)
}

export async function getAddressById(id: string, { signal }: RequestOptions = {}): Promise<Address> {
  return one(await request(`/${id}`, {}, signal))
}

export async function createAddress(input: AddressInput, { signal }: RequestOptions = {}): Promise<Address> {
  const address = one(await request('', { method: 'POST', body: input }, signal))
  invalidate()
  return address
}

export async function updateAddress(id: string, patch: AddressPatch, { signal }: RequestOptions = {}): Promise<Address> {
  const address = one(await request(`/${id}`, { method: 'PATCH', body: patch }, signal))
  invalidate()
  return address
}

export async function deleteAddress(id: string, { signal }: RequestOptions = {}): Promise<void> {
  const body = await request(`/${id}`, { method: 'DELETE' }, signal)
  if ((body as { success?: unknown } | null)?.success !== true) throw new AddressError('server')
  invalidate()
}

// The cached list, per signed-in email so two accounts in one tab never see each other's addresses.
const TTL_MS = 30_000
let cache: { owner: string; list: Address[]; at: number } | null = null
let inflight: { owner: string; promise: Promise<Address[]> } | null = null
// Bumped by every new read and every change, so a read that finishes late never overwrites newer data.
let generation = 0
const listeners = new Set<() => void>()

const owner = () => getSession()?.email ?? ''
const aborted = () => new DOMException('The request was aborted.', 'AbortError')

function invalidate() {
  generation += 1
  cache = null
  inflight = null
  listeners.forEach((run) => run())
}

/** Forgets the cached list (sign out). */
export function clearAddressCache() {
  generation += 1
  cache = null
  inflight = null
}

/** Calls `run` whenever an address is created, updated or deleted, so a page that already read the list can refresh. Returns the unsubscribe. */
export function onAddressesChanged(run: () => void): () => void {
  listeners.add(run)
  return () => {
    listeners.delete(run)
  }
}

/**
 * The list through a 30-second cache. Concurrent callers share one request; aborting stops that caller waiting and
 * the shared request carries on. `force` always asks the server. A failure is never cached.
 */
export function loadAddresses({ signal, force = false }: RequestOptions & { force?: boolean } = {}): Promise<Address[]> {
  const who = owner()
  let shared: Promise<Address[]>
  if (!force && cache && cache.owner === who && Date.now() - cache.at < TTL_MS) {
    shared = Promise.resolve(cache.list)
  } else if (!force && inflight && inflight.owner === who) {
    shared = inflight.promise
  } else {
    const mine = ++generation
    const promise = listAddresses()
    inflight = { owner: who, promise }
    shared = promise
    promise.then(
      (list) => {
        if (mine !== generation) return
        cache = { owner: who, list, at: Date.now() }
        inflight = null
      },
      () => {
        if (mine === generation) inflight = null
      },
    )
  }
  if (!signal) return shared
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(aborted())
    signal.addEventListener('abort', () => reject(aborted()), { once: true })
    shared.then(resolve, reject)
  })
}

/** The default address; the API sends it first, so the first row is the fallback. */
export function getDefaultAddress(list: Address[]): Address | null {
  return list.find((a) => a.isDefault) ?? list[0] ?? null
}
