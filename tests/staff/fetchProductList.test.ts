import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProductFilters } from '../../src/service/fetchProductFilters'
import { fetchProductById, fetchProductDetail, fetchProductList, ProductListError, UUID } from '../../src/service/fetchProductList'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}))

const fetchMock = vi.fn()
const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }))
const requested = () => new URL(String(fetchMock.mock.calls[0][0]), 'http://api.test')

const ITEM = { id: 'p1', name: 'Tee', category: 'Hoodie', brand: 'Silhou', minPrice: 100, maxPrice: 200, totalStock: 4, primaryImage: null, createdAt: '2026-01-01T00:00:00.000Z' }
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
    await fetchProductList({ search: 'tee', category: 'Hoodie', gender: 'female', stockLevel: 'in', sortBy: 'name', sortOrder: 'asc', page: 2, limit: 10 })
    const url = requested()
    expect(url.pathname).toBe('/products')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: 'tee',
      category: 'Hoodie',
      gender: 'female',
      stockLevel: 'in',
      sortBy: 'name',
      sortOrder: 'asc',
      page: '2',
      limit: '10',
    })
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer tok' })
  })

  it('sends stockLevel in, low and out, sortBy=price in both directions, and drops an unknown stockLevel', async () => {
    for (const stockLevel of ['in', 'low', 'out'] as const) {
      fetchMock.mockClear()
      reply({ data: [], meta: { ...META, total: 0 } })
      await fetchProductList({ stockLevel })
      expect(Object.fromEntries(requested().searchParams)).toEqual({ stockLevel })
    }
    for (const sortOrder of ['asc', 'desc'] as const) {
      fetchMock.mockClear()
      reply({ data: [], meta: { ...META, total: 0 } })
      await fetchProductList({ sortBy: 'price', sortOrder })
      expect(Object.fromEntries(requested().searchParams)).toEqual({ sortBy: 'price', sortOrder })
    }
    fetchMock.mockClear()
    reply({ data: [], meta: { ...META, total: 0 } })
    await fetchProductList({ stockLevel: 'sizes' as never })
    expect(requested().search).toBe('')
  })

  it('sends isArReady as true or false, and never a value that is not a boolean', async () => {
    reply({ data: [], meta: { ...META, total: 0 } })
    await fetchProductList({ isArReady: true })
    expect(Object.fromEntries(requested().searchParams)).toEqual({ isArReady: 'true' })
    fetchMock.mockClear()
    reply({ data: [], meta: { ...META, total: 0 } })
    await fetchProductList({ isArReady: false })
    expect(Object.fromEntries(requested().searchParams)).toEqual({ isArReady: 'false' })
    fetchMock.mockClear()
    reply({ data: [], meta: { ...META, total: 0 } })
    await fetchProductList({ isArReady: 'yes' as unknown as boolean, page: 1 })
    expect(Object.fromEntries(requested().searchParams)).toEqual({ page: '1' })
  })

  it('reads isArReady onto the list item as arReady, and leaves it absent when the API sends none', async () => {
    reply({ data: [{ ...ITEM, isArReady: true }, { ...ITEM, id: 'p2', isArReady: false }, { ...ITEM, id: 'p3' }, { ...ITEM, id: 'p4', isArReady: 'yes' }], meta: META })
    const { data } = await fetchProductList({})
    expect(data.map((item) => item.arReady)).toEqual([true, false, undefined, undefined])
  })

  it('leaves out parameters that are undefined', async () => {
    reply({ data: [], meta: { ...META, total: 0 } })
    await fetchProductList({ search: undefined, page: 1 })
    expect(Object.fromEntries(requested().searchParams)).toEqual({ page: '1' })
  })

  it('sends the brand, sizes, colours and price range filters, one repeated key per value', async () => {
    reply({ data: [], meta: { ...META, total: 0 } })
    await fetchProductList({ brand: ' Nike ', sizes: ['M', ' L '], colors: ['Black', 'Red, White'], minPrice: 0, maxPrice: 500.5 })
    const { searchParams } = requested()
    expect(searchParams.getAll('sizes')).toEqual(['M', 'L'])
    expect(searchParams.getAll('colors')).toEqual(['Black', 'Red, White'])
    expect(searchParams.get('brand')).toBe('Nike')
    expect(searchParams.get('maxPrice')).toBe('500.5')
    expect(searchParams.has('size')).toBe(false)
    expect(searchParams.has('color')).toBe(false)
  })

  it('leaves out blank text, NaN and negative prices, and any sort the API does not have', async () => {
    reply({ data: [], meta: { ...META, total: 0 } })
    await fetchProductList({ brand: '   ', sizes: [], colors: [' '], minPrice: NaN, maxPrice: -1, sortBy: 'basePrice' as never, sortOrder: 'asc', page: 1 })
    const sent = Object.fromEntries(requested().searchParams)
    expect(sent).toEqual({ sortOrder: 'asc', page: '1' })
    expect(requested().search).not.toContain('basePrice')
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
      category: 'Hoodie',
      images: [
        { url: 'https://x/b.jpg', altText: null, displayOrder: 1, isPrimary: false },
        { url: 'https://x/a.jpg', altText: 'Tee', displayOrder: 0, isPrimary: true },
      ],
    })
    expect((await fetchProductDetail('p1')).product).toEqual({
      description: 'Soft',
      gender: 'female',
      brand: null,
      category: 'Hoodie',
      isArReady: false,
      images: [
        { url: 'https://x/a.jpg', altText: 'Tee', displayOrder: 0, isPrimary: true },
        { url: 'https://x/b.jpg', altText: null, displayOrder: 1, isPrimary: false },
      ],
    })
  })

  it('reads isArReady from the detail, for the edit form and as arReady on the item', async () => {
    const body = { ...ITEM, variants: [], images: [], isArReady: true }
    reply(body)
    expect((await fetchProductDetail('p1')).product?.isArReady).toBe(true)
    reply(body)
    expect((await fetchProductById('p1')).arReady).toBe(true)
    reply({ ...body, isArReady: undefined })
    expect((await fetchProductDetail('p1')).product?.isArReady).toBe(false)
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

describe('list item stock, colours and sizes', () => {
  const META = { total: 1, page: 1, limit: 25, totalPages: 1, hasNextPage: false, hasPreviousPage: false }
  const first = async (extra: Record<string, unknown>) => {
    reply({ data: [{ ...ITEM, ...extra }], meta: META })
    return (await fetchProductList({})).data[0]
  }

  it('reads the counts, colours and sizes the list sends', async () => {
    const item = await first({
      outOfStockVariants: 2,
      variantCount: 5,
      colors: [{ name: 'Navy', hex: '#1b2a49' }, { name: 'Navy', hex: '#000080' }],
      sizes: ['M', 'S'],
    })
    expect(item).toMatchObject({ outOfStockVariants: 2, variantCount: 5, sizes: ['M', 'S'] })
    expect(item.colors).toEqual([{ name: 'Navy', hex: '#1b2a49' }, { name: 'Navy', hex: '#000080' }])
  })

  it('leaves them absent when the API sends none', async () => {
    const item = await first({})
    for (const key of ['outOfStockVariants', 'variantCount', 'colors', 'sizes']) expect(item).not.toHaveProperty(key)
  })

  it('drops malformed values instead of failing', async () => {
    const item = await first({
      outOfStockVariants: '2',
      variantCount: NaN,
      colors: [{ name: '', hex: '#fff' }, { name: 'Black' }, { name: 'Sand', hex: 7 }, null, 'Navy', { name: 'Ok', hex: '#111111' }],
      sizes: ['S', '', 4, null, 'M'],
    })
    expect(item).not.toHaveProperty('outOfStockVariants')
    expect(item).not.toHaveProperty('variantCount')
    expect(item.colors).toEqual([{ name: 'Ok', hex: '#111111' }])
    expect(item.sizes).toEqual(['S', 'M'])
    expect(await first({ colors: 'Navy', sizes: {} })).not.toHaveProperty('colors')
  })
})

describe('status', () => {
  const EMPTY = { data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }

  it.each(['active', 'archived', 'all'] as const)('is sent as %s', async (status) => {
    reply(EMPTY)
    await fetchProductList({ status })
    expect(requested().searchParams.get('status')).toBe(status)
  })

  it('is left out when absent or not one of those', async () => {
    reply(EMPTY)
    await fetchProductList({ page: 1 })
    expect(requested().searchParams.has('status')).toBe(false)
    fetchMock.mockReset()
    reply(EMPTY)
    await fetchProductList({ status: 'deleted' as never })
    expect(requested().searchParams.has('status')).toBe(false)
  })

  it('reports a 403 (not staff) as forbidden', async () => {
    reply({ message: 'Only staff members can view archived products' }, 403)
    const error = await fetchProductList({ status: 'archived' }).catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'forbidden', detail: 'Only staff members can view archived products' })
  })
})

describe('fetchProductFilters', () => {
  it('asks GET /products/filters and shapes the answer', async () => {
    reply({
      categories: ['Hoodie'],
      brands: ['Nike', 7, ''],
      sizes: ['L', 'S'],
      colors: [{ name: 'Navy', hex: '#1b2a49' }, { name: 'navy', hex: '#000080' }, { name: 'Sand', hex: '' }, { name: 'Black' }, { hex: '#fff' }, null],
      minPrice: 1200,
      maxPrice: 2600,
    })
    const filters = await fetchProductFilters()
    expect(requested().pathname).toBe('/products/filters')
    expect(filters).toEqual({
      categories: ['Hoodie'],
      brands: ['Nike'],
      sizes: ['L', 'S'],
      colors: [{ name: 'Navy', hex: '#1b2a49' }, { name: 'Sand', hex: null }, { name: 'Black', hex: null }],
      minPrice: 1200,
      maxPrice: 2600,
    })
  })

  it('turns missing lists into empty ones and non-finite prices into 0', async () => {
    reply({ categories: 'x', colors: {}, minPrice: 'a', maxPrice: null })
    expect(await fetchProductFilters()).toEqual({ categories: [], brands: [], sizes: [], colors: [], minPrice: 0, maxPrice: 0 })
  })

  it('fails as a server fault for a body that is not an object, and with the network kind when offline', async () => {
    reply(null)
    expect(await kindOf(fetchProductFilters())).toBe('server')
    fetchMock.mockReset()
    fetchMock.mockRejectedValue(new TypeError('offline'))
    expect(await kindOf(fetchProductFilters())).toBe('network')
  })
})
