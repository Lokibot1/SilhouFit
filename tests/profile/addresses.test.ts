import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, setSession } from '../../src/service/session'
import { ADDRESS, address } from '../fixtures/addresses'

const getSession = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession } }),
}))

const {
  AddressError,
  clearAddressCache,
  createAddress,
  deleteAddress,
  getAddressById,
  getDefaultAddress,
  listAddresses,
  loadAddresses,
  onAddressesChanged,
  updateAddress,
} = await import('../../src/service/addresses')

const fetchMock = vi.fn()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const ID = ADDRESS.id

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  getSession.mockResolvedValue({ data: { session: { access_token: 'token-123' } } })
  vi.stubGlobal('fetch', fetchMock)
  setSession({ name: 'Anne Santos', email: 'anne@example.com' })
  clearAddressCache()
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  clearSession()
})

describe('the requests', () => {
  it('lists with GET and the bearer token, and returns the rows in the order sent', async () => {
    const second = address({ id: '22222222-2222-4222-8222-222222222222', isDefault: false })
    fetchMock.mockResolvedValue(json([ADDRESS, second]))
    expect(await listAddresses()).toEqual([ADDRESS, second])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/users\/me\/addresses$/)
    expect(init.method).toBe('GET')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-123' })
    expect(init.body).toBeUndefined()
  })

  it('treats an empty list as normal', async () => {
    fetchMock.mockResolvedValue(json([]))
    expect(await listAddresses()).toEqual([])
  })

  it('gets one address by id', async () => {
    fetchMock.mockResolvedValue(json(ADDRESS))
    expect(await getAddressById(ID)).toEqual(ADDRESS)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(new RegExp(`/users/me/addresses/${ID}$`))
    expect(init.method).toBe('GET')
  })

  it('creates with POST and the JSON body', async () => {
    fetchMock.mockResolvedValue(json(ADDRESS, 201))
    const input = {
      recipientName: 'Anne Santos',
      phone: '+639171234567',
      region: 'NCR',
      cityMunicipality: 'City of Manila',
      barangay: 'Barangay 176',
      streetAddress: '12 Rizal Avenue',
      postalCode: '1000',
    }
    expect(await createAddress(input)).toEqual(ADDRESS)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/users\/me\/addresses$/)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-123', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual(input)
  })

  it('updates with PATCH and only the passed fields, nulls included', async () => {
    fetchMock.mockResolvedValue(json(ADDRESS))
    await updateAddress(ID, { label: null, isDefault: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(new RegExp(`/users/me/addresses/${ID}$`))
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ label: null, isDefault: true })
  })

  it('deletes with DELETE and checks the success flag', async () => {
    fetchMock.mockResolvedValue(json({ success: true }))
    await expect(deleteAddress(ID)).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(new RegExp(`/users/me/addresses/${ID}$`))
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it.each([{ success: false }, {}, null])('is a server error when a delete answers %j', async (body) => {
    fetchMock.mockResolvedValue(json(body))
    await expect(deleteAddress(ID)).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('failures', () => {
  it('is unauthorized without a session, and sends no request', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(listAddresses()).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is a server error when the session cannot be read', async () => {
    getSession.mockRejectedValue(new Error('storage blocked'))
    await expect(listAddresses()).rejects.toMatchObject({ kind: 'server' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [400, 'invalid'],
    [401, 'unauthorized'],
    [404, 'not-found'],
    [422, 'invalid'],
    [429, 'rate-limit'],
    [500, 'server'],
    [503, 'server'],
  ])('maps a %i answer to %s', async (status, kind) => {
    fetchMock.mockResolvedValue(json({}, status))
    const error = await updateAddress(ID, { label: 'x' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AddressError)
    expect(error).toMatchObject({ kind })
  })

  it('carries the server message of a 400, whether Nest sent a string or a list', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Validation failed (uuid is expected)' }, 400))
    await expect(getAddressById('nope')).rejects.toMatchObject({ kind: 'invalid', detail: 'Validation failed (uuid is expected)' })
    fetchMock.mockResolvedValueOnce(json({ message: ['phone must be valid', 'postalCode must be 4 digits'] }, 400))
    await expect(createAddress({ recipientName: 'A', phone: 'x', region: 'NCR', cityMunicipality: 'Manila', barangay: 'B', streetAddress: 'S', postalCode: '1000' })).rejects.toMatchObject({
      kind: 'invalid',
      detail: 'phone must be valid; postalCode must be 4 digits',
    })
  })

  it('keeps the detail for a 400 only', async () => {
    fetchMock.mockResolvedValue(json({ message: 'boom' }, 500))
    expect(await listAddresses().catch((e: unknown) => (e as { detail?: string }).detail)).toBeUndefined()
  })

  it('is a network error when the request never completes', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(listAddresses()).rejects.toMatchObject({ kind: 'network' })
  })

  it('rethrows an abort as the AbortError itself', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(listAddresses({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects before fetching when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(listAddresses({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['a body that is not JSON', new Response('<html>', { status: 200 })],
    ['a list that is not an array', json({ addresses: [] })],
    ['a row missing a required field', json([{ ...ADDRESS, streetAddress: undefined }])],
    ['a row with a required field that is not text', json([{ ...ADDRESS, postalCode: 1000 }])],
    ['null', json(null)],
  ])('is a server error for %s', async (_name, response) => {
    fetchMock.mockResolvedValue(response)
    await expect(listAddresses()).rejects.toMatchObject({ kind: 'server' })
  })

  it('is a server error when one row of the list is malformed', async () => {
    fetchMock.mockResolvedValue(json([ADDRESS, { id: 'x' }]))
    await expect(listAddresses()).rejects.toMatchObject({ kind: 'server' })
  })

  it('is a server error when a single row is malformed', async () => {
    fetchMock.mockResolvedValue(json({ id: 'x' }))
    await expect(getAddressById(ID)).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('the row', () => {
  it('turns missing or non-text optional fields into null and isDefault into a boolean', async () => {
    const { label: _l, province: _p, addressLine2: _a, ...rest } = ADDRESS
    fetchMock.mockResolvedValue(json({ ...rest, province: 5, isDefault: 'yes' }))
    expect(await getAddressById(ID)).toEqual({ ...ADDRESS, label: null, province: null, addressLine2: null, isDefault: false })
  })

  it('keeps the optional fields that are text', async () => {
    const full = address({ label: 'Office', province: 'Batangas', addressLine2: 'Unit 4B', isDefault: false })
    fetchMock.mockResolvedValue(json(full))
    expect(await getAddressById(ID)).toEqual(full)
  })
})

describe('loadAddresses', () => {
  const list = [ADDRESS]

  it('shares one request between concurrent callers', async () => {
    fetchMock.mockResolvedValue(json(list))
    const [a, b] = await Promise.all([loadAddresses(), loadAddresses()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toEqual(list)
    expect(b).toEqual(list)
  })

  it('serves the cache for 30 seconds, then asks again', async () => {
    fetchMock.mockImplementation(async () => json(list))
    await loadAddresses()
    vi.setSystemTime(Date.now() + 29_000)
    await loadAddresses()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 2_000)
    await loadAddresses()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('force asks the server even when the cache is fresh', async () => {
    fetchMock.mockImplementation(async () => json(list))
    await loadAddresses()
    await loadAddresses({ force: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never caches a failure', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500)).mockResolvedValue(json(list))
    await expect(loadAddresses()).rejects.toMatchObject({ kind: 'server' })
    expect(await loadAddresses()).toEqual(list)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['create', () => createAddress({ recipientName: 'A', phone: '+639171234567', region: 'NCR', cityMunicipality: 'Manila', barangay: 'B', streetAddress: 'S', postalCode: '1000' }), json(ADDRESS, 201)],
    ['update', () => updateAddress(ID, { label: 'x' }), json(ADDRESS)],
    ['delete', () => deleteAddress(ID), json({ success: true })],
  ])('a successful %s clears the cache and tells the listeners', async (_name, mutate, response) => {
    fetchMock.mockImplementation(async () => json(list))
    await loadAddresses()
    const changed = vi.fn()
    const off = onAddressesChanged(changed)
    fetchMock.mockResolvedValueOnce(response)
    await mutate()
    expect(changed).toHaveBeenCalledTimes(1)
    fetchMock.mockImplementation(async () => json(list))
    await loadAddresses()
    expect(fetchMock).toHaveBeenCalledTimes(3) // list, the mutation, list again
    off()
  })

  it('a failed mutation changes nothing', async () => {
    fetchMock.mockImplementation(async () => json(list))
    await loadAddresses()
    const changed = vi.fn()
    onAddressesChanged(changed)
    fetchMock.mockResolvedValueOnce(json({}, 500))
    await expect(deleteAddress(ID)).rejects.toMatchObject({ kind: 'server' })
    expect(changed).not.toHaveBeenCalled()
    await loadAddresses()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops calling a listener after it unsubscribes', async () => {
    const changed = vi.fn()
    onAddressesChanged(changed)()
    fetchMock.mockResolvedValue(json({ success: true }))
    await deleteAddress(ID)
    expect(changed).not.toHaveBeenCalled()
  })

  it('does not let a read that finishes after a change overwrite the newer data', async () => {
    let finish: (r: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)))
    const stale = loadAddresses()
    fetchMock.mockResolvedValueOnce(json({ success: true }))
    await deleteAddress(ID)
    finish(json(list))
    await stale
    fetchMock.mockResolvedValue(json([]))
    expect(await loadAddresses()).toEqual([])
  })

  it('does not hand one account the other account’s cache', async () => {
    fetchMock.mockImplementation(async () => json(list))
    await loadAddresses()
    setSession({ name: 'Ben Cruz', email: 'ben@example.com' })
    await loadAddresses()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('clearAddressCache forgets the list', async () => {
    fetchMock.mockImplementation(async () => json(list))
    await loadAddresses()
    clearAddressCache()
    await loadAddresses()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('an abort stops that caller waiting, and the shared request carries on for the other', async () => {
    let finish: (r: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)))
    const controller = new AbortController()
    const quitter = loadAddresses({ signal: controller.signal })
    const stayer = loadAddresses()
    const rejected = expect(quitter).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    finish(json(list))
    expect(await stayer).toEqual(list)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // And the result was cached for the next caller.
    await loadAddresses()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects at once for a signal that is already aborted', async () => {
    fetchMock.mockResolvedValue(json(list))
    const controller = new AbortController()
    controller.abort()
    await expect(loadAddresses({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('getDefaultAddress', () => {
  const other = address({ id: '22222222-2222-4222-8222-222222222222', isDefault: false })

  it('finds the default, wherever it is', () => {
    expect(getDefaultAddress([other, ADDRESS])).toBe(ADDRESS)
  })

  it('falls back to the first row, and to null for an empty list', () => {
    expect(getDefaultAddress([other, address({ isDefault: false })])).toBe(other)
    expect(getDefaultAddress([])).toBeNull()
  })
})
