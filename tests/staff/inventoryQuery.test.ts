import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  CLEAR_FILTERS,
  priceRangeInvalid,
  readInventoryQuery,
  SORT_COLUMN,
  withInventoryParams,
} from '../../src/utils/inventoryQuery'

const read = (search: string) => readInventoryQuery(new URLSearchParams(search))

describe('readInventoryQuery', () => {
  it('uses the defaults for an empty URL', () => {
    expect(read('')).toEqual({ status: 'active', q: '', category: '', gender: '', brand: '', size: '', color: '', stock: '', ar: '', sort: 'date', dir: 'desc', page: 1, per: 25 })
  })

  it('reads every parameter', () => {
    expect(read('status=archived&q=tee&category=Hoodie&gender=female&stock=in&ar=yes&sort=price&dir=desc&page=3&per=50')).toEqual({
      status: 'archived',
      q: 'tee',
      category: 'Hoodie',
      gender: 'female',
      brand: '',
      size: '',
      color: '',
      stock: 'in',
      ar: 'yes',
      sort: 'price',
      dir: 'desc',
      page: 3,
      per: 50,
    })
  })

  it('whitelists the gender filter', () => {
    expect(read('gender=female').gender).toBe('female')
    for (const bad of ['gender=robot', 'gender=FEMALE', 'gender=']) expect(read(bad).gender).toBe('')
  })

  it('whitelists the AR Fitting filter', () => {
    expect(read('ar=yes').ar).toBe('yes')
    expect(read('ar=no').ar).toBe('no')
    for (const bad of ['ar=true', 'ar=YES', 'ar=']) expect(read(bad).ar).toBe('')
  })

  it('reads the in stock, out of stock and sold-out sizes filters', () => {
    for (const stock of ['in', 'out', 'sizes']) expect(read(`stock=${stock}`).stock).toBe(stock)
    expect(read('stock=IN').stock).toBe('')
  })

  it('lists active products unless the URL says archived, and ignores any other status', () => {
    expect(read('').status).toBe('active')
    expect(read('status=archived').status).toBe('archived')
    expect(read('status=active').status).toBe('active')
    expect(read('status=deleted').status).toBe('active')
  })

  it('falls back to the default for values off the whitelist', () => {
    const query = read('category=Shoes&gender=robot&stock=1&sort=stock&dir=up&per=500')
    expect(query).toMatchObject({ category: '', gender: '', stock: '', sort: 'date', dir: 'desc', per: 25 })
  })

  it('matches the category case-insensitively and returns the catalogue spelling', () => {
    expect(read('category=hoodie').category).toBe('Hoodie')
  })

  it('starts a name sort A to Z and a price sort cheapest first unless the URL says otherwise', () => {
    expect(read('sort=name').dir).toBe('asc')
    expect(read('sort=price').dir).toBe('asc')
    expect(read('sort=name&dir=desc').dir).toBe('desc')
  })

  it('clamps the page to a whole number of 1 or more', () => {
    for (const page of ['0', '-4', 'abc', '', 'NaN']) expect(read(`page=${page}`).page).toBe(1)
    expect(read('page=2.9').page).toBe(2)
  })

  it('trims the search and caps its length', () => {
    expect(read('q=%20%20tee%20').q).toBe('tee')
    expect(read(`q=${'a'.repeat(300)}`).q).toHaveLength(100)
  })
})

describe('brand, size, colour and price filters', () => {
  it('reads them, trimmed and capped at 50 characters', () => {
    expect(read('brand=%20Nike%20&size=M&color=Black&minPrice=100&maxPrice=2500.5')).toMatchObject({
      brand: 'Nike',
      size: 'M',
      color: 'Black',
      minPrice: 100,
      maxPrice: 2500.5,
    })
    expect(read(`brand=${'a'.repeat(80)}`).brand).toHaveLength(50)
    expect(read('')).toMatchObject({ brand: '', size: '', color: '', minPrice: undefined, maxPrice: undefined })
  })

  it('ignores prices that are negative, not numbers or have too many decimals, but keeps 0', () => {
    for (const bad of ['-5', 'abc', '', '1e3', '1.234', 'NaN']) expect(read(`minPrice=${bad}`).minPrice).toBeUndefined()
    expect(read('minPrice=0').minPrice).toBe(0)
  })

  it('flags a minimum above the maximum, and nothing else', () => {
    expect(priceRangeInvalid(read('minPrice=500&maxPrice=100'))).toBe(true)
    expect(priceRangeInvalid(read('minPrice=100&maxPrice=100'))).toBe(false)
    expect(priceRangeInvalid(read('minPrice=100'))).toBe(false)
  })

  it('counts the active filters, the price bounds as one and the search not at all', () => {
    expect(activeFilterCount(read('q=tee'))).toBe(0)
    expect(activeFilterCount(read('category=Hoodie&brand=Nike&size=M&color=Black&minPrice=1&maxPrice=9&stock=in'))).toBe(6)
    expect(activeFilterCount(read('gender=male&ar=no&stock=out'))).toBe(3)
  })

  it('has a clear-all that removes the search and every filter key and resets the page', () => {
    const next = withInventoryParams(new URLSearchParams('q=tee&brand=Nike&minPrice=1&page=3&sort=name'), CLEAR_FILTERS)
    expect(next.toString()).toBe('sort=name')
  })

  it('resets the page when any of them changes', () => {
    const current = new URLSearchParams('page=4')
    for (const key of ['brand', 'size', 'color', 'minPrice', 'maxPrice']) expect(withInventoryParams(current, { [key]: 'x' }).has('page')).toBe(false)
  })
})

describe('price sort', () => {
  it('stays selectable in the URL', () => {
    expect(read('sort=price&dir=desc')).toMatchObject({ sort: 'price', dir: 'desc' })
  })

  it('reaches the API as sortBy=price, never basePrice', () => {
    expect(Object.values(SORT_COLUMN)).not.toContain('basePrice')
    expect(SORT_COLUMN).toEqual({ date: 'createdAt', name: 'name', price: 'price' })
  })
})

describe('withInventoryParams', () => {
  const current = new URLSearchParams('q=tee&page=4&sort=name&dir=asc')

  it('resets the page when the search, a filter or the page size changes', () => {
    for (const changes of [{ q: 'jean' }, { category: 'Hoodie' }, { gender: 'male' }, { stock: 'in' }, { stock: 'sizes' }, { ar: 'yes' }, { status: 'archived' }, { per: '10' }]) {
      expect(withInventoryParams(current, changes).has('page')).toBe(false)
    }
  })

  it('keeps the page when sorting or paging', () => {
    expect(withInventoryParams(current, { sort: 'price', dir: 'desc' }).get('page')).toBe('4')
    expect(withInventoryParams(current, { page: '5' }).get('page')).toBe('5')
  })

  it('drops the status key to go back to active', () => {
    expect(withInventoryParams(new URLSearchParams('status=archived&page=2'), { status: '' }).toString()).toBe('')
  })

  it('removes a key set to an empty value and leaves the others', () => {
    const next = withInventoryParams(current, { q: '' })
    expect(next.has('q')).toBe(false)
    expect(next.get('sort')).toBe('name')
  })

  it('does not change the URL it was given', () => {
    withInventoryParams(current, { q: 'x' })
    expect(current.get('q')).toBe('tee')
  })
})
