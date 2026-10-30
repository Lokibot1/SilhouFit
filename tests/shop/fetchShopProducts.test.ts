import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProductFull, fetchProductList, ProductListError, type PaginatedProducts, type ProductFull } from '../../src/service/fetchProductList'
import { fetchShopProduct, fetchShopProducts } from '../../src/service/fetchShopProducts'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  fetchProductList: vi.fn(),
  fetchProductFull: vi.fn(),
}))
const list = vi.mocked(fetchProductList)
const full = vi.mocked(fetchProductFull)

const answer: PaginatedProducts = {
  data: [
    { id: 'a', name: 'Tee', slug: 'tee', category: 'Hoodie', brand: 'Nike', minPrice: 500, maxPrice: 700, totalStock: 4, primaryImage: { url: '/t.webp', altText: null }, createdAt: '2026-01-05T00:00:00.000Z' },
    { id: 'b', name: 'Bare', slug: 'bare', category: 'Hats', brand: null, minPrice: 100, maxPrice: 100, totalStock: 0, primaryImage: null, createdAt: '' },
  ],
  meta: { total: 30, page: 2, limit: 12, totalPages: 3, hasNextPage: true, hasPreviousPage: true },
}

const v = (id: string, color: string | null, colorHex: string | null, size: string, stock: number) => ({
  id, sku: id, name: null, size, color, colorHex, price: 500, stock, imageUrl: null, measurements: null,
})
const detail = (overrides: Partial<ProductFull> = {}): ProductFull => ({
  item: { id: 'a', name: 'Tee', slug: 'tee', category: 'Hoodie', brand: 'Nike', minPrice: 500, maxPrice: 700, totalStock: 7, primaryImage: null, createdAt: '2026-01-05T00:00:00.000Z', isActive: true },
  variants: [v('v1', 'Black', '#111111', 'S', 4), v('v2', 'black', null, 'M', 3), v('v3', 'Navy', '#1b2a49', 'M', 0)],
  description: 'A tee.',
  gender: null,
  brand: 'Nike',
  category: 'Hoodie',
  images: [
    { url: '/back.webp', altText: null, displayOrder: 1, isPrimary: false },
    { url: '/front.webp', altText: 'Front', displayOrder: 0, isPrimary: true },
  ],
  ...overrides,
} as ProductFull)

beforeEach(() => {
  vi.resetAllMocks()
  list.mockResolvedValue(answer)
})

describe('fetchShopProducts', () => {
  it('adapts list items without inventing a sale price, colours, badges, channels or ratings', async () => {
    const result = await fetchShopProducts({ page: 2, limit: 12 })
    expect(list).toHaveBeenCalledWith({ page: 2, limit: 12 }, expect.anything())
    expect(result).toMatchObject({ total: 30, page: 2, pageCount: 3 })
    expect(result.products[0]).toMatchObject({
      id: 'a', slug: 'tee', category: 'Hoodie', boutique: 'Nike', price: 500, priceMax: 700, image: '/t.webp', stock: 4,
      colors: [], badges: [], channels: [], arReady: false, rating: 0, reviews: 0,
    })
    expect(result.products[0].salePrice).toBeUndefined()
    expect(result.products[1]).toMatchObject({ boutique: '', category: 'Hats', image: '', stock: 0 })
  })

  it('takes colours from the list item once each (ignoring case, the first swatch wins), and none when the list sends none', async () => {
    list.mockResolvedValue({
      ...answer,
      data: [{ ...answer.data[0], colors: [{ name: 'Navy', hex: '#1b2a49' }, { name: 'navy', hex: '#000080' }, { name: 'Sand', hex: '#d8c3a5' }] }, answer.data[1]],
    })
    const { products } = await fetchShopProducts({})
    expect(products[0].colors).toEqual([{ name: 'Navy', hex: '#1b2a49' }, { name: 'Sand', hex: '#d8c3a5' }])
    expect(products[1].colors).toEqual([])
  })

  it('marks a product AR ready only when the API says so', async () => {
    list.mockResolvedValue({ ...answer, data: [{ ...answer.data[0], arReady: true }, answer.data[1]] })
    const { products } = await fetchShopProducts({})
    expect(products.map((p) => p.arReady)).toEqual([true, false])
  })

  it('does not ask for a minimum above the maximum', async () => {
    expect(await fetchShopProducts({ minPrice: 900, maxPrice: 100 })).toMatchObject({ products: [], total: 0, page: 1, pageCount: 1 })
    expect(list).not.toHaveBeenCalled()
  })
})

describe('fetchShopProduct', () => {
  it('builds colours once each (ignoring case), photos, description and stock from the detail', async () => {
    full.mockResolvedValue(detail())
    const product = await fetchShopProduct('tee')
    expect(product).toMatchObject({ id: 'a', description: 'A tee.', stock: 7, price: 500, priceMax: 700 })
    expect(product.colors.map((c) => c.name.toLowerCase())).toEqual(['black', 'navy'])
    expect(product.variants).toHaveLength(3)
    expect(product.rating).toBe(0)
    expect(product.salePrice).toBeUndefined()
  })

  it('treats an archived product as not found, although the API answers for it', async () => {
    const d = detail()
    full.mockResolvedValue({ ...d, item: { ...d.item, isActive: false } } as ProductFull)
    await expect(fetchShopProduct('tee')).rejects.toBeInstanceOf(ProductListError)
  })
})
