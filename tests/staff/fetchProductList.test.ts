import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProductDetail, fetchProductList, ProductListError, UUID } from '../../src/service/fetchProductList'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}))

const fetchMock = vi.fn()
const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }))
const requested = () => new URL(String(fetchMock.mock.calls[0][0]), 'http://api.test')

const ITEM = { id: 'p1', name: 'Tee', category: 'Tops', brand: 'Silhou', minPrice: 100, maxPrice: 200, totalStock: 4, primaryImage: null, createdAt: '2026-01-01T00:00:00.000Z' }
const VARIANT = { id: 'v1', sku: 'TEE-S-BLK', size: 'S', color: 'Black', stock: 3, effectivePrice: 1299 }

beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

const kindOf = async (call: Promise<unknown>) => {
  const error = await call.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ProductListError)
  return (error as ProductListError).kind
}

describe('fetchProductList', () => {
  const META = { total: 1, page: 2, limit: 10, totalPages: 3, hasNextPage: true, hasPreviousPage: true }

  it('sends the filters, sort and paging as query parameters', async () => {
    reply({ data: [ITEM], meta: META })
    await fetchProductList({ search: 'tee', category: 'Tops', gender: 'female', inStockOnly: true, sortBy: 'basePrice', sortOrder: 'asc', page: 2, limit: 10 })
    const url = requested()
    expect(url.pathname).toBe('/products')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: 'tee',
      category: 'Tops',
      gender: 'female',
      inStockOnly: 'true',
      sortBy: 'basePrice',
      sortOrder: 'asc',
      page: '2',
      limit: '10',
    })
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer tok' })
  })

  it('leaves out parameters that are undefined', async () => {
    reply({ data: [], meta: { ...META, total: 0 } })
    await fetchProductList({ search: undefined, page: 1 })
    expect(Object.fromEntries(requested().searchParams)).toEqual({ page: '1' })
  })

  it('rejects a body without data or a total as a server fault', async () => {
    reply({ data: 'nope', meta: META })
    expect(await kindOf(fetchProductList({}))).toBe('server')
    reply({ data: [], meta: {} })
    expect(await kindOf(fetchProductList({}))).toBe('server')
  })

  it('maps a rate limit and a dropped connection to their kinds', async () => {
    reply({}, 429)
    expect(await kindOf(fetchProductList({}))).toBe('rate-limit')
    fetchMock.mockRejectedValue(new TypeError('offline'))
    expect(await kindOf(fetchProductList({}))).toBe('network')
  })
})

describe('fetchProductDetail', () => {
  it('asks for the product by id and returns its variants', async () => {
    reply({ id: 'p1', name: 'Tee', variants: [VARIANT, { ...VARIANT, id: 'v2', stock: 0 }] })
    const detail = await fetchProductDetail('p1')
    expect(requested().pathname).toBe('/products/p1')
    expect(detail.variants).toEqual([VARIANT, { ...VARIANT, id: 'v2', stock: 0 }])
  })

  it('returns an empty list for a product with no variants', async () => {
    reply({ variants: [] })
    expect((await fetchProductDetail('p1')).variants).toEqual([])
  })

  it('treats a malformed body as a server fault', async () => {
    for (const body of [{ name: 'Tee' }, { variants: [{ ...VARIANT, stock: 'many' }] }, { variants: [{ ...VARIANT, sku: undefined }] }, { variants: ['x'] }]) {
      reply(body)
      expect(await kindOf(fetchProductDetail('p1'))).toBe('server')
    }
  })

  it('reports an unknown product as not-found', async () => {
    reply({ message: 'Not found' }, 404)
    expect(await kindOf(fetchProductDetail('p1'))).toBe('not-found')
  })
})

describe('UUID', () => {
  it('matches only a full product id', () => {
    expect(UUID.test('0b9c6f5e-1a2b-4c3d-8e9f-0123456789ab')).toBe(true)
    expect(UUID.test('0b9c6f5e')).toBe(false)
  })
})
