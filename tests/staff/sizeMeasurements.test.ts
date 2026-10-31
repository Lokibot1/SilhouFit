import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError } from '../../src/service/fetchProductList'
import {
  createSizeMeasurement,
  fetchSizeMeasurement,
  fetchSizeMeasurements,
  setSizeMeasurementActive,
  sizeFailureReason,
  updateSizeMeasurement,
} from '../../src/service/sizeMeasurements'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}))

const fetchMock = vi.fn()
const reply = (body: unknown, status = 200) => fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status }))

beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  category: 'Hoodie',
  size: 'M',
  chestWidthCm: 55,
  waistWidthCm: null,
  hipWidthCm: null,
  totalLengthCm: 70,
  inseamCm: null,
  shoulderWidthCm: null,
  sleeveLengthCm: null,
  neckCm: null,
  thighCm: null,
  isActive: true,
  isDeleted: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
})

const kindOf = async (call: Promise<unknown>) => {
  const error = await call.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ProductListError)
  return error as ProductListError
}

describe('fetchSizeMeasurements', () => {
  it('GETs with the Bearer token and only the filters given', async () => {
    reply([row()])
    await fetchSizeMeasurements({ category: 'Hoodie', status: 'archived' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/size-measurements\?category=Hoodie&status=archived$/)
    expect(init.method).toBe('GET')
    expect(init.headers).toEqual({ Authorization: 'Bearer tok' })
    expect(init.body).toBeUndefined()
  })

  it('has no query string for the public reader without filters, and encodes a size', async () => {
    reply([])
    await fetchSizeMeasurements()
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/size-measurements$/)
    await fetchSizeMeasurements({ category: 'Headwear', size: 'One size' })
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\?category=Headwear&size=One\+size$/)
  })

  it('accepts an array or { data }, and fills missing measurements with null', async () => {
    reply({ data: [row(), { id: 'r2', category: 'Pants', size: '32', waistWidthCm: 40, isActive: false }] })
    const rows = await fetchSizeMeasurements()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ id: 'r1', chestWidthCm: 55, neckCm: null, isActive: true })
    expect(rows[1]).toMatchObject({ waistWidthCm: 40, hipWidthCm: null, isActive: false })
  })

  it('reads an archived (soft-deleted) row as not active, even when the API still says isActive', async () => {
    reply([row({ isDeleted: true })])
    expect((await fetchSizeMeasurements({ status: 'archived' }))[0].isActive).toBe(false)
  })

  it('treats anything else as a server fault', async () => {
    reply({ nope: true })
    expect((await kindOf(fetchSizeMeasurements())).kind).toBe('server')
    reply([{ id: 1 }])
    expect((await kindOf(fetchSizeMeasurements())).kind).toBe('server')
  })

  it('maps statuses to error kinds, a 404 included (the API is not built yet)', async () => {
    for (const [status, kind] of [[404, 'not-found'], [401, 'forbidden'], [403, 'forbidden'], [429, 'rate-limit'], [500, 'server']] as const) {
      reply({ message: 'x' }, status)
      expect((await kindOf(fetchSizeMeasurements())).kind).toBe(kind)
    }
  })

  it('maps a dropped connection to network, and lets an abort through', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await kindOf(fetchSizeMeasurements())).kind).toBe('network')
    const controller = new AbortController()
    controller.abort()
    await expect(fetchSizeMeasurements({}, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('fetchSizeMeasurement', () => {
  it('GETs one row by its encoded id', async () => {
    reply(row())
    await expect(fetchSizeMeasurement('a/b')).resolves.toMatchObject({ id: 'r1' })
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/size-measurements\/a%2Fb$/)
  })
})

describe('createSizeMeasurement', () => {
  it('POSTs the input as JSON and answers with the row', async () => {
    reply(row(), 201)
    const saved = await createSizeMeasurement({ category: 'Hoodie', size: 'M', chestWidthCm: 55 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/size-measurements$/)
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"category":"Hoodie","size":"M","chestWidthCm":55}')
    expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' })
    expect(saved.id).toBe('r1')
  })

  it('reports a 409 as a conflict and a 400 with the server messages joined', async () => {
    reply({ message: 'exists' }, 409)
    expect((await kindOf(createSizeMeasurement({ category: 'Hoodie', size: 'M' }))).kind).toBe('conflict')
    reply({ message: ['chestWidthCm must not be greater than 250', 'size is too long'] }, 400)
    const error = await kindOf(createSizeMeasurement({ category: 'Hoodie', size: 'M' }))
    expect(error.kind).toBe('validation')
    expect(error.detail).toBe('chestWidthCm must not be greater than 250; size is too long')
  })
})

describe('updateSizeMeasurement and setSizeMeasurementActive', () => {
  it('PATCHes only what is given, null included', async () => {
    reply(row())
    await updateSizeMeasurement('r1', { chestWidthCm: 56, neckCm: null })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/size-measurements\/r1$/)
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"chestWidthCm":56,"neckCm":null}')
  })

  it('archives with DELETE and restores with POST /:id/restore, neither with a body', async () => {
    reply(row({ isDeleted: true }))
    const archived = await setSizeMeasurementActive('r1', false)
    const [archiveUrl, archiveInit] = fetchMock.mock.calls[0]
    expect(String(archiveUrl)).toMatch(/\/size-measurements\/r1$/)
    expect(archiveInit.method).toBe('DELETE')
    expect(archiveInit.body).toBeUndefined()
    expect(archived.isActive).toBe(false)
    reply(row())
    const restored = await setSizeMeasurementActive('r1', true)
    const [restoreUrl, restoreInit] = fetchMock.mock.calls[1]
    expect(String(restoreUrl)).toMatch(/\/size-measurements\/r1\/restore$/)
    expect(restoreInit.method).toBe('POST')
    expect(restoreInit.body).toBeUndefined()
    expect(restored.isActive).toBe(true)
  })

  it('reads a restore blocked by an active duplicate as a conflict', async () => {
    reply({ message: 'Cannot restore: an active size measurement already exists' }, 409)
    await expect(setSizeMeasurementActive('r1', true)).rejects.toMatchObject({ kind: 'conflict' })
  })
})

describe('sizeFailureReason', () => {
  it('names the row on a conflict and shows the server detail on a 400', () => {
    expect(sizeFailureReason({ kind: 'conflict' }, 'Hoodie M')).toContain('An active Hoodie M already exists')
    expect(sizeFailureReason({ kind: 'validation', detail: 'inseam too big' }, 'Pants 32')).toContain('inseam too big')
  })

  it('says what to do for the other kinds, and falls back to a server fault', () => {
    expect(sizeFailureReason({ kind: 'forbidden' }, 'x')).toMatch(/not allowed/)
    expect(sizeFailureReason({ kind: 'network' }, 'x')).toMatch(/connection/)
    expect(sizeFailureReason(new Error('?'), 'x')).toMatch(/our side/)
  })
})
