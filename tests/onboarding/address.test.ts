import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAddress, saveAddress, type SavedAddress } from '../../src/service/address'

const ADDRESS: SavedAddress = {
  regionCode: '130000000',
  region: 'NCR',
  province: '',
  cityCode: '133900000',
  city: 'City of Manila',
  barangayCode: '133901176',
  barangay: 'Barangay 176',
  street: '12 Rizal Avenue',
  postal: '1000',
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('address service', () => {
  it('returns null before anything is saved', async () => {
    expect(await getAddress('anne@example.com')).toBeNull()
  })

  it('saves per email, ignoring case, and keeps accounts apart', async () => {
    await saveAddress('Anne@Example.com', ADDRESS)
    expect(await getAddress('anne@example.com')).toEqual(ADDRESS)
    expect(await getAddress('ben@example.com')).toBeNull()
    expect(localStorage.getItem('silhoufit-address:anne@example.com')).not.toBeNull()
  })

  it('stores no coordinates', async () => {
    await saveAddress('anne@example.com', ADDRESS)
    const raw = localStorage.getItem('silhoufit-address:anne@example.com')!
    expect(raw).not.toMatch(/lat|lon/i)
  })

  it('keeps a typed place with null codes', async () => {
    const typed = { ...ADDRESS, regionCode: null, cityCode: null, barangayCode: null }
    await saveAddress('anne@example.com', typed)
    expect(await getAddress('anne@example.com')).toEqual(typed)
  })

  it('treats unreadable data as no address', async () => {
    localStorage.setItem('silhoufit-address:anne@example.com', '{not json')
    expect(await getAddress('anne@example.com')).toBeNull()
    localStorage.setItem('silhoufit-address:anne@example.com', JSON.stringify({ city: 5 }))
    expect(await getAddress('anne@example.com')).toBeNull()
  })

  it('rejects when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await expect(getAddress('anne@example.com')).rejects.toThrow()
    vi.restoreAllMocks()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await expect(saveAddress('anne@example.com', ADDRESS)).rejects.toThrow()
  })
})
