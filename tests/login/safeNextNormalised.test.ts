import { describe, expect, it } from 'vitest'
import { safeNext } from '../../src/utils/safeNext'

// The URL parser normalises dot segments, so the checked input is not the path that comes out.
describe('safeNext, normalised output', () => {
  it.each([
    '/..//evil.com',
    '/.//evil.com',
    '/a/..//evil.com',
    '/%2e%2e//evil.com',
    '/%2E%2E//evil.com',
    '/a/%2e%2e//evil.com',
    '/a\\..\\/evil.com',
  ])('does not let %s become a protocol-relative path', (raw) => {
    expect(safeNext(raw)).toBe('/shop')
  })

  it('rejects a path over 2000 characters and accepts one inside the limit', () => {
    expect(safeNext('/shop?q=' + 'a'.repeat(5000))).toBe('/shop')
    expect(safeNext('/checkout?q=' + 'a'.repeat(100))).toBe('/checkout?q=' + 'a'.repeat(100))
  })

  it('always returns a single-slash local path', () => {
    for (const raw of ['/..//x', '/%2f/x', '/a//b', '/./x', '/shop/../checkout', '/\\x', '//x']) {
      const result = safeNext(raw)
      expect(result.startsWith('/')).toBe(true)
      expect(result.startsWith('//')).toBe(false)
      expect(result.startsWith('/\\')).toBe(false)
    }
  })

  it('still accepts ordinary paths with dot segments that stay local', () => {
    expect(safeNext('/shop/../checkout?item=p01')).toBe('/checkout?item=p01')
  })
})
