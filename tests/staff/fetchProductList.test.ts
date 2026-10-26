import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProductDetail, fetchProductList, ProductListError, UUID } from '../../src/service/fetchProductList'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}))

const fetchMock = vi.fn()
const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }))
const requested = () => new URL(String(fetchMock.mock.calls[0][0]), 'http://api.test')

const ITEM = { id: 'p1', name: 'Tee', category: 'Tops', brand: 'Silhou', minPrice: 100, maxPrice: 200, totalStock: 4, primaryImage: null, createdAt: '2026-01-01T00:00:00.000Z' }
const VARIANT = { id: 'v1', sku: 'TEE-S-BLK', name: null, size: 'S', color: 'Black', colorHex: '#1b1d21', price: 1299, stock: 3, imageUrl: null, measurements: null }

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

  it('reads the API price, a stock of 0 and variants with no size, colour or name', async () => {
    reply({ variants: [{ id: 'v3', sku: 'X', name: null, size: null, color: null, colorHex: null, price: 0, stock: 0, imageUrl: null, measurements: null }] })
    expect((await fetchProductDetail('p1')).variants).toEqual([
      { id: 'v3', sku: 'X', name: null, size: null, color: null, colorHex: null, price: 0, stock: 0, imageUrl: null, measurements: null },
    ])
  })

  it('reads garment measurements, with the ones never filled in as null', async () => {
    reply({ variants: [{ ...VARIANT, measurements: { id: 'm1', variantId: 'v1', chestWidthCm: 52.5, neckCm: null } }] })
    const { measurements } = (await fetchProductDetail('p1')).variants[0]
    expect(measurements).toMatchObject({ chestWidthCm: 52.5, neckCm: null, thighCm: null })
    expect(Object.keys(measurements!)).toHaveLength(9)
  })

  it('returns the product fields the edit form starts from, images in display order', async () => {
    reply({
      variants: [],
      description: 'Soft',
      gender: 'female',
      brand: null,
      category: 'Tops',
      images: [
        { url: 'https://x/b.jpg', altText: null, displayOrder: 1, isPrimary: false },
        { url: 'https://x/a.jpg', altText: 'Tee', displayOrder: 0, isPrimary: true },
      ],
    })
    expect((await fetchProductDetail('p1')).product).toEqual({
      description: 'Soft',
      gender: 'female',
      brand: null,
      category: 'Tops',
      images: [
        { url: 'https://x/a.jpg', altText: 'Tee', displayOrder: 0, isPrimary: true },
        { url: 'https://x/b.jpg', altText: null, displayOrder: 1, isPrimary: false },
      ],
    })
  })
})

describe('isActive', () => {
  it('is copied onto a list item when the API sends it, so an archived product shows as archived', async () => {
    reply({ data: [{ ...ITEM, isActive: false }, ITEM], meta: { total: 2, page: 1, limit: 25, totalPages: 1, hasNextPage: false, hasPreviousPage: false } })
    const { data } = await fetchProductList({})
    expect(data[0].isActive).toBe(false)
    expect(data[1]).not.toHaveProperty('isActive')
  })
})

describe('UUID', () => {
  it('matches only a full product id', () => {
    expect(UUID.test('0b9c6f5e-1a2b-4c3d-8e9f-0123456789ab')).toBe(true)
    expect(UUID.test('0b9c6f5e')).toBe(false)
  })
})
