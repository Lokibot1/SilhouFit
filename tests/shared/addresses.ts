import type { Page, Route } from '@playwright/test'
import type { Address } from '../../src/service/addresses'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

export interface AddressCall {
  method: string
  /** The address id for /addresses/:id, null for the collection. */
  id: string | null
  body: Record<string, unknown> | null
}

export interface AddressesMock {
  /** The server's rows, in the order they were added. */
  rows: Address[]
  /** Every request that reached the API, OPTIONS excluded. */
  calls: AddressCall[]
  /** The bodies of the writes (POST, PATCH), in order. */
  bodies: Record<string, unknown>[]
}

/**
 * Stands in for the /users/me/addresses API with an in-memory list. It follows the API's rules: the first address is
 * the default, a new default unsets the old one, a list comes back default first then newest first, and deleting the
 * default promotes the newest remaining. Register it after mockAuth, whose empty list it replaces.
 * (`**` + `/users/me` does not match these paths: a glob has to match the whole URL.)
 */
export async function mockAddresses(page: Page, initial: Address[] = []): Promise<AddressesMock> {
  const mock: AddressesMock = { rows: initial.map((a) => ({ ...a })), calls: [], bodies: [] }
  let next = 1

  const handle = async (route: Route) => {
    const request = route.request()
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const id = new URL(request.url()).pathname.split('/addresses/')[1] ?? null
    const body = (method === 'POST' || method === 'PATCH' ? request.postDataJSON() : null) as Record<string, unknown> | null
    mock.calls.push({ method, id, body })
    if (body) mock.bodies.push(body)
    const reply = (status: number, json: unknown) => route.fulfill({ status, json, headers: CORS })
    const row = id ? mock.rows.find((a) => a.id === id) : undefined
    if (id && !row) return reply(404, { message: 'Address not found' })

    if (method === 'GET' && !id) {
      const sorted = [...mock.rows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.createdAt.localeCompare(a.createdAt))
      return reply(200, sorted)
    }
    if (method === 'GET') return reply(200, row)
    if (method === 'POST') {
      const created: Address = {
        label: null,
        province: null,
        addressLine2: null,
        ...(body as object),
        id: `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
        country: 'PH',
        isDefault: mock.rows.length === 0 || body?.isDefault === true,
        createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, next)).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 5, 1, 0, 0, next)).toISOString(),
      } as Address
      if (created.isDefault) mock.rows.forEach((a) => (a.isDefault = false))
      mock.rows.push(created)
      return reply(201, created)
    }
    if (method === 'PATCH') {
      if (body?.isDefault === true) mock.rows.forEach((a) => (a.isDefault = false))
      Object.assign(row!, body)
      return reply(200, row)
    }
    if (method === 'DELETE') {
      mock.rows = mock.rows.filter((a) => a.id !== id)
      if (row!.isDefault && mock.rows.length) {
        const newest = [...mock.rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        newest.isDefault = true
      }
      return reply(200, { success: true })
    }
    return reply(405, {})
  }

  await page.route('**/users/me/addresses', handle)
  await page.route('**/users/me/addresses/*', handle)
  return mock
}
