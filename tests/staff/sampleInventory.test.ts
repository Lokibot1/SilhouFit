import { beforeEach, describe, expect, it } from 'vitest'
import { PRODUCTS } from '../../src/data/products'
import type { NewProductInput } from '../../src/service/productAdmin'
import {
  resetSampleInventory,
  sampleAddVariant,
  sampleCreateProduct,
  sampleDeleteProduct,
  sampleDeleteVariant,
  sampleProductDetail,
  sampleProductList,
  sampleRestockVariants,
  sampleSetArchived,
  sampleSetArReady,
  sampleUpdateProduct,
  sampleUpdateVariant,
} from '../../src/service/sampleInventory'

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

describe('managing products and variants', () => {
  const variantsOf = async (id: string) => (await sampleProductDetail(id, now)).variants

  it('deletes a product for good, leaving the shared catalogue alone', async () => {
    await sampleDeleteProduct('p01', now)
    expect((await sampleProductList({ search: 'p01' }, now)).data).toEqual([])
    await expect(sampleProductDetail('p01', now)).rejects.toMatchObject({ kind: 'not-found' })
    await expect(sampleDeleteProduct('p01', now)).rejects.toMatchObject({ kind: 'not-found' })
    expect(PRODUCTS.find((p) => p.id === 'p01')).toBeDefined()
    resetSampleInventory()
    expect((await sampleProductList({ search: 'p01' }, now)).data).toHaveLength(1)
  })

  it('adds a variant with an auto SKU that is bumped -2, -3 when taken', async () => {
    const first = await sampleAddVariant('p01', { size: 'XXL', color: 'Teal', colorHex: '#008080', price: 100, stock: 2 }, now)
    expect(first).toMatchObject({ sku: 'P01-XXL-TEAL', size: 'XXL', color: 'Teal', colorHex: '#008080', price: 100, stock: 2, measurements: null })
    const second = await sampleAddVariant('p01', { size: 'XXL', color: 'Teal', colorHex: '#008080', price: 100 }, now)
    const third = await sampleAddVariant('p01', { size: 'XXL', color: 'Teal', colorHex: '#008080', price: 100 }, now)
    expect([second.sku, third.sku]).toEqual(['P01-XXL-TEAL-2', 'P01-XXL-TEAL-3'])
    expect(second.stock).toBe(0)
    expect((await sampleProductList({ search: 'p01' }, now)).data[0].variantCount).toBe((await variantsOf('p01')).length)
  })

  it('refuses a taken explicit SKU, a variant with nothing to tell it apart, a colour without a hex and a missing price', async () => {
    await expect(sampleAddVariant('p01', { sku: 'p01-s-white', size: 'S', price: 1 }, now)).rejects.toMatchObject({ kind: 'conflict', detail: 'SKU p01-s-white is already in use' })
    await expect(sampleAddVariant('p01', { price: 1 }, now)).rejects.toMatchObject({ kind: 'validation' })
    await expect(sampleAddVariant('p01', { color: 'Teal', price: 1 }, now)).rejects.toMatchObject({ kind: 'validation', detail: expect.stringContaining('colorHex') })
    await expect(sampleAddVariant('p01', { size: 'S' } as never, now)).rejects.toMatchObject({ kind: 'validation' })
    await expect(sampleAddVariant('nope', { size: 'S', price: 1 }, now)).rejects.toMatchObject({ kind: 'not-found' })
  })

  it('updates only what the patch names, and null clears', async () => {
    const [before] = await variantsOf('p01')
    const priced = await sampleUpdateVariant('p01', before.id, { price: 777 }, now)
    expect(priced).toMatchObject({ price: 777, sku: before.sku, stock: before.stock, color: before.color })
    const measured = await sampleUpdateVariant('p01', before.id, { measurements: { chestWidthCm: 52 } }, now)
    expect(measured.measurements).toMatchObject({ chestWidthCm: 52, neckCm: null })
    const cleared = await sampleUpdateVariant('p01', before.id, { measurements: { chestWidthCm: null } }, now)
    expect(cleared.measurements?.chestWidthCm).toBeNull()
    const noColour = await sampleUpdateVariant('p01', before.id, { color: null }, now)
    expect(noColour).toMatchObject({ color: null, colorHex: null })
  })

  it('re-checks the merged variant: SKU clash, colour needs a hex, something to tell it apart', async () => {
    const [a, b] = await variantsOf('p01')
    await expect(sampleUpdateVariant('p01', a.id, { sku: b.sku }, now)).rejects.toMatchObject({ kind: 'conflict', detail: expect.stringContaining(b.sku) })
    await expect(sampleUpdateVariant('p01', a.id, { sku: a.sku }, now)).resolves.toBeDefined()
    await expect(sampleUpdateVariant('p01', a.id, { color: 'Teal' }, now)).resolves.toBeDefined()
    const [only] = await variantsOf('p01')
    await expect(sampleUpdateVariant('p01', only.id, { size: null, color: null, name: null }, now)).rejects.toMatchObject({ kind: 'validation' })
    await expect(sampleUpdateVariant('p01', 'nope', { price: 1 }, now)).rejects.toMatchObject({ kind: 'not-found' })
  })

  it('deletes a variant, and a product left with none has no price or stock', async () => {
    const variants = await variantsOf('p01')
    await sampleDeleteVariant('p01', variants[0].id, now)
    expect(await variantsOf('p01')).toHaveLength(variants.length - 1)
    await expect(sampleDeleteVariant('p01', variants[0].id, now)).rejects.toMatchObject({ kind: 'not-found' })
    for (const v of variants.slice(1)) await sampleDeleteVariant('p01', v.id, now)
    expect((await sampleProductList({ search: 'p01' }, now)).data[0]).toMatchObject({ minPrice: 0, maxPrice: 0, totalStock: 0, variantCount: 0 })
  })

  it('edits a product replacing its images, without touching the shared catalogue', async () => {
    const before = PRODUCTS.find((p) => p.id === 'p01')!.name
    await sampleUpdateProduct(
      'p01',
      {
        name: 'Renamed',
        brand: 'New Boutique',
        description: 'Fresh',
        gender: 'unisex',
        images: [
          { url: 'https://x/b.jpg', altText: 'Back', displayOrder: 0, isPrimary: true },
          { url: 'https://x/c.jpg', altText: 'Side', displayOrder: 1, isPrimary: false },
        ],
      },
      now,
    )
    const item = (await sampleProductList({ search: 'p01' }, now)).data[0]
    expect(item).toMatchObject({ name: 'Renamed', brand: 'New Boutique', primaryImage: { url: 'https://x/b.jpg', altText: 'Back' } })
    const { product } = await sampleProductDetail('p01', now)
    expect(product).toMatchObject({ description: 'Fresh', gender: 'unisex', brand: 'New Boutique' })
    expect(product.images.map((i) => i.url)).toEqual(['https://x/b.jpg', 'https://x/c.jpg'])
    expect(PRODUCTS.find((p) => p.id === 'p01')!.name).toBe(before)
    await expect(sampleUpdateProduct('nope', { name: 'x' }, now)).rejects.toMatchObject({ kind: 'not-found' })
  })

  it('puts everything back on reset', async () => {
    await sampleDeleteVariant('p01', (await variantsOf('p01'))[0].id, now)
    await sampleUpdateProduct('p01', { name: 'Renamed' }, now)
    resetSampleInventory()
    expect((await sampleProductList({ search: 'p01' }, now)).data[0].name).toBe(PRODUCTS.find((p) => p.id === 'p01')!.name)
  })
})
