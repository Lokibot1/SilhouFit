import { MEASUREMENT_KEYS, ProductListError, request, type Measurements } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'

// Base measurements per category and size, for the size guide and the AR garment's defaults (/size-measurements). Errors are
// ProductListError, as for the other product services.

export type SizeStatus = 'active' | 'archived' | 'all'

export interface SizeMeasurement extends Measurements {
  id: string
  category: string
  /** A label such as XS or XXL, a waist number such as 32, or 'One size'. */
  size: string
  /** False for an archived (soft-deleted) row, and for one the API marks inactive; neither is in the active list. */
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** Only the measurements to set; every other one stays unset. */
export type SizeMeasurementInput = Partial<Record<keyof Measurements, number>> & { category: string; size: string }

/** Only what changed. `null` clears a measurement. */
export type SizeMeasurementPatch = Partial<Record<keyof Measurements, number | null>> & { size?: string }

export interface SizeMeasurementQuery {
  category?: string
  size?: string
  /** Staff only; the API lists active rows when it is left out. */
  status?: SizeStatus
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown) => (typeof value === 'string' ? value : '')

function toSizeMeasurement(value: unknown): SizeMeasurement {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.category !== 'string' || typeof value.size !== 'string') throw new ProductListError('server')
  return {
    id: value.id,
    category: value.category,
    size: value.size,
    ...(Object.fromEntries(MEASUREMENT_KEYS.map((key) => [key, isNumber(value[key]) ? value[key] : null])) as Measurements),
    isActive: value.isActive !== false && value.isDeleted !== true,
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  }
}

const path = (id: string) => `/size-measurements/${encodeURIComponent(id)}`

/**
 * GET /size-measurements. Public: this is also what the size guide and the AR garment will read (`{ category, size }`).
 * The answer is an array or `{ data: [...] }`; both are accepted here and nowhere else.
 */
export async function fetchSizeMeasurements({ category, size, status }: SizeMeasurementQuery = {}, { signal }: RequestOptions = {}): Promise<SizeMeasurement[]> {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (size) params.set('size', size)
  if (status) params.set('status', status)
  const query = params.toString()
  const body = await request('GET', `/size-measurements${query ? `?${query}` : ''}`, undefined, signal)
  const rows = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.data) ? body.data : null
  if (!rows) throw new ProductListError('server')
  return rows.map(toSizeMeasurement)
}

// The size guide reads each category's active rows once; a staff write drops them so the next guide opens with the change.
const baseCache = new Map<string, Promise<SizeMeasurement[]>>()

/** A category's active base rows, fetched once and shared. A failure is not kept, so the next opening tries again. */
export function fetchCategoryMeasurements(category: string): Promise<SizeMeasurement[]> {
  let rows = baseCache.get(category)
  if (!rows) {
    rows = fetchSizeMeasurements({ category })
    baseCache.set(category, rows)
    rows.catch(() => baseCache.delete(category))
  }
  return rows
}

export const clearCategoryMeasurements = () => baseCache.clear()

/** GET /size-measurements/:id. */
export async function fetchSizeMeasurement(id: string, { signal }: RequestOptions = {}): Promise<SizeMeasurement> {
  return toSizeMeasurement(await request('GET', path(id), undefined, signal))
}

/** POST /size-measurements. A 409 means an active row already exists for that category and size; a 400 lists what is out of range. */
export async function createSizeMeasurement(input: SizeMeasurementInput, { signal }: RequestOptions = {}): Promise<SizeMeasurement> {
  const created = toSizeMeasurement(await request('POST', '/size-measurements', input, signal))
  baseCache.clear()
  return created
}

/** PATCH /size-measurements/:id with only the fields that changed. */
export async function updateSizeMeasurement(id: string, patch: SizeMeasurementPatch, { signal }: RequestOptions = {}): Promise<SizeMeasurement> {
  const updated = toSizeMeasurement(await request('PATCH', path(id), patch, signal))
  baseCache.clear()
  return updated
}

/** Archives (DELETE, a soft delete) or restores (POST /:id/restore) a row. Restoring answers 409 when an active row for the same category and size exists by then. */
export async function setSizeMeasurementActive(id: string, isActive: boolean, { signal }: RequestOptions = {}): Promise<SizeMeasurement> {
  const row = toSizeMeasurement(await (isActive ? request('POST', `${path(id)}/restore`, undefined, signal) : request('DELETE', path(id), undefined, signal)))
  baseCache.clear()
  return row
}

const WHY: Record<string, string> = {
  network: 'The connection dropped before the server answered. Check your connection, then try again.',
  'rate-limit': 'The server is limiting requests right now. Wait a minute, then try again.',
  forbidden: 'Your account is not allowed to change base measurements. Sign in again, or ask an admin for access.',
  'not-found': "That size no longer exists, or the measurements service isn't available yet. Reload the list to see what is there now.",
  server: 'Something went wrong on our side. Try again in a moment.',
}

const ADD_NOT_FOUND = "The measurements service isn't available yet, so this size can't be added. Try again later."

/** Why a change failed and what to do next. `label` names the row, e.g. "Hoodie M"; `adding` is a create, where a 404 can only mean the service is missing. */
export function sizeFailureReason(error: unknown, label: string, adding = false): string {
  const { kind = '', detail } = (error ?? {}) as { kind?: string; detail?: string }
  if (kind === 'conflict') return `An active ${label} already exists. Edit that one, or use a different size.`
  if (kind === 'validation') return `The server rejected the measurements${detail ? `: ${detail}` : ''}. Check the values, then try again.`
  if (adding && kind === 'not-found') return ADD_NOT_FOUND
  return WHY[kind] ?? WHY.server
}
