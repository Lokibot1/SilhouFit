import { describe, expect, it } from 'vitest'
import { MEASUREMENT_KEYS, type Measurements, type ProductVariant } from '../../src/service/fetchProductList'
import type { SizeMeasurement } from '../../src/service/sizeMeasurements'
import { baseMeasurementsFor, buildSizeGuide } from '../../src/utils/sizeGuide'

const none = Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, null])) as Measurements
const m = (values: Partial<Measurements>): Measurements => ({ ...none, ...values })
const variant = (size: string | null, color: string, measurements: Measurements | null = null): ProductVariant => ({
  id: `${size}-${color}`, sku: `${size}-${color}`, name: null, size, color, colorHex: null, price: 1, stock: 1, imageUrl: null, measurements,
})
const base = (category: string, size: string, values: Partial<Measurements>): SizeMeasurement => ({
  id: `${category}-${size}`, category, size, ...none, ...values, isActive: true, createdAt: '', updatedAt: '',
})

const HOODIE_BASE = [
  base('Hoodie', 'S', { chestWidthCm: 52, totalLengthCm: 66, shoulderWidthCm: 46, sleeveLengthCm: 60, neckCm: 37 }),
  base('Hoodie', 'M', { chestWidthCm: 55, totalLengthCm: 70, shoulderWidthCm: 48, sleeveLengthCm: 62, neckCm: 38 }),
  base('Hoodie', 'XL', { chestWidthCm: 61, totalLengthCm: 74 }),
]

describe('buildSizeGuide', () => {
  it('uses the base row per size, with the category columns, for sizes the product really has', () => {
    const guide = buildSizeGuide('Hoodie', [variant('M', 'Black'), variant('S', 'Black')], HOODIE_BASE)
    expect(guide.columns).toEqual(['chestWidthCm', 'totalLengthCm', 'shoulderWidthCm', 'sleeveLengthCm', 'neckCm'])
    expect(guide.rows.map((r) => [r.size, r.source])).toEqual([['S', 'base'], ['M', 'base']])
    expect(guide.rows[1].values.chestWidthCm).toBe(55)
  })

  it('replaces the whole row with the product measurements, not field by field', () => {
    const own = m({ chestWidthCm: 58 })
    const guide = buildSizeGuide('Hoodie', [variant('M', 'Black', own)], HOODIE_BASE)
    expect(guide.rows[0]).toMatchObject({ size: 'M', source: 'product' })
    expect(guide.rows[0].values).toEqual(own)
    expect(guide.rows[0].values.totalLengthCm).toBeNull()
  })

  it('treats a variant whose measurements are all null as having none', () => {
    const guide = buildSizeGuide('Hoodie', [variant('M', 'Black', m({}))], HOODIE_BASE)
    expect(guide.rows[0].source).toBe('base')
  })

  it('marks a size with neither source and invents nothing', () => {
    const guide = buildSizeGuide('Hoodie', [variant('L', 'Black')], HOODIE_BASE)
    expect(guide.rows[0]).toMatchObject({ size: 'L', source: 'none' })
    expect(Object.values(guide.rows[0].values).every((v) => v === null)).toBe(true)
  })

  it('takes the first colour variant of a size that has measurements, and lists the size once', () => {
    const guide = buildSizeGuide(
      'Hoodie',
      [variant('M', 'Black'), variant('M', 'Navy', m({ chestWidthCm: 57 })), variant('M', 'Sand', m({ chestWidthCm: 59 }))],
      HOODIE_BASE,
    )
    expect(guide.rows).toHaveLength(1)
    expect(guide.rows[0].values.chestWidthCm).toBe(57)
  })

  it('adds a column when a size has its own value for a measurement outside the defaults', () => {
    const guide = buildSizeGuide('Hoodie', [variant('M', 'Black', m({ chestWidthCm: 58, hipWidthCm: 56 }))], HOODIE_BASE)
    expect(guide.columns).toEqual(['chestWidthCm', 'hipWidthCm', 'totalLengthCm', 'shoulderWidthCm', 'sleeveLengthCm', 'neckCm'])
  })

  it('does not add a column for a base-only value outside the defaults', () => {
    const guide = buildSizeGuide('Hoodie', [variant('M', 'Black')], [base('Hoodie', 'M', { chestWidthCm: 55, hipWidthCm: 50 })])
    expect(guide.columns).not.toContain('hipWidthCm')
  })

  it('orders sizes smallest first: named, then waist numbers', () => {
    const named = buildSizeGuide('Hoodie', ['XL', 'S', 'XXL', 'XS', 'M'].map((s) => variant(s, 'Black')), [])
    expect(named.rows.map((r) => r.size)).toEqual(['XS', 'S', 'M', 'XL', 'XXL'])
    const waist = buildSizeGuide('Pants', ['34', '30', '28'].map((s) => variant(s, 'Black')), [])
    expect(waist.rows.map((r) => r.size)).toEqual(['28', '30', '34'])
    expect(waist.columns).toEqual(['waistWidthCm', 'hipWidthCm', 'totalLengthCm', 'inseamCm', 'thighCm'])
  })

  it('matches sizes ignoring case and spaces, and skips variants without a size', () => {
    const guide = buildSizeGuide('Hoodie', [variant(' m ', 'Black'), variant(null, 'Black')], HOODIE_BASE)
    expect(guide.rows.map((r) => [r.size, r.source])).toEqual([['m', 'base']])
  })

  it('lists sizes that differ only by case or spacing once, under the first-seen trimmed label', () => {
    const guide = buildSizeGuide('Hoodie', [variant(' m', 'Black'), variant('M', 'Navy', m({ chestWidthCm: 57 })), variant('m ', 'Sand'), variant('S', 'Black')], HOODIE_BASE)
    expect(guide.rows.map((r) => r.size)).toEqual(['S', 'm'])
    expect(guide.rows[1].source).toBe('product')
  })

  it('shows only the neck for headwear', () => {
    const guide = buildSizeGuide('Headwear', [variant('One size', 'Black')], [base('Headwear', 'One size', { neckCm: 58 })])
    expect(guide.columns).toEqual(['neckCm'])
    expect(guide.rows[0]).toMatchObject({ source: 'base' })
  })

  it('has no rows for a product without sized variants', () => {
    expect(buildSizeGuide('Hoodie', [variant(null, 'Black')], HOODIE_BASE).rows).toEqual([])
  })
})

describe('buildSizeGuide with a custom sizing', () => {
  const custom = {
    id: 'cs1', category: 'Hoodie', name: 'Hoodie Custom', createdAt: '',
    sizes: [
      { size: 'S', measurements: { chestWidthCm: 60, totalLengthCm: 72 } },
      { size: 'M', measurements: { chestWidthCm: 63 } },
    ],
  }

  it('reads the sizing instead of the base rows, as this piece', () => {
    const guide = buildSizeGuide('Hoodie', [variant('S', 'Black'), variant('M', 'Black')], HOODIE_BASE, custom)
    expect(guide.rows.map((r) => [r.size, r.source, r.values.chestWidthCm])).toEqual([['S', 'product', 60], ['M', 'product', 63]])
    expect(guide.rows[0].values.neckCm).toBeNull()
  })

  it('gives a size the sizing lacks no values rather than a base row', () => {
    const [row] = buildSizeGuide('Hoodie', [variant('XL', 'Black')], HOODIE_BASE, custom).rows
    expect(row.source).toBe('none')
  })

  it('still prefers a variant\'s own measurements', () => {
    const own = m({ chestWidthCm: 99 })
    expect(buildSizeGuide('Hoodie', [variant('S', 'Black', own)], HOODIE_BASE, custom).rows[0].values.chestWidthCm).toBe(99)
  })
})

describe('baseMeasurementsFor', () => {
  it('copies the numbers of the matching size, ignoring case and spacing, and leaves unset ones out', () => {
    expect(baseMeasurementsFor('Hoodie', ' xl ', HOODIE_BASE)).toEqual({ chestWidthCm: 61, totalLengthCm: 74 })
  })

  it('keeps only the category columns', () => {
    const rows = [base('Pants', 'M', { waistWidthCm: 80, sleeveLengthCm: 60 })]
    expect(baseMeasurementsFor('Pants', 'M', rows)).toEqual({ waistWidthCm: 80 })
  })

  it('is null without a row for the size, or when the row has no number in the category columns', () => {
    expect(baseMeasurementsFor('Hoodie', 'XXL', HOODIE_BASE)).toBeNull()
    expect(baseMeasurementsFor('Hoodie', 'M', [base('Hoodie', 'M', { inseamCm: 70 })])).toBeNull()
  })
})
