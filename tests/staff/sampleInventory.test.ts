import { beforeEach, describe, expect, it } from 'vitest'
import { PRODUCTS } from '../../src/data/products'
import type { NewProductInput } from '../../src/service/productAdmin'
import { resetSampleInventory, sampleCreateProduct, sampleProductDetail, sampleProductList, sampleRestockVariants, sampleSetArchived, sampleSetArReady } from '../../src/service/sampleInventory'

const now = { delayMs: 0 }

beforeEach(() => resetSampleInventory())

describe('sampleProductList', () => {
  it('pages the catalogue with correct totals and maps its fields', async () => {
    const first = await sampleProductList({ limit: 10, page: 1, sortBy: 'name', sortOrder: 'asc' }, now)
    expect(first.meta).toMatchObject({ total: PRODUCTS.length, totalPages: Math.ceil(PRODUCTS.length / 10), hasNextPage: true, hasPreviousPage: false })
    expect(first.data).toHaveLength(10)
    const names = first.data.map((p) => p.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    const p01 = (await sampleProductList({ search: 'p01' }, now)).data[0]
    expect(p01).toMatchObject({ id: 'p01', brand: 'Ayala Atelier', totalStock: 24, createdAt: '2026-03-02', minPrice: 1890, isActive: true })
    expect(p01.primaryImage?.altText).toBe('White polo shirt on a wooden hanger')
  })
})

describe('AR Fitting', () => {
  it('filters the list by AR readiness', async () => {
    const yes = await sampleProductList({ arReady: true, limit: 100 }, now)
    const no = await sampleProductList({ arReady: false, limit: 100 }, now)
    expect(yes.data.length + no.data.length).toBe(PRODUCTS.length)
    expect(yes.data.every((p) => p.arReady === true)).toBe(true)
    expect(no.data.every((p) => p.arReady === false)).toBe(true)
    expect(yes.data.map((p) => p.id)).toContain('p02')
  })

  it('turns it on and off for a product, in the list and the filter', async () => {
    await sampleSetArReady('p01', true, now)
    expect((await sampleProductList({ search: 'p01' }, now)).data[0].arReady).toBe(true)
    expect((await sampleProductList({ arReady: true, limit: 100 }, now)).data.map((p) => p.id)).toContain('p01')
    await sampleSetArReady('p01', false, now)
    expect((await sampleProductList({ arReady: true, limit: 100 }, now)).data.map((p) => p.id)).not.toContain('p01')
    await expect(sampleSetArReady('nope', true, now)).rejects.toMatchObject({ kind: 'not-found' })
  })

  it('does not change the shared mock catalogue', async () => {
    await sampleSetArReady('p01', true, now)
    expect(PRODUCTS.find((p) => p.id === 'p01')!.arReady).toBe(false)
  })
})

describe('sampleProductDetail', () => {
  it('splits a product stock across its size and colour variants without losing a unit', async () => {
    for (const product of PRODUCTS) {
      const { variants } = await sampleProductDetail(product.id, now)
      expect(variants.reduce((sum, v) => sum + v.stock, 0)).toBe(product.stock)
    }
  })

  it('rejects an unknown product as not found', async () => {
    await expect(sampleProductDetail('nope', now)).rejects.toMatchObject({ kind: 'not-found' })
  })
})

describe('sample restock', () => {
  it('sets variants to exact numbers, so the product total, size counts and filters follow', async () => {
    const before = await sampleProductList({ search: 'p24' }, now)
    expect(before.data[0]).toMatchObject({ totalStock: 0, isActive: true })
    expect(before.data[0].outOfStockVariants).toBe(before.data[0].variantCount)
    expect((await sampleProductList({ outOfStockOnly: true }, now)).data.map((p) => p.id)).toEqual(['p24'])

    const { variants } = await sampleProductDetail('p24', now)
    const updated = await sampleRestockVariants('p24', [{ variantId: variants[0].id, stock: 7 }, { variantId: variants[1].id, stock: 3 }], now)
    expect(updated.slice(0, 2).map((v) => v.stock)).toEqual([7, 3])

    const after = (await sampleProductList({ search: 'p24' }, now)).data[0]
    expect(after).toMatchObject({ totalStock: 10, outOfStockVariants: variants.length - 2 })
    expect((await sampleProductList({ outOfStockOnly: true }, now)).data).toHaveLength(0)
    expect((await sampleProductList({ inStockOnly: true, limit: 100 }, now)).data.map((p) => p.id)).toContain('p24')
    // Setting a number again replaces it; it does not add.
    await sampleRestockVariants('p24', [{ variantId: variants[0].id, stock: 7 }], now)
    expect((await sampleProductList({ search: 'p24' }, now)).data[0].totalStock).toBe(10)
  })

  it('lists products with a sold-out size, fully sold-out ones included', async () => {
    const ids = (await sampleProductList({ sizesOutOnly: true, limit: 100 }, now)).data.map((p) => p.id)
    expect(ids).toContain('p24')
    expect(ids).toContain('p11')
    expect(ids).not.toContain('p08')
    const { variants } = await sampleProductDetail('p11', now)
    await sampleRestockVariants('p11', variants.map((v) => ({ variantId: v.id, stock: 5 })), now)
    expect((await sampleProductList({ sizesOutOnly: true, limit: 100 }, now)).data.map((p) => p.id)).not.toContain('p11')
  })

  it('rejects a bad number or an unknown variant and changes nothing', async () => {
    const { variants } = await sampleProductDetail('p08', now)
    const first = { variantId: variants[0].id, stock: 50 }
    for (const stock of [-1, 100000, 1.5, Number.NaN]) {
      await expect(sampleRestockVariants('p08', [first, { variantId: variants[1].id, stock }], now)).rejects.toMatchObject({ kind: 'validation' })
    }
    await expect(sampleRestockVariants('p08', [first, { variantId: 'nope', stock: 1 }], now)).rejects.toMatchObject({ kind: 'not-found' })
    await expect(sampleRestockVariants('nope', [first], now)).rejects.toMatchObject({ kind: 'not-found' })
    expect((await sampleProductDetail('p08', now)).variants).toEqual(variants)
  })

  it('changes nothing when the request is aborted', async () => {
    const { variants } = await sampleProductDetail('p24', now)
    const controller = new AbortController()
    const pending = sampleRestockVariants('p24', [{ variantId: variants[0].id, stock: 9 }], { signal: controller.signal, delayMs: 50 })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect((await sampleProductList({ search: 'p24' }, now)).data[0].totalStock).toBe(0)
  })
})

describe('sample archive', () => {
  it('moves a product between the Active and Archived lists without deleting it', async () => {
    expect((await sampleProductList({ status: 'archived' }, now)).meta.total).toBe(0)
    await sampleSetArchived('p02', true, now)

    const active = await sampleProductList({ limit: 100 }, now)
    expect(active.meta.total).toBe(PRODUCTS.length - 1)
    expect(active.data.map((p) => p.id)).not.toContain('p02')
    const archived = await sampleProductList({ status: 'archived' }, now)
    expect(archived.data).toHaveLength(1)
    expect(archived.data[0]).toMatchObject({ id: 'p02', isActive: false, totalStock: 4 })
    // An archived product still opens and keeps its stock.
    expect((await sampleProductDetail('p02', now)).variants.reduce((sum, v) => sum + v.stock, 0)).toBe(4)

    await sampleSetArchived('p02', false, now)
    expect((await sampleProductList({ status: 'archived' }, now)).meta.total).toBe(0)
    expect((await sampleProductList({ limit: 100 }, now)).meta.total).toBe(PRODUCTS.length)
  })

  it('applies search and filters inside the archived list, and rejects an unknown product', async () => {
    await sampleSetArchived('p02', true, now)
    await sampleSetArchived('p08', true, now)
    expect((await sampleProductList({ status: 'archived', search: 'blazer' }, now)).data.map((p) => p.id)).toEqual(['p02'])
    expect((await sampleProductList({ status: 'archived', category: 'Tops' }, now)).data.map((p) => p.id)).toEqual(['p08'])
    await expect(sampleSetArchived('nope', true, now)).rejects.toMatchObject({ kind: 'not-found' })
  })

  it('is put back by resetSampleInventory', async () => {
    await sampleSetArchived('p02', true, now)
    resetSampleInventory()
    expect((await sampleProductList({ status: 'archived' }, now)).meta.total).toBe(0)
  })

  it('does not archive when the request is aborted', async () => {
    const controller = new AbortController()
    const pending = sampleSetArchived('p02', true, { signal: controller.signal, delayMs: 50 })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect((await sampleProductList({ status: 'archived' }, now)).meta.total).toBe(0)
  })
})

describe('sampleCreateProduct', () => {
  const input = (sku = 'NEW-1', over: Partial<NewProductInput> = {}): NewProductInput => ({
    name: 'Brand New Tee',
    category: 'Tops',
    basePrice: 500,
    arReady: false,
    images: [{ url: 'blob:x', altText: 'Brand New Tee', isPrimary: true }],
    variants: [
      { sku, size: 'S', color: 'Red', colorHex: '#ff0000', stock: 0 },
      { sku: `${sku}-M`, size: 'M', color: 'Red', colorHex: '#ff0000', stock: 5, price: 600 },
    ],
    ...over,
  })

  it('keeps arReady on the new product and leaves seeded ones as they are', async () => {
    const { id } = await sampleCreateProduct(input('AR-1', { arReady: true }), now)
    const list = (await sampleProductList({ sortBy: 'createdAt', sortOrder: 'desc', limit: 100 }, now)).data
    expect(list.find((p) => p.id === id)?.arReady).toBe(true)
    expect(list.find((p) => p.id === 'p01')?.arReady).toBe(PRODUCTS.find((p) => p.id === 'p01')!.arReady)
  })

  it('lists the new product first, with its image, variants and price range', async () => {
    const { id } = await sampleCreateProduct(input(), now)
    expect(id).toBe('p-new-1')
    const first = (await sampleProductList({ sortBy: 'createdAt', sortOrder: 'desc' }, now)).data[0]
    expect(first).toMatchObject({ id, name: 'Brand New Tee', totalStock: 5, minPrice: 500, maxPrice: 600, variantCount: 2, outOfStockVariants: 1, brand: null })
    expect(first.primaryImage).toEqual({ url: 'blob:x', altText: 'Brand New Tee' })
    expect((await sampleProductDetail(id, now)).variants.map((v) => v.sku)).toEqual(['NEW-1', 'NEW-1-M'])
  })

  it('refuses a SKU already in the catalogue, or twice in the product, and adds nothing', async () => {
    const before = (await sampleProductList({}, now)).meta.total
    await expect(sampleCreateProduct(input('P01-S-WHITE'), now)).rejects.toMatchObject({ kind: 'conflict', detail: expect.stringContaining('P01-S-WHITE') })
    const twice = input('DUP', { variants: [input().variants[0], input().variants[0]] })
    await expect(sampleCreateProduct(twice, now)).rejects.toMatchObject({ kind: 'validation' })
    expect((await sampleProductList({}, now)).meta.total).toBe(before)
  })

  it('can be restocked and archived like the rest', async () => {
    const { id } = await sampleCreateProduct(input(), now)
    const variant = (await sampleProductDetail(id, now)).variants[0]
    await sampleRestockVariants(id, [{ variantId: variant.id, stock: 9 }], now)
    expect((await sampleProductList({ search: id }, now)).data[0].totalStock).toBe(14)
    await sampleSetArchived(id, true, now)
    expect((await sampleProductList({ status: 'archived' }, now)).data.map((p) => p.id)).toEqual([id])
  })

  it('goes away when the sample catalogue is reset', async () => {
    await sampleCreateProduct(input(), now)
    resetSampleInventory()
    expect((await sampleProductList({}, now)).meta.total).toBe(PRODUCTS.length)
  })
})
