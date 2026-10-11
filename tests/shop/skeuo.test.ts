import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../shared/contrast'

// The theme tokens themselves are checked in the browser (shop.spec.ts); this guards the helper.
describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
    expect(contrastRatio('rgb(20, 23, 28)', '#f3f4f6')).toBeGreaterThan(15)
  })

  it('is symmetric and rejects colours it cannot read', () => {
    expect(contrastRatio('#14171c', '#f3f4f6')).toBe(contrastRatio('#f3f4f6', '#14171c'))
    expect(() => contrastRatio('red', '#fff')).toThrow()
  })
})
