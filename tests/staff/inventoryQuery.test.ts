import { describe, expect, it } from 'vitest'
import { readInventoryQuery, withInventoryParams } from '../../src/utils/inventoryQuery'

const read = (search: string) => readInventoryQuery(new URLSearchParams(search))

describe('readInventoryQuery', () => {
  it('uses the defaults for an empty URL', () => {
    expect(read('')).toEqual({ status: 'active', q: '', category: '', gender: '', stock: '', ar: '', sort: 'date', dir: 'desc', page: 1, per: 25 })
  })

  it('reads every parameter', () => {
    expect(read('status=archived&q=tee&category=Tops&gender=female&stock=in&ar=yes&sort=price&dir=asc&page=3&per=50')).toEqual({
      status: 'archived',
      q: 'tee',
      category: 'Tops',
      gender: 'female',
      stock: 'in',
      ar: 'yes',
      sort: 'price',
      dir: 'asc',
      page: 3,
      per: 50,
    })
  })

  it('whitelists the AR Fitting filter', () => {
    expect(read('ar=yes').ar).toBe('yes')
    expect(read('ar=no').ar).toBe('no')
    for (const bad of ['ar=true', 'ar=YES', 'ar=']) expect(read(bad).ar).toBe('')
  })

  it('reads the out of stock filter and the sold-out sizes filter', () => {
    expect(read('stock=out').stock).toBe('out')
    expect(read('stock=sizes').stock).toBe('sizes')
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
    expect(read('category=tops').category).toBe('Tops')
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

describe('withInventoryParams', () => {
  const current = new URLSearchParams('q=tee&page=4&sort=name&dir=asc')

  it('resets the page when the search, a filter or the page size changes', () => {
    for (const changes of [{ q: 'jean' }, { category: 'Tops' }, { gender: 'male' }, { stock: '1' }, { stock: 'sizes' }, { ar: 'yes' }, { status: 'archived' }, { per: '10' }]) {
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
