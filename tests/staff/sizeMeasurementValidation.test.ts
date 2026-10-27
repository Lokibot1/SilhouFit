import { describe, expect, it } from 'vitest'
import { CATEGORIES } from '../../src/data/products'
import type { SizeMeasurement } from '../../src/service/sizeMeasurements'
import {
  buildSizeInput,
  buildSizePatch,
  compareSizes,
  COLUMNS_BY_CATEGORY,
  filterSizeLabel,
  sizeFormValues,
  validateSizeForm,
} from '../../src/utils/sizeMeasurementValidation'

const row: SizeMeasurement = {
  id: 'r1',
  category: 'Hoodie',
  size: 'M',
  chestWidthCm: 55,
  waistWidthCm: null,
  hipWidthCm: null,
  totalLengthCm: 70,
  inseamCm: null,
  shoulderWidthCm: null,
  sleeveLengthCm: null,
  neckCm: null,
  thighCm: null,
  isActive: true,
  createdAt: '',
  updatedAt: '',
}

const filled = (size: string, measurements: Record<string, string>, category = 'Hoodie') => {
  const values = sizeFormValues(category)
  return { ...values, size, measurements: { ...values.measurements, ...measurements } }
}

describe('validateSizeForm', () => {
  it('accepts a size with one measurement', () => {
    expect(validateSizeForm(filled('M', { chestWidthCm: '55' }))).toEqual({})
  })

  it('needs a size and at least one measurement', () => {
    const errors = validateSizeForm(filled('  ', {}))
    expect(errors.size).toMatch(/Enter a size/)
    expect(errors.measurements).toBe('Enter at least one measurement.')
  })

  it('caps the size at 20 characters', () => {
    expect(validateSizeForm(filled('x'.repeat(21), { chestWidthCm: '55' })).size).toMatch(/20 characters/)
    expect(filterSizeLabel('x'.repeat(30))).toHaveLength(20)
  })

  it('checks each range in cm', () => {
    const cases: [string, string, boolean][] = [
      ['chestWidthCm', '4', false],
      ['chestWidthCm', '5', true],
      ['chestWidthCm', '250', true],
      ['chestWidthCm', '251', false],
      ['totalLengthCm', '9', false],
      ['totalLengthCm', '300', true],
      ['inseamCm', '201', false],
      ['inseamCm', '200', true],
      ['shoulderWidthCm', '151', false],
      ['sleeveLengthCm', '150', true],
      ['thighCm', '4', false],
      ['neckCm', '101', false],
      ['neckCm', '100', true],
    ]
    for (const [key, text, ok] of cases) {
      const errors = validateSizeForm(filled('M', { [key]: text }))
      expect(errors[`m:${key}`] === undefined, `${key} ${text}`).toBe(ok)
    }
  })

  it('rejects a category that is not one of the four', () => {
    expect(validateSizeForm({ ...filled('M', { chestWidthCm: '55' }), category: 'Dresses' }).category).toBeDefined()
  })
})

describe('buildSizeInput and buildSizePatch', () => {
  it('sends the category, the trimmed size and only the filled measurements as numbers', () => {
    expect(buildSizeInput(filled('  XL ', { chestWidthCm: '58.5', neckCm: '40' }))).toEqual({ category: 'Hoodie', size: 'XL', chestWidthCm: 58.5, neckCm: 40 })
  })

  it('patches only the changes, with null for a cleared measurement', () => {
    const values = sizeFormValues('Hoodie', row)
    expect(buildSizePatch(values, row)).toEqual({})
    const changed = { ...values, size: 'L', measurements: { ...values.measurements, chestWidthCm: '', neckCm: '38' } }
    expect(buildSizePatch(changed, row)).toEqual({ size: 'L', chestWidthCm: null, neckCm: 38 })
  })
})

describe('compareSizes and COLUMNS_BY_CATEGORY', () => {
  it('orders named sizes, then waist numbers, then the rest', () => {
    expect(['One size', '34', 'XL', 'S', '28', 'XS', 'M'].sort(compareSizes)).toEqual(['XS', 'S', 'M', 'XL', '28', '34', 'One size'])
  })

  it('has columns for exactly the four categories', () => {
    expect(Object.keys(COLUMNS_BY_CATEGORY).sort()).toEqual([...CATEGORIES].sort())
    expect(COLUMNS_BY_CATEGORY.Headwear).toEqual(['neckCm'])
  })
})
