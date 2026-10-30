import { describe, expect, it } from 'vitest'
import { CATEGORIES, choiceOf, sizesFor, type Product } from '../../src/data/products'
import { sameColour, validColour } from '../../src/hooks/useShopColours'
import { orderSizes, SORT_OPTIONS, shopTitle, toApiParams, type ProductQuery } from '../../src/utils/productQuery'

const BASE: ProductQuery = { category: 'all', q: '', sort: 'newest', page: 1, perPage: 12 }
const api = (changes: Partial<ProductQuery> = {}) => toApiParams({ ...BASE, ...changes })

describe('toApiParams', () => {
  it('maps the filters, paging and the one colour', () => {
    expect(api({ q: ' tee ', category: 'Hoodie', brand: 'Nike', gender: 'male', size: 'M', color: 'Black', minPrice: 0, maxPrice: 900, availability: ['online'], page: 3 })).toEqual({
      search: 'tee',
      category: 'Hoodie',
      brand: 'Nike',
      gender: 'male',
      size: 'M',
      color: 'Black',
      minPrice: 0,
      maxPrice: 900,
      inStockOnly: true,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 3,
      limit: 12,
    })
    expect(api()).toMatchObject({ search: undefined, category: undefined, color: undefined, inStockOnly: undefined, page: 1 })
  })

  it('sends Online as inStockOnly, and never an availability, ar, store or low stock key', () => {
    expect(api({ availability: ['online'] }).inStockOnly).toBe(true)
    for (const availability of [['store'], ['low'], ['store', 'low'], []] as const) expect(api({ availability: [...availability], arReady: true }).inStockOnly).toBeUndefined()
    const params = api({ availability: ['store', 'online', 'low'], arReady: true })
    for (const key of ['availability', 'avail', 'ar', 'arReady']) expect(params).not.toHaveProperty(key)
  })

  it('sends isArReady=true when AR-ready only is on, and nothing otherwise', () => {
    expect(api({ arReady: true }).isArReady).toBe(true)
    expect(api({ arReady: false }).isArReady).toBeUndefined()
    expect(api().isArReady).toBeUndefined()
  })

  it('sends date and name sorts, and newest first for Featured and the price sorts, never basePrice', () => {
    expect(api({ sort: 'newest' })).toMatchObject({ sortBy: 'createdAt', sortOrder: 'desc' })
    expect(api({ sort: 'name-asc' })).toMatchObject({ sortBy: 'name', sortOrder: 'asc' })
    expect(api({ sort: 'name-desc' })).toMatchObject({ sortBy: 'name', sortOrder: 'desc' })
    for (const sort of ['featured', 'price-asc', 'price-desc'] as const) expect(api({ sort })).toMatchObject({ sortBy: 'createdAt', sortOrder: 'desc' })
    expect(SORT_OPTIONS.map((o) => o.label)).toEqual(['Featured', 'Newest', 'Price: low to high', 'Price: high to low', 'Name: A to Z', 'Name: Z to A'])
  })
})

describe('shopTitle and CATEGORIES', () => {
  it('titles the page with any category in the URL, or All pieces', () => {
    expect(shopTitle(new URLSearchParams('category=Hoodie'))).toBe('Hoodie')
    expect(shopTitle(new URLSearchParams('category=Hats'))).toBe('Hats')
    expect(shopTitle(new URLSearchParams(''))).toBe('All pieces')
  })

  it('has exactly the four categories', () => {
    expect([...CATEGORIES]).toEqual(['Hoodie', 'Pants', 'Headwear', 'Shorts'])
  })
})

describe('colours of the filter dialog', () => {
  const options = [
    { name: 'Black', hex: '#111' },
    { name: 'Navy', hex: null },
  ]

  it('matches colours ignoring case', () => {
    expect(sameColour('navy', 'Navy')).toBe(true)
    expect(sameColour('Navy', 'Sand')).toBe(false)
  })

  it('keeps a URL colour that a product has, spelled as the product spells it, and drops an unknown one', () => {
    expect(validColour('black', options)).toBe('Black')
    expect(validColour('Chartreuse', options)).toBeUndefined()
    expect(validColour(undefined, options)).toBeUndefined()
    expect(validColour('Black', [])).toBeUndefined()
  })
})

describe('sizes, price and stock of a product from the API', () => {
  const v = (size: string, color: string, price: number, stock: number) => ({
    id: `${size}-${color}`, sku: `${size}-${color}`, name: null, size, color, colorHex: null, price, stock, imageUrl: null, measurements: null,
  })
  const piece: Product = {
    id: 'a', name: 'Shirt', category: 'Hats', boutique: '', price: 1000, priceMax: 1400, image: '', alt: '',
    colors: [{ name: 'Black', hex: '' }, { name: 'Navy', hex: '' }],
    badges: [], stock: 9, channels: [], arReady: false, addedAt: '', rating: 0, reviews: 0,
    variants: [v('S', 'Black', 1000, 4), v('M', 'Black', 1400, 0), v('M', 'Navy', 1200, 5)],
  }

  it('takes sizes from the variants, not from the category', () => {
    expect(sizesFor(piece)).toEqual(['S', 'M'])
  })

  it('answers for the whole piece until size and colour are chosen, then for that variant', () => {
    expect(choiceOf(piece, '', '')).toMatchObject({ stock: 9, price: 1000, variant: undefined })
    expect(choiceOf(piece, 'M', 'navy')).toMatchObject({ stock: 5, price: 1200, variant: { id: 'M-Navy' } })
    expect(choiceOf(piece, 'M', 'Black')).toMatchObject({ stock: 0, price: 1400 })
  })

  it('counts a size and colour no variant has as sold out', () => {
    expect(choiceOf(piece, 'S', 'Navy')).toMatchObject({ stock: 0, variant: undefined })
  })
})

describe('orderSizes', () => {
  it('puts XS to XXL first, then numbers ascending, then the rest alphabetically, and One size last', () => {
    expect(orderSizes(['One size', 'Wide', 'XL', '32', 'S', '4', 'Narrow', 'XXL', 'M', 'xs', '30.5', 'L'])).toEqual([
      'xs', 'S', 'M', 'L', 'XL', 'XXL', '4', '30.5', '32', 'Narrow', 'Wide', 'One size',
    ])
  })

  it('does not change the list it is given', () => {
    const sizes = ['M', 'S']
    orderSizes(sizes)
    expect(sizes).toEqual(['M', 'S'])
  })
})
