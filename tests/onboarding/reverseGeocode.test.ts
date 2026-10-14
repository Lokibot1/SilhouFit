import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mapAddress, resetReverseGeocode, reverseGeocode } from '../../src/service/reverseGeocode'
import batangas from '../fixtures/nominatim/batangas.json'
import manila from '../fixtures/nominatim/manila.json'
import singapore from '../fixtures/nominatim/singapore.json'

const fetchMock = vi.fn()
const reply = (body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body)))

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  resetReverseGeocode()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('mapAddress', () => {
  it('maps house number and road to the street, postcode to postal, and the place levels', () => {
    expect(mapAddress(manila.address)).toEqual({
      street: '718 P. Paterno Street',
      postal: '1001',
      region: 'Metro Manila',
      city: 'Manila',
      barangays: ['Barangay 307', 'Quiapo', 'Barangay 383'],
    })
  })

  it('prefers the region over a state that is really the province', () => {
    expect(mapAddress(batangas.address)).toMatchObject({ region: 'Calabarzon', city: 'Batangas City', postal: '4200' })
  })

  it('leaves the postal code empty when there is none, and falls back to town', () => {
    const result = mapAddress({ road: 'Sample Road', town: 'Rodriguez', state: 'Calabarzon' })
    expect(result).toMatchObject({ street: 'Sample Road', postal: '', city: 'Rodriguez', region: 'Calabarzon' })
  })
})

describe('reverseGeocode', () => {
  it('asks Nominatim for English, street-level details at the pin', async () => {
    fetchMock.mockImplementation(reply(manila))
    await reverseGeocode(14.5995, 120.9842)
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/reverse')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      format: 'jsonv2',
      lat: '14.5995',
      lon: '120.9842',
      zoom: '18',
      addressdetails: '1',
      'accept-language': 'en',
    })
  })

  it('answers a spot it has seen from memory, rounding to five decimals', async () => {
    fetchMock.mockImplementation(reply(manila))
    const first = await reverseGeocode(14.599501, 120.984201)
    const second = await reverseGeocode(14.5995012, 120.9842009)
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('waits one second between requests', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(reply(manila))
    await reverseGeocode(14.5, 121.0)
    const second = reverseGeocode(14.6, 121.1)
    await vi.advanceTimersByTimeAsync(900)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    await second
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('says a spot outside the Philippines is outside', async () => {
    fetchMock.mockImplementation(reply(singapore))
    await expect(reverseGeocode(1.35, 103.82)).rejects.toMatchObject({ kind: 'outside' })
  })

  it('reports network and server failures, and does not cache them', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await expect(reverseGeocode(14.1, 121.1)).rejects.toMatchObject({ kind: 'network' })
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response('x', { status: 503 })))
    await expect(reverseGeocode(14.1, 121.1)).rejects.toMatchObject({ kind: 'server' })
  })
})
