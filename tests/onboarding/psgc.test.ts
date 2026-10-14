import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBarangays, getCities, getProvinces, getRegions, resetPsgcCache } from '../../src/service/psgc'
import regions from '../fixtures/psgc/regions.json'
import ncrCities from '../fixtures/psgc/ncr-cities.json'
import manilaBarangays from '../fixtures/psgc/manila-barangays.json'

const fetchMock = vi.fn()
const ok = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data)))
// A request that never answers and rejects when it is aborted, like a real fetch.
const hang = (_url: string, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  resetPsgcCache()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('PSGC service', () => {
  it('reads regions, and NCR has no provinces while its cities sit under no province', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/regions/') ? ok(regions) : url.endsWith('/provinces/') ? ok([]) : ok(ncrCities),
    )
    const list = await getRegions()
    const ncr = list.find((r) => r.name === 'NCR')!
    expect(ncr).toMatchObject({ code: '130000000', regionName: 'National Capital Region' })
    expect(await getProvinces(ncr.code)).toEqual([])
    const cities = await getCities(ncr.code)
    expect(cities.map((c) => c.name)).toContain('City of Manila')
    expect(cities.every((c) => c.provinceCode === false)).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('https://psgc.gitlab.io/api/regions/130000000/cities-municipalities/', expect.anything())
  })

  it('sorts barangays naturally, so Barangay 2 comes before Barangay 10', async () => {
    fetchMock.mockImplementation(() => ok(manilaBarangays))
    const names = (await getBarangays('133900000')).map((b) => b.name)
    expect(names.indexOf('Barangay 2')).toBeLessThan(names.indexOf('Barangay 10'))
    expect(fetchMock).toHaveBeenCalledWith('https://psgc.gitlab.io/api/cities-municipalities/133900000/barangays/', expect.anything())
  })

  it('shares one request between callers and answers later calls from memory', async () => {
    fetchMock.mockImplementation(() => ok(regions))
    const [a, b] = await Promise.all([getRegions(), getRegions()])
    expect(a).toBe(b)
    await getRegions()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a failed request with backoff and then succeeds', async () => {
    vi.useFakeTimers()
    fetchMock.mockRejectedValueOnce(new TypeError('offline')).mockRejectedValueOnce(new TypeError('offline')).mockImplementation(() => ok(regions))
    const result = getRegions()
    await vi.advanceTimersByTimeAsync(499)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(await result).toHaveLength(regions.length)
  })

  it('gives up after three attempts and forgets the failure so a retry asks again', async () => {
    vi.useFakeTimers()
    fetchMock.mockRejectedValue(new TypeError('offline'))
    const failed = expect(getRegions()).rejects.toMatchObject({ kind: 'network' })
    await vi.advanceTimersByTimeAsync(5000)
    await failed
    expect(fetchMock).toHaveBeenCalledTimes(3)

    fetchMock.mockImplementation(() => ok(regions))
    expect(await getRegions()).toHaveLength(regions.length)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('treats an HTTP error as a server problem', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(() => Promise.resolve(new Response('nope', { status: 500 })))
    const failed = expect(getRegions()).rejects.toMatchObject({ kind: 'server' })
    await vi.advanceTimersByTimeAsync(5000)
    await failed
  })

  it('times a request out after 8 seconds', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(hang)
    const failed = expect(getRegions()).rejects.toMatchObject({ kind: 'timeout' })
    await vi.advanceTimersByTimeAsync(7999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await vi.advanceTimersByTimeAsync(10000 + 16000)
    await failed
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('stops waiting when the caller aborts, while the shared request carries on', async () => {
    let answer!: (value: Response) => void
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)))
    const controller = new AbortController()
    const waiting = expect(getRegions(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await waiting
    answer(new Response(JSON.stringify(regions)))
    expect(await getRegions()).toHaveLength(regions.length)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
