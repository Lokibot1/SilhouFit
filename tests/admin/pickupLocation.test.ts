import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError } from '../../src/service/fetchProductList'
import { fetchPickupLocation, savePickupLocation, type PickupInput } from '../../src/service/pickupLocation'

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
const ID = '7d1f6c0e-1b7a-4c53-9a0e-5f1c2d3e4a5b'
const LOCATION = { id: ID, ...INPUT, updatedAt: '2026-11-19T07:05:00.000Z' }
// What the API sends: extra keys the app ignores.
const ROW = { ...LOCATION, country: 'Philippines', isDefault: true, createdAt: '2026-11-18T07:05:00.000Z' }

beforeEach(() => api.request.mockReset())

describe('fetchPickupLocation', () => {
  it('reads GET /pickup-locations: the first row, or null when the list is empty', async () => {
    api.request.mockResolvedValueOnce([ROW])
    expect(await fetchPickupLocation()).toEqual(LOCATION)
    expect(api.request).toHaveBeenCalledWith('GET', '/pickup-locations', undefined, undefined)
    api.request.mockResolvedValueOnce([])
    expect(await fetchPickupLocation()).toBeNull()
  })

  it.each([
    ['not a list', ROW],
    ['a row that is not an object', ['nope']],
    ['a missing id', [{ ...ROW, id: undefined }]],
    ['a missing field', [{ ...ROW, barangay: undefined }]],
    ['a non-finite coordinate', [{ ...ROW, latitude: Number.NaN }]],
    ['a string coordinate', [{ ...ROW, longitude: '120.9' }]],
    ['a bad time', [{ ...ROW, updatedAt: 'yesterday' }]],
  ])('throws a server error for a bad body: %s', async (_name, body) => {
    api.request.mockResolvedValueOnce(body)
    await expect(fetchPickupLocation()).rejects.toMatchObject({ kind: 'server' })
  })

  it('lets request errors through', async () => {
    api.request.mockRejectedValueOnce(new ProductListError('forbidden', undefined, 403))
    await expect(fetchPickupLocation()).rejects.toMatchObject({ kind: 'forbidden' })
  })
})

describe('savePickupLocation', () => {
  it('POSTs the input when there is no id, and returns the saved row', async () => {
    api.request.mockResolvedValueOnce(ROW)
    expect(await savePickupLocation(INPUT)).toEqual(LOCATION)
    expect(api.request).toHaveBeenCalledWith('POST', '/pickup-locations', INPUT, undefined)
  })

  it('PATCHes /pickup-locations/:id when there is one', async () => {
    api.request.mockResolvedValueOnce(ROW)
    expect(await savePickupLocation(INPUT, ID)).toEqual(LOCATION)
    expect(api.request).toHaveBeenCalledWith('PATCH', `/pickup-locations/${ID}`, INPUT, undefined)
  })

  it('never sends a key the API would reject', async () => {
    api.request.mockResolvedValue(ROW)
    await savePickupLocation(INPUT)
    await savePickupLocation(INPUT, ID)
    for (const [, , body] of api.request.mock.calls) {
      expect(Object.keys(body as object).sort()).toEqual(Object.keys(INPUT).sort())
      for (const key of ['id', 'country', 'isDefault', 'createdAt', 'updatedAt', 'updatedBy']) expect(body).not.toHaveProperty(key)
    }
  })

  it('lets request errors through with their detail: 400, 404, 409', async () => {
    api.request.mockRejectedValueOnce(new ProductListError('validation', 'postalCode must be 4 digits', 400))
    await expect(savePickupLocation(INPUT, ID)).rejects.toMatchObject({ kind: 'validation', detail: 'postalCode must be 4 digits' })
    api.request.mockRejectedValueOnce(new ProductListError('not-found', `Pickup location with ID "${ID}" not found`, 404))
    await expect(savePickupLocation(INPUT, ID)).rejects.toMatchObject({ kind: 'not-found' })
    api.request.mockRejectedValueOnce(new ProductListError('conflict', 'Only one pickup location is currently supported.', 409))
    await expect(savePickupLocation(INPUT)).rejects.toMatchObject({ kind: 'conflict', detail: 'Only one pickup location is currently supported.' })
  })

  it('throws a server error when the answer is a bad row', async () => {
    api.request.mockResolvedValueOnce({ ...ROW, latitude: null })
    await expect(savePickupLocation(INPUT)).rejects.toMatchObject({ kind: 'server' })
  })
})
