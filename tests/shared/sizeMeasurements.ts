import type { Page, Route } from '@playwright/test'
import { mockAuth } from './session'
import { mockStaffMe } from './products'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const PAGE_ORIGIN = 'http://localhost:5173'

export interface MockSize {
  id: string
  category: string
  size: string
  chestWidthCm: number | null
  waistWidthCm: number | null
  hipWidthCm: number | null
  totalLengthCm: number | null
  inseamCm: number | null
  shoulderWidthCm: number | null
  sleeveLengthCm: number | null
  neckCm: number | null
  thighCm: number | null
  isActive: boolean
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

let counter = 0
export const sizeRow = (overrides: Partial<MockSize> = {}): MockSize => ({
  id: `00000000-0000-4000-8000-0000000002${String(++counter).padStart(2, '0')}`,
  category: 'Hoodie',
  size: 'M',
  chestWidthCm: 55,
  waistWidthCm: null,
  hipWidthCm: null,
  totalLengthCm: 70,
  inseamCm: null,
  shoulderWidthCm: 48,
  sleeveLengthCm: 62,
  neckCm: 38,
  thighCm: null,
  isActive: true,
  isDeleted: false,
  createdAt: '2026-05-01T08:00:00.000Z',
  updatedAt: '2026-05-01T08:00:00.000Z',
  ...overrides,
})

export interface SizeCall {
  method: string
  id: string | null
  body: Record<string, unknown> | null
  query: Record<string, string>
}

export interface SizeMeasurementsMock {
  rows: MockSize[]
  /** Every request that reached the API, OPTIONS excluded. */
  calls: SizeCall[]
  of: (method: string) => SizeCall[]
  /** While true every request answers 404, as the real API does until the backend ships. */
  unavailable: boolean
  /** The next request (whatever it is) answers with this status and body. */
  failNext: (status: number, json?: object) => void
}

const RANGES: Record<string, [number, number]> = {
  chestWidthCm: [5, 250],
  waistWidthCm: [5, 250],
  hipWidthCm: [5, 250],
  totalLengthCm: [10, 300],
  inseamCm: [5, 200],
  shoulderWidthCm: [5, 150],
  sleeveLengthCm: [5, 150],
  thighCm: [5, 150],
  neckCm: [5, 100],
}

/**
 * Stands in for /size-measurements, to the backend contract: POST (409 when an active row has the same category and size, 400 with a
 * message list), GET list with ?category=&size=&status=active|inactive|archived|all, GET/PATCH by id (null clears), DELETE /:id archives
 * (soft delete, isDeleted) and POST /:id/restore restores (409 when an active row has the same category and size). Register it after mockAuth.
 */
export async function mockSizeMeasurements(page: Page, initial: MockSize[] = [], { unavailable = false } = {}): Promise<SizeMeasurementsMock> {
  let next: { status: number; json: object } | null = null
  const mock: SizeMeasurementsMock = {
    rows: initial.map((r) => ({ ...r })),
    calls: [],
    of: (method) => mock.calls.filter((c) => c.method === method),
    unavailable,
    failNext: (status, json = { message: 'Failed' }) => (next = { status, json }),
  }
  const duplicate = (category: string, size: string, exceptId?: string) =>
    mock.rows.some((r) => r.isActive && !r.isDeleted && r.id !== exceptId && r.category === category && r.size.toLowerCase() === size.toLowerCase())
  const problems = (body: Record<string, unknown>, merged: Record<string, unknown>) => {
    const list: string[] = []
    if (typeof merged.size !== 'string' || !merged.size.trim()) list.push('size should not be empty')
    else if (merged.size.length > 20) list.push('size must be shorter than or equal to 20 characters')
    for (const [key, [min, max]] of Object.entries(RANGES)) {
      const value = body[key]
      if (value !== undefined && value !== null && (typeof value !== 'number' || value < min || value > max)) list.push(`${key} must be between ${min} and ${max}`)
    }
    if (!Object.keys(RANGES).some((key) => typeof merged[key] === 'number')) list.push('at least one measurement is required')
    return list
  }

  await page.route(
    (url) => url.origin !== PAGE_ORIGIN && /^\/size-measurements/.test(url.pathname),
    async (route: Route) => {
      const request = route.request()
      const method = request.method()
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      const url = new URL(request.url())
      const id = url.pathname.split('/')[2] ?? null
      const body = (['POST', 'PATCH'].includes(method) ? request.postDataJSON() : null) as Record<string, unknown> | null
      mock.calls.push({ method, id, body, query: Object.fromEntries(url.searchParams) })
      const reply = (status: number, json: unknown) => route.fulfill({ status, json, headers: CORS })

      if (mock.unavailable) return reply(404, { message: `Cannot ${method} ${url.pathname}`, error: 'Not Found', statusCode: 404 })
      if (next) {
        const failure = next
        next = null
        return reply(failure.status, failure.json)
      }

      if (method === 'GET' && !id) {
        const { category, size, status = 'active' } = Object.fromEntries(url.searchParams)
        return reply(
          200,
          mock.rows.filter(
            (r) => (!category || r.category === category) && (!size || r.size === size) && (status === 'all' ||
                (status === 'archived' ? r.isDeleted : !r.isDeleted && r.isActive === (status === 'active'))),
          ),
        )
      }
      if (method === 'POST' && !id && body) {
        const list = problems(body, body)
        if (list.length) return reply(400, { statusCode: 400, message: list, error: 'Bad Request' })
        if (duplicate(String(body.category), String(body.size))) return reply(409, { statusCode: 409, message: 'Size already exists', error: 'Conflict' })
        const created = sizeRow({ ...Object.fromEntries(Object.keys(RANGES).map((k) => [k, null])), ...body } as Partial<MockSize>)
        mock.rows.push(created)
        return reply(201, created)
      }
      const row = mock.rows.find((r) => r.id === id)
      if (!row) return reply(404, { statusCode: 404, message: 'Size measurement not found' })
      if (method === 'GET') return reply(200, row)
      if (method === 'PATCH' && body) {
        const merged = { ...row, ...body }
        const list = problems(body, merged)
        if (list.length) return reply(400, { statusCode: 400, message: list, error: 'Bad Request' })
        if (merged.isActive && !row.isDeleted && duplicate(row.category, String(merged.size), row.id)) return reply(409, { statusCode: 409, message: 'Size already exists', error: 'Conflict' })
        Object.assign(row, body, { updatedAt: new Date().toISOString() })
        return reply(200, row)
      }
      if (method === 'DELETE') {
        row.isDeleted = true
        return reply(200, row)
      }
      if (method === 'POST' && url.pathname.endsWith('/restore')) {
        if (row.isDeleted && row.isActive && duplicate(row.category, row.size, row.id)) return reply(409, { statusCode: 409, message: 'Cannot restore: an active size measurement already exists', error: 'Conflict' })
        row.isDeleted = false
        return reply(200, row)
      }
      return reply(405, {})
    },
  )
  return mock
}

/** Auth, the staff profile and the size measurements mock, before the test signs in. */
export async function setupMeasurements(page: Page, rows: MockSize[], options?: { unavailable?: boolean }) {
  await mockAuth(page)
  await mockStaffMe(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  return mockSizeMeasurements(page, rows, options)
}
