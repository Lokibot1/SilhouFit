import { describe, expect, it } from 'vitest'
import { PRODUCTS } from '../../src/data/products'
import { categoryCounts, colorOptions, payablePrice, queryProducts, type ProductQuery } from '../../src/utils/productQuery'

const BASE: ProductQuery = { category: 'all', q: '', sort: 'featured', page: 1, perPage: 100 }
const run = (changes: Partial<ProductQuery> = {}) => queryProducts(PRODUCTS, { ...BASE, ...changes })
// Empty results must not pass: an `every` over nothing is true.
const allOf = <T,>(items: T[], test: (item: T) => boolean) => items.length > 0 && items.every(test)
const ids = (changes: Partial<ProductQuery>) => run(changes).items.map((p) => p.id)

describe('mock catalogue', () => {
  it('has about two dozen pieces with unique ids and sane fields', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(24)
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length)
    for (const p of PRODUCTS) {
      expect(p.alt.length).toBeGreaterThan(10)
      expect(p.image).toMatch(/^\/images\/gallery\/.+\.webp$/)
      if (p.salePrice !== undefined) expect(p.salePrice).toBeLessThan(p.price)
      expect(p.arReady).toBe(p.badges.includes('AR-ready'))
    }
  })
})

describe('queryProducts category and search', () => {
  it('returns everything for "all" and only that category otherwise', () => {
    expect(run().total).toBe(PRODUCTS.length)
    const jackets = run({ category: 'Outerwear' })
    expect(jackets.total).toBeGreaterThan(0)
    expect(allOf(jackets.items, (p) => p.category === 'Outerwear')).toBe(true)
  })

  it('searches name, boutique and colour case-insensitively and trims the text', () => {
    expect(ids({ q: '  HERITAGE polo ' })).toEqual(['p01'])
    expect(allOf(run({ q: 'lumban' }).items, (p) => p.boutique === 'Lumban Loom')).toBe(true)
    expect(allOf(run({ q: 'rust' }).items, (p) => p.colors.some((c) => c.name === 'Rust'))).toBe(true)
    expect(run({ q: '   ' }).total).toBe(PRODUCTS.length)
    expect(run({ q: 'zzzz' }).total).toBe(0)
  })

  it('combines category and search', () => {
    const result = run({ category: 'Bottoms', q: 'jean' })
    expect(allOf(result.items, (p) => p.category === 'Bottoms' && /jean/i.test(p.name))).toBe(true)
  })
})

describe('queryProducts sorting', () => {
  it('keeps catalogue order for featured', () => {
    expect(ids({ sort: 'featured' })).toEqual(PRODUCTS.map((p) => p.id))
  })

  it('puts the newest first', () => {
    const dates = run({ sort: 'newest' }).items.map((p) => p.addedAt)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('sorts by the price paid, sale price included', () => {
    const asc = run({ sort: 'price-asc' }).items.map(payablePrice)
    expect(asc).toEqual([...asc].sort((a, b) => a - b))
    const desc = run({ sort: 'price-desc' }).items.map(payablePrice)
    expect(desc).toEqual([...desc].sort((a, b) => b - a))
    // p02 lists at 6,490 but sells at 4,990, so it ranks below the 5,290 blazer.
    expect(ids({ sort: 'price-desc' }).indexOf('p19')).toBeLessThan(ids({ sort: 'price-desc' }).indexOf('p02'))
  })

  it('does not mutate the input list', () => {
    const before = PRODUCTS.map((p) => p.id)
    run({ sort: 'price-desc' })
    expect(PRODUCTS.map((p) => p.id)).toEqual(before)
  })
})

describe('queryProducts filters', () => {
  it('bounds the price paid', () => {
    const result = run({ minPrice: 1000, maxPrice: 2000 })
    expect(result.total).toBeGreaterThan(0)
    expect(allOf(result.items, (p) => payablePrice(p) >= 1000 && payablePrice(p) <= 2000)).toBe(true)
    expect(ids({ maxPrice: 1600 })).toContain('p22') // 1,990 list, 1,590 sale
  })

  it('matches any selected colour', () => {
    const result = run({ colors: ['Rust', 'Blush'] })
    expect(allOf(result.items, (p) => p.colors.some((c) => ['Rust', 'Blush'].includes(c.name)))).toBe(true)
    expect(run({ colors: [] }).total).toBe(PRODUCTS.length)
  })

  it('filters by availability: store, online, low stock', () => {
    expect(allOf(run({ availability: ['store'] }).items, (p) => p.channels.includes('store'))).toBe(true)
    expect(allOf(run({ availability: ['online'] }).items, (p) => p.channels.includes('online'))).toBe(true)
    const low = run({ availability: ['low'] }).items
    expect(low.length).toBeGreaterThan(0)
    expect(allOf(low, (p) => p.stock >= 1 && p.stock <= 5)).toBe(true)
    // p24 is listed online but sold out, so it is not available online.
    expect(ids({ availability: ['online'] })).not.toContain('p24')
    expect(ids({ availability: ['store'] })).not.toContain('p24')
    const either = run({ availability: ['store', 'low'] }).total
    expect(either).toBeGreaterThanOrEqual(run({ availability: ['store'] }).total)
  })

  it('keeps only AR-ready pieces when asked', () => {
    expect(allOf(run({ arReady: true }).items, (p) => p.arReady)).toBe(true)
    expect(run({ arReady: false }).total).toBe(PRODUCTS.length)
  })

  it('stacks filters with AND', () => {
    const result = run({ category: 'Outerwear', arReady: true, availability: ['store'] })
    expect(allOf(result.items, (p) => p.category === 'Outerwear' && p.arReady && p.channels.includes('store'))).toBe(true)
  })
})

describe('queryProducts paging', () => {
  it('slices by perPage and reports the page count', () => {
    const first = run({ perPage: 10 })
    expect(first.items).toHaveLength(10)
    expect(first.pageCount).toBe(Math.ceil(PRODUCTS.length / 10))
    const last = run({ perPage: 10, page: first.pageCount })
    expect(last.items).toHaveLength(PRODUCTS.length - 10 * (first.pageCount - 1))
    expect(first.items[0].id).not.toBe(run({ perPage: 10, page: 2 }).items[0].id)
  })

  it('clamps the page into 1..pageCount', () => {
    expect(run({ perPage: 10, page: 0 }).page).toBe(1)
    expect(run({ perPage: 10, page: -3 }).page).toBe(1)
    expect(run({ perPage: 10, page: Number.NaN }).page).toBe(1)
    const high = run({ perPage: 10, page: 99 })
    expect(high.page).toBe(high.pageCount)
    expect(high.items.length).toBeGreaterThan(0)
  })

  it('reports one empty page when nothing matches', () => {
    expect(run({ q: 'zzzz' })).toEqual({ items: [], total: 0, page: 1, pageCount: 1 })
  })
})

describe('categoryCounts and colorOptions', () => {
  it('counts each category and the whole list', () => {
    const counts = categoryCounts(PRODUCTS)
    expect(counts.all).toBe(PRODUCTS.length)
    expect(counts.Tops).toBe(PRODUCTS.filter((p) => p.category === 'Tops').length)
    expect(counts.Tops + counts.Bottoms + counts.Dresses + counts.Outerwear + counts.Knitwear).toBe(counts.all)
  })

  it('lists each colour once', () => {
    const names = colorOptions(PRODUCTS).map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('Indigo')
  })
})
