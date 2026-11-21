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

/** Stands in for the pickup location API: GET (list), POST (409 once one exists), PATCH and DELETE (always refused). Keeps its own copy of the row. */
export function pickupLocationStore(initial: ApiPickupLocation | null) {
  let row = initial ? { ...initial } : null

  return {
    get row() {
      return row
    },
    /** Someone else deleted the row: later PATCHes answer 404 and the list is empty. */
    remove() {
      row = null
    },
    /** Every body POST or PATCH received, so a test can check what was sent. */
    bodies: [] as Record<string, unknown>[],
    handle(method: string, path: string, body?: unknown): { status: number; json: unknown } {
      const id = path.split('/')[2]
      if (method === 'GET') return { status: 200, json: row ? [row] : [] }
      if (method === 'POST') {
        this.bodies.push(body as Record<string, unknown>)
        if (row) return { status: 409, json: { message: 'Only one pickup location is currently supported. Please update the existing pickup location.' } }
        row = apiPickupLocation({ ...(body as object), updatedAt: new Date().toISOString() })
        return { status: 201, json: row }
      }
      if (method === 'DELETE') return { status: 400, json: { message: 'Cannot delete the only pickup location' } }
      this.bodies.push(body as Record<string, unknown>)
      if (!row || row.id !== id) return { status: 404, json: { message: `Pickup location with ID "${id}" not found` } }
      row = { ...row, ...(body as object), updatedAt: new Date().toISOString() }
      return { status: 200, json: row }
    },
  }
}

/** Stands in for the pickup location API in the browser; register it before the page loads. State lives in the closure. */
export async function mockPickupLocations(page: Page, initial: ApiPickupLocation | null) {
  const store = pickupLocationStore(initial)
  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/pickup-locations(\/|$)/.test(url.pathname), async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const { status, json } = store.handle(request.method(), new URL(request.url()).pathname, request.postDataJSON() ?? undefined)
    return route.fulfill({ status, json, headers: CORS })
  })
  return store
}
