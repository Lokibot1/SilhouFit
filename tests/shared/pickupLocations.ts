import type { Page, Route } from '@playwright/test'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info, x-upsert',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const PAGE_ORIGIN = 'http://localhost:5173'

/** A pickup location as the API sends it. */
export interface ApiPickupLocation {
  id: string
  label: string | null
  contactName: string
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
  country: 'Philippines'
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export const apiPickupLocation = (over: Partial<ApiPickupLocation> = {}): ApiPickupLocation => ({
  id: '7d1f6c0e-1b7a-4c53-9a0e-5f1c2d3e4a5b',
  label: 'Main warehouse',
  contactName: 'Maria Santos',
  contactPhone: '+639171234567',
  region: 'NCR',
  province: null,
  cityMunicipality: 'City of Manila',
  barangay: 'Barangay 176',
  streetAddress: '12 Rizal Avenue',
  addressLine2: null,
  postalCode: '1000',
  latitude: 14.5995,
  longitude: 120.9842,
  country: 'Philippines',
  isDefault: true,
  createdAt: '2026-11-18T14:05:00.000Z',
  updatedAt: '2026-11-18T14:05:00.000Z',
  ...over,
})

/**
 * Stands in for the pickup location API with the backend's rules: GET lists the default first, then newest first. The first row is always the
 * default, and a later one only when it is created with isDefault (the old default is demoted). PATCH { isDefault: true } demotes the rest,
 * { isDefault: false } on the default promotes the newest other (400 when it is alone), DELETE promotes the newest other when it removes the
 * default (400 for the only one). An unknown id is 404. Keeps its own copy of the rows.
 */
export function pickupLocationStore(initial: ApiPickupLocation | ApiPickupLocation[] | null) {
  let rows: ApiPickupLocation[] = initial ? [initial].flat().map((row) => ({ ...row })) : []
  let clock = Date.parse('2026-11-20T00:00:00.000Z')
  const stamp = () => new Date((clock += 1000)).toISOString()
  const newestOther = (id: string) => rows.filter((row) => row.id !== id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const setDefault = (id: string) => (rows = rows.map((row) => ({ ...row, isDefault: row.id === id })))
  const notFound = (id: string) => ({ status: 404, json: { message: `Pickup location with ID "${id}" not found` } })

  return {
    /** The list as the API sends it. */
    get rows() {
      return [...rows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.createdAt.localeCompare(a.createdAt))
    },
    /** The default row, or null when there is none. */
    get row() {
      return rows.find((row) => row.isDefault) ?? null
    },
    /** Someone else deleted it (or every row): later calls for it answer 404. */
    remove(id?: string) {
      rows = id ? rows.filter((row) => row.id !== id) : []
    },
    /** Every body POST or PATCH received, so a test can check what was sent. */
    bodies: [] as Record<string, unknown>[],
    handle(method: string, path: string, body?: unknown): { status: number; json: unknown } {
      const id = path.split('/')[2]
      if (method === 'GET') return { status: 200, json: this.rows }
      if (method === 'POST') {
        this.bodies.push(body as Record<string, unknown>)
        const { isDefault, ...fields } = body as Record<string, unknown>
        const created = apiPickupLocation({ ...fields, id: crypto.randomUUID(), isDefault: false, createdAt: stamp(), updatedAt: stamp() })
        rows = [...rows, created]
        if (rows.length === 1 || isDefault === true) setDefault(created.id)
        return { status: 201, json: rows.find((row) => row.id === created.id) }
      }
      const target = rows.find((row) => row.id === id)
      if (!target) return notFound(id)
      if (method === 'DELETE') {
        if (rows.length === 1) return { status: 400, json: { message: 'Cannot delete the only pickup location' } }
        const next = newestOther(id)
        rows = rows.filter((row) => row.id !== id)
        if (target.isDefault) setDefault(next.id)
        return { status: 200, json: { success: true } }
      }
      this.bodies.push(body as Record<string, unknown>)
      const { isDefault, ...fields } = body as Record<string, unknown>
      if (isDefault === true) setDefault(id)
      if (isDefault === false && target.isDefault) {
        if (rows.length === 1) return { status: 400, json: { message: 'Cannot unset the default pickup location when it is the only pickup location' } }
        setDefault(newestOther(id).id)
      }
      rows = rows.map((row) => (row.id === id ? { ...row, ...fields, updatedAt: stamp() } : row))
      return { status: 200, json: rows.find((row) => row.id === id) }
    },
  }
}

/** Stands in for the pickup location API in the browser; register it before the page loads. State lives in the closure. */
export async function mockPickupLocations(page: Page, initial: ApiPickupLocation | ApiPickupLocation[] | null) {
  const store = pickupLocationStore(initial)
  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/pickup-locations(\/|$)/.test(url.pathname), async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const { status, json } = store.handle(request.method(), new URL(request.url()).pathname, request.postDataJSON() ?? undefined)
    return route.fulfill({ status, json, headers: CORS })
  })
  return store
}
