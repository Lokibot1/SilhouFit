import { describe, expect, it } from 'vitest'
import {
  buildProductInput,
  buildSkus,
  checkImageFile,
  filterColorName,
  filterPrice,
  filterSize,
  filterSku,
  filterStock,
  filterText,
  findDuplicateSkus,
  HEX_COLOR,
  parsePrice,
  validateProductForm,
  type ProductFormValues,
} from '../../src/utils/productValidation'

const image = { id: 'i1', file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }), preview: 'blob:a', alt: null }
const valid = (over: Partial<ProductFormValues> = {}): ProductFormValues => ({
  name: 'Heritage Polo',
  category: 'Tops',
  gender: '',
  arReady: false,
  description: '',
  basePrice: '1890',
  images: [image],
  sizes: ['S', 'M'],
  custom: [],
  colors: [{ id: 'c1', name: 'Navy', hex: '#26324a' }],
  edits: {},
  ...over,
})

describe('input filters', () => {
  it('strips emoji and control characters and caps the length', () => {
    expect(filterText('Tee \u{1F600}shirt\u0007', 100)).toBe('Tee shirt')
    expect(filterText('abcdef', 3)).toBe('abc')
  })
  it('keeps price to digits, one dot and two decimals', () => {
    expect(filterPrice('1a2,3.456.7')).toBe('123.45')
    expect(filterPrice('12345678')).toBe('1234567')
    expect(filterPrice('.5')).toBe('.5')
  })
  it('filters stock, size, colour and SKU boxes', () => {
    expect(filterStock('12ab345678')).toBe('12345')
    expect(filterSize('2xl-long!')).toBe('2XLLON')
    expect(filterColorName('Navy 9 Blue')).toBe('Navy Blue')
    expect(filterSku('ab c_d-1')).toBe('ABCD-1')
  })
})

describe('parsePrice', () => {
  it('rounds to cents and refuses non-numbers', () => {
    expect(parsePrice('10.5')).toBe(10.5)
    expect(parsePrice('10.')).toBe(10)
    expect(parsePrice('')).toBeNull()
    expect(parsePrice('1.234')).toBeNull()
  })
})

describe('validateProductForm', () => {
  it('accepts a complete form', () => {
    expect(validateProductForm(valid())).toEqual({})
  })

  it('requires a name of 2 to 100 characters after cleaning', () => {
    expect(validateProductForm(valid({ name: ' \u{1F600} a ' })).name).toBeDefined()
    expect(validateProductForm(valid({ name: '' })).name).toBeDefined()
    expect(validateProductForm(valid({ name: 'ab' })).name).toBeUndefined()
  })

  it('limits the base price to above 0 and up to 1,000,000', () => {
    for (const bad of ['', '0', '0.00', '1000000.01', 'abc']) expect(validateProductForm(valid({ basePrice: bad })).basePrice, bad).toBeDefined()
    for (const ok of ['0.01', '1000000', '.5']) expect(validateProductForm(valid({ basePrice: ok })).basePrice, ok).toBeUndefined()
  })

  it('needs an image, a size and a colour', () => {
    const errors = validateProductForm(valid({ images: [], sizes: [], colors: [] }))
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(['images', 'sizes', 'colors']))
  })

  it('checks the colour name and hex', () => {
    expect(HEX_COLOR.test('#fff')).toBe(true)
    expect(HEX_COLOR.test('#FFAA00')).toBe(true)
    for (const bad of ['fff', '#ff', '#ffff', '#gggggg', '#1234567']) expect(HEX_COLOR.test(bad), bad).toBe(false)
    const errors = validateProductForm(
      valid({
        colors: [
          { id: 'c1', name: '', hex: '#xyz' },
          { id: 'c2', name: 'Navy', hex: '#fff' },
          { id: 'c3', name: 'navy', hex: '#fff' },
        ],
      }),
    )
    expect(errors['color-name:c1']).toBeDefined()
    expect(errors['color-hex:c1']).toBeDefined()
    expect(errors['color-name:c3']).toMatch(/different/)
  })

  it('bounds stock at 0 to 99,999 and checks a price override', () => {
    const errors = validateProductForm(valid({ edits: { 'S|c1': { stock: '' }, 'M|c1': { stock: '100000', price: '0' } } }))
    expect(errors['stock:S|c1']).toBeDefined()
    expect(errors['stock:M|c1']).toBeDefined()
    expect(errors['price:M|c1']).toBeDefined()
    expect(validateProductForm(valid({ edits: { 'S|c1': { stock: '99999', price: '' } } }))).toEqual({})
  })

  it('caps the matrix at 60 rows', () => {
    const colors = Array.from({ length: 8 }, (_, n) => ({ id: `c${n}`, name: `Colour${'x'.repeat(n)}`, hex: '#fff' }))
    const sizes = Array.from({ length: 8 }, (_, n) => `S${n}`)
    expect(validateProductForm(valid({ colors, sizes, custom: sizes })).matrix).toMatch(/64/)
  })

  it('flags SKUs typed twice, on both rows, and SKUs already in the catalogue', () => {
    const errors = validateProductForm(valid({ edits: { 'S|c1': { sku: 'DUP' }, 'M|c1': { sku: 'dup' } } }))
    expect(errors['sku:S|c1']).toBeDefined()
    expect(errors['sku:M|c1']).toBeDefined()
    const taken = validateProductForm(valid({ edits: { 'S|c1': { sku: 'OLD-1' } } }), { existingSkus: new Set(['old-1']) })
    expect(taken['sku:S|c1']).toMatch(/OLD-1/)
    expect(validateProductForm(valid(), { conflictSku: 'TOP-HERI-NAV-S' })['sku:S|c1']).toBeDefined()
  })
})

describe('buildSkus', () => {
  it('builds CAT-NAME-COL-SIZE from letters and digits only', () => {
    const skus = buildSkus(valid({ name: 'Heritage Polo!', colors: [{ id: 'c1', name: 'Navy Blue', hex: '#fff' }] }))
    expect(skus).toEqual({ 'S|c1': 'TOP-HERI-NAV-S', 'M|c1': 'TOP-HERI-NAV-M' })
  })

  it('numbers colliding SKUs -2, -3 and avoids taken ones', () => {
    const v = valid({
      colors: [
        { id: 'c1', name: 'Navy', hex: '#fff' },
        { id: 'c2', name: 'Navigator', hex: '#fff' },
      ],
      sizes: ['S'],
    })
    expect(buildSkus(v)).toEqual({ 'S|c1': 'TOP-HERI-NAV-S', 'S|c2': 'TOP-HERI-NAV-S-2' })
    expect(buildSkus(v, new Set(['top-heri-nav-s']))).toEqual({ 'S|c1': 'TOP-HERI-NAV-S-2', 'S|c2': 'TOP-HERI-NAV-S-3' })
  })

  it('keeps a typed SKU as typed', () => {
    expect(buildSkus(valid({ edits: { 'S|c1': { sku: 'MINE-1' } } }))['S|c1']).toBe('MINE-1')
  })

  it('finds duplicates ignoring case', () => {
    expect([...findDuplicateSkus({ a: 'x-1', b: 'X-1', c: 'y' })].sort()).toEqual(['a', 'b'])
  })
})

describe('buildProductInput', () => {
  it('defaults alt to the name, marks the first image primary and omits blanks', () => {
    const input = buildProductInput(valid({ basePrice: '1890.5', edits: { 'S|c1': { stock: '4', price: '2000' } } }), { i1: 'https://x/a.jpg' })
    expect(input).toEqual({
      name: 'Heritage Polo',
      category: 'Tops',
      basePrice: 1890.5,
      arReady: false,
      images: [{ url: 'https://x/a.jpg', altText: 'Heritage Polo', isPrimary: true }],
      variants: [
        { sku: 'TOP-HERI-NAV-S', size: 'S', color: 'Navy', colorHex: '#26324a', stock: 4, price: 2000 },
        { sku: 'TOP-HERI-NAV-M', size: 'M', color: 'Navy', colorHex: '#26324a', stock: 0 },
      ],
    })
  })
})

describe('buildProductInput arReady', () => {
  it('carries the ticked AR Fitting option', () => {
    expect(buildProductInput(valid({ arReady: true }), { i1: 'https://x/a.jpg' }).arReady).toBe(true)
  })
})

describe('checkImageFile', () => {
  it('accepts jpg, png and webp up to 5 MB and says why otherwise', () => {
    expect(checkImageFile({ name: 'a.webp', type: 'image/webp', size: 5 * 1024 * 1024 })).toBeNull()
    expect(checkImageFile({ name: 'a.gif', type: 'image/gif', size: 1 })).toMatch(/JPG, PNG or WebP/)
    expect(checkImageFile({ name: 'a.jpg', type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/)
  })
})
