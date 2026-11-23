import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError } from '../../src/service/fetchProductList'
import { createPickupLocation, deletePickupLocation, fetchPickupLocations, updatePickupLocation, type PickupInput } from '../../src/service/pickupLocation'

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
const LOCATION = { id: ID, ...INPUT, isDefault: true, updatedAt: '2026-11-19T07:05:00.000Z' }
// What the API sends: extra keys the app ignores.
const ROW = { ...LOCATION, country: 'Philippines', isDefault: true, createdAt: '2026-11-18T07:05:00.000Z' }

beforeEach(() => api.request.mockReset())

describe('fetchPickupLocations', () => {
  it('reads GET /pickup-locations: every row in the order sent, or an empty list', async () => {
    const spare = { ...ROW, id: 'second', isDefault: false }
    api.request.mockResolvedValueOnce([ROW, spare])
    expect(await fetchPickupLocations()).toEqual([LOCATION, { ...LOCATION, id: 'second', isDefault: false }])
    expect(api.request).toHaveBeenCalledWith('GET', '/pickup-locations', undefined, undefined)
    api.request.mockResolvedValueOnce([])
    expect(await fetchPickupLocations()).toEqual([])
  })

  it.each([
    ['not a list', ROW],
    ['a row that is not an object', ['nope']],
    ['a missing id', [{ ...ROW, id: undefined }]],
    ['a missing field', [{ ...ROW, barangay: undefined }]],
    ['a non-finite coordinate', [{ ...ROW, latitude: Number.NaN }]],
    ['a string coordinate', [{ ...ROW, longitude: '120.9' }]],
    ['a missing default flag', [{ ...ROW, isDefault: undefined }]],
    ['a bad time', [{ ...ROW, updatedAt: 'yesterday' }]],
  ])('throws a server error for a bad body: %s', async (_name, body) => {
    api.request.mockResolvedValueOnce(body)
    await expect(fetchPickupLocations()).rejects.toMatchObject({ kind: 'server' })
  })

  it('lets request errors through', async () => {
    api.request.mockRejectedValueOnce(new ProductListError('forbidden', undefined, 403))
    await expect(fetchPickupLocations()).rejects.toMatchObject({ kind: 'forbidden' })
  })
})

describe('createPickupLocation', () => {
  it('POSTs the input, with isDefault only when asked, and returns the saved row', async () => {
    api.request.mockResolvedValue(ROW)
    expect(await createPickupLocation(INPUT)).toEqual(LOCATION)
    expect(api.request).toHaveBeenCalledWith('POST', '/pickup-locations', INPUT, undefined)
    await createPickupLocation({ ...INPUT, isDefault: true })
    expect(api.request).toHaveBeenLastCalledWith('POST', '/pickup-locations', { ...INPUT, isDefault: true }, undefined)
  })

  it('throws a server error when the answer is a bad row', async () => {
    api.request.mockResolvedValueOnce({ ...ROW, latitude: null })
    await expect(createPickupLocation(INPUT)).rejects.toMatchObject({ kind: 'server' })
  })

  it('lets request errors through with their detail', async () => {
    api.request.mockRejectedValueOnce(new ProductListError('validation', 'postalCode must be 4 digits', 400))
    await expect(createPickupLocation(INPUT)).rejects.toMatchObject({ kind: 'validation', detail: 'postalCode must be 4 digits' })
  })
})

describe('updatePickupLocation', () => {
  it('PATCHes /pickup-locations/:id with only what is given', async () => {
    api.request.mockResolvedValue(ROW)
    expect(await updatePickupLocation(ID, INPUT)).toEqual(LOCATION)
    expect(api.request).toHaveBeenCalledWith('PATCH', `/pickup-locations/${ID}`, INPUT, undefined)
    await updatePickupLocation(ID, { isDefault: true })
    expect(api.request).toHaveBeenLastCalledWith('PATCH', `/pickup-locations/${ID}`, { isDefault: true }, undefined)
  })

  it('never sends a key the API would reject', async () => {
    api.request.mockResolvedValue(ROW)
    await createPickupLocation(INPUT)
    await updatePickupLocation(ID, INPUT)
    for (const [, , body] of api.request.mock.calls) {
      expect(Object.keys(body as object).sort()).toEqual(Object.keys(INPUT).sort())
      for (const key of ['id', 'country', 'isDefault', 'createdAt', 'updatedAt', 'updatedBy']) expect(body).not.toHaveProperty(key)
    }
  })

  it('lets request errors through with their detail: 400, 404', async () => {
    api.request.mockRejectedValueOnce(new ProductListError('validation', 'postalCode must be 4 digits', 400))
    await expect(updatePickupLocation(ID, INPUT)).rejects.toMatchObject({ kind: 'validation', detail: 'postalCode must be 4 digits' })
    api.request.mockRejectedValueOnce(new ProductListError('not-found', `Pickup location with ID "${ID}" not found`, 404))
    await expect(updatePickupLocation(ID, INPUT)).rejects.toMatchObject({ kind: 'not-found' })
  })
})

describe('deletePickupLocation', () => {
  it('DELETEs /pickup-locations/:id', async () => {
    api.request.mockResolvedValueOnce({ success: true })
    await expect(deletePickupLocation(ID)).resolves.toBeUndefined()
    expect(api.request).toHaveBeenCalledWith('DELETE', `/pickup-locations/${ID}`, undefined, undefined)
  })

  it('lets the 400 for the only location and the 404 through', async () => {
    api.request.mockRejectedValueOnce(new ProductListError('validation', 'Cannot delete the only pickup location', 400))
    await expect(deletePickupLocation(ID)).rejects.toMatchObject({ kind: 'validation', detail: 'Cannot delete the only pickup location' })
    api.request.mockRejectedValueOnce(new ProductListError('not-found', undefined, 404))
    await expect(deletePickupLocation(ID)).rejects.toMatchObject({ kind: 'not-found' })
  })
})
