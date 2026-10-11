import { describe, expect, it } from 'vitest'
import { nextQuery, safeNext } from '../../src/utils/safeNext'

describe('safeNext', () => {
  it.each([
    '//evil.com',
    '//evil.com/shop',
    'https://evil.com',
    'http://localhost/shop',
    '/\\evil.com',
    '\\\\evil.com',
    'javascript:alert(1)',
    'shop',
    '',
  ])('rejects %j and falls back to /shop', (raw) => {
    expect(safeNext(raw)).toBe('/shop')
  })

  it('rejects a missing value and honours the fallback', () => {
    expect(safeNext(null)).toBe('/shop')
    expect(safeNext(null, '/')).toBe('/')
  })

  it('accepts same-origin relative paths with their query and hash', () => {
    expect(safeNext('/shop?item=p01')).toBe('/shop?item=p01')
    expect(safeNext('/checkout?item=p01&size=M&qty=2')).toBe('/checkout?item=p01&size=M&qty=2')
    expect(safeNext('/about#how-it-works')).toBe('/about#how-it-works')
  })
})

describe('nextQuery', () => {
  it('re-encodes a safe path and drops an unsafe or missing one', () => {
    expect(nextQuery('/shop?item=p01')).toBe('?next=%2Fshop%3Fitem%3Dp01')
    expect(nextQuery('//evil.com')).toBe('')
    expect(nextQuery(null)).toBe('')
  })
})
