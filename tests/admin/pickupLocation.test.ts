import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError } from '../../src/service/fetchProductList'
import { PICKUP_KEY, PICKUP_SAMPLE_DATA, readPickupLocation, writePickupLocation, type PickupInput } from '../../src/service/pickupLocation'
import { clearSession, setSession } from '../../src/service/session'

const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../src/service/fetchProductList', async (original) => ({
  ...(await original<typeof import('../../src/service/fetchProductList')>()),
  request: api.request,
}))

const INPUT: PickupInput = {
  label: 'Main store',
  contactName: 'Anne Santos',
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
}
const ROW = { ...INPUT, updatedAt: '2026-11-19T07:05:00.000Z', updatedBy: { id: 'u1', fullName: 'Ben Cruz' } }

beforeEach(() => {
  localStorage.clear()
  api.request.mockReset()
  clearSession()
})

it('ships with the sample store on until the backend exists', () => {
  expect(PICKUP_SAMPLE_DATA).toBe(true)
})

describe('sample store', () => {
  it('reads nothing before a save, then round-trips a save through localStorage', async () => {
    expect(await readPickupLocation(true)).toBeNull()
    setSession({ name: 'Ben Cruz', email: 'ben@example.com' })
    const saved = await writePickupLocation(true, INPUT)
    expect(saved).toMatchObject({ ...INPUT, updatedBy: { id: 'sample', fullName: 'Ben Cruz' } })
    expect(Number.isNaN(Date.parse(saved.updatedAt))).toBe(false)
    expect(localStorage.getItem(PICKUP_KEY)).not.toBeNull()
    expect(await readPickupLocation(true)).toEqual(saved)
    expect(api.request).not.toHaveBeenCalled()
  })

  it('replaces the whole saved location, clearing the optional fields it no longer has', async () => {
    await writePickupLocation(true, { ...INPUT, addressLine2: 'Unit 4B' })
    await writePickupLocation(true, INPUT)
    expect((await readPickupLocation(true))?.addressLine2).toBeNull()
  })

  it.each(['{not json', '{"contactName":1}', '[]'])('treats corrupt storage (%s) as nothing saved', async (raw) => {
    localStorage.setItem(PICKUP_KEY, raw)
    expect(await readPickupLocation(true)).toBeNull()
  })
})

describe('API', () => {
  it('reads GET /admin/settings/pickup-location: a row, or null when nothing is saved', async () => {
    api.request.mockResolvedValueOnce(ROW)
    expect(await readPickupLocation(false)).toEqual(ROW)
    expect(api.request).toHaveBeenCalledWith('GET', '/admin/settings/pickup-location', undefined, undefined)
    api.request.mockResolvedValueOnce(null)
    expect(await readPickupLocation(false)).toBeNull()
  })

  it.each([
    ['not an object', 'nope'],
    ['a missing field', { ...ROW, barangay: undefined }],
    ['a non-finite coordinate', { ...ROW, latitude: Number.NaN }],
    ['a string coordinate', { ...ROW, longitude: '120.9' }],
    ['a bad time', { ...ROW, updatedAt: 'yesterday' }],
  ])('throws a server error for a bad body: %s', async (_name, body) => {
    api.request.mockResolvedValueOnce(body)
    await expect(readPickupLocation(false)).rejects.toMatchObject({ kind: 'server' })
  })

  it('sends the whole input with PUT and returns the saved row', async () => {
    api.request.mockResolvedValueOnce(ROW)
    expect(await writePickupLocation(false, INPUT)).toEqual(ROW)
    expect(api.request).toHaveBeenCalledWith('PUT', '/admin/settings/pickup-location', INPUT, undefined)
  })

  it('lets the request errors through: a 400 detail, 403 and 429', async () => {
    api.request.mockRejectedValueOnce(new ProductListError('validation', 'postalCode must be 4 digits', 400))
    await expect(writePickupLocation(false, INPUT)).rejects.toMatchObject({ kind: 'validation', detail: 'postalCode must be 4 digits' })
    api.request.mockRejectedValueOnce(new ProductListError('forbidden', undefined, 403))
    await expect(writePickupLocation(false, INPUT)).rejects.toMatchObject({ kind: 'forbidden' })
    api.request.mockRejectedValueOnce(new ProductListError('rate-limit', undefined, 429, undefined, 15000))
    await expect(readPickupLocation(false)).rejects.toMatchObject({ kind: 'rate-limit' })
  })

  it('throws a server error when the PUT answers with a bad row', async () => {
    api.request.mockResolvedValueOnce({ ...ROW, latitude: null })
    await expect(writePickupLocation(false, INPUT)).rejects.toMatchObject({ kind: 'server' })
  })
})
