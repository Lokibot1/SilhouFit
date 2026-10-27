import { describe, expect, it } from 'vitest'
import type { MeasurementKey, ProductVariant } from '../../src/service/fetchProductList'
import {
  buildProductInput,
  buildProductPatch,
  buildSkus,
  buildVariantInput,
  buildVariantPatch,
  checkImageFile,
  filterColorName,
  filterMeasurement,
  filterPrice,
  filterSize,
  filterSku,
  filterStock,
  filterText,
  findDuplicateSkus,
  HEX_COLOR,
  parsePrice,
  validateProductForm,
  validateVariantForm,
  variantFormValues,
  type ImageDraft,
  type ProductEditSource,
  type ProductFormValues,
  type VariantFormValues,
} from '../../src/utils/productValidation'

const image = { id: 'i1', file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }), preview: 'blob:a', alt: null }
const valid = (over: Partial<ProductFormValues> = {}): ProductFormValues => ({
  name: 'Heritage Polo',
  category: 'Hoodie',
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
    expect(validateProductForm(valid(), { conflictSku: 'HOO-HERI-NAV-S' })['sku:S|c1']).toBeDefined()
  })
})

describe('buildSkus', () => {
  it('builds CAT-NAME-COL-SIZE from letters and digits only', () => {
    const skus = buildSkus(valid({ name: 'Heritage Polo!', colors: [{ id: 'c1', name: 'Navy Blue', hex: '#fff' }] }))
    expect(skus).toEqual({ 'S|c1': 'HOO-HERI-NAV-S', 'M|c1': 'HOO-HERI-NAV-M' })
  })

  it('numbers colliding SKUs -2, -3 and avoids taken ones', () => {
    const v = valid({
      colors: [
        { id: 'c1', name: 'Navy', hex: '#fff' },
        { id: 'c2', name: 'Navigator', hex: '#fff' },
      ],
      sizes: ['S'],
    })
    expect(buildSkus(v)).toEqual({ 'S|c1': 'HOO-HERI-NAV-S', 'S|c2': 'HOO-HERI-NAV-S-2' })
    expect(buildSkus(v, new Set(['hoo-heri-nav-s']))).toEqual({ 'S|c1': 'HOO-HERI-NAV-S-2', 'S|c2': 'HOO-HERI-NAV-S-3' })
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
      category: 'Hoodie',
      basePrice: 1890.5,
      arReady: false,
      images: [{ url: 'https://x/a.jpg', altText: 'Heritage Polo', isPrimary: true }],
      variants: [
        { sku: 'HOO-HERI-NAV-S', size: 'S', color: 'Navy', colorHex: '#26324a', stock: 4, price: 2000 },
        { sku: 'HOO-HERI-NAV-M', size: 'M', color: 'Navy', colorHex: '#26324a', stock: 0 },
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

describe('validateProductForm in edit mode', () => {
  it('needs no base price, sizes, colours or SKUs, but still a name and an image', () => {
    const edit = valid({ basePrice: '', sizes: [], colors: [] })
    expect(validateProductForm(edit, { mode: 'edit' })).toEqual({})
    expect(validateProductForm({ ...edit, name: 'a', images: [] }, { mode: 'edit' })).toEqual({
      name: expect.any(String),
      images: expect.any(String),
    })
  })
})

const ORIGINAL: ProductEditSource = {
  id: 'p1',
  name: 'Heritage Polo',
  category: 'Hoodie',
  brand: 'Ayala',
  description: 'Soft',
  gender: 'female',
  images: [
    { url: 'https://x/a.jpg', altText: 'Front', displayOrder: 0, isPrimary: true },
    { url: 'https://x/b.jpg', altText: null, displayOrder: 1, isPrimary: false },
  ],
}
const existing = (url: string, alt: string | null, id = url): ImageDraft => ({ id, preview: url, url, alt })
const editForm = (over: Partial<ProductFormValues> = {}): ProductFormValues => ({
  name: 'Heritage Polo',
  brand: 'Ayala',
  category: 'Hoodie',
  gender: 'female',
  arReady: false,
  description: 'Soft',
  basePrice: '',
  images: [existing('https://x/a.jpg', 'Front'), existing('https://x/b.jpg', null)],
  sizes: [],
  custom: [],
  colors: [],
  edits: {},
  ...over,
})

describe('buildProductPatch', () => {
  it('is empty when nothing changed', () => {
    expect(buildProductPatch(editForm(), {}, ORIGINAL)).toEqual({})
  })

  it('sends only the scalars that changed, and clears brand and description with an empty string', () => {
    expect(buildProductPatch(editForm({ name: ' Heritage Polo 2 ' }), {}, ORIGINAL)).toEqual({ name: 'Heritage Polo 2' })
    expect(buildProductPatch(editForm({ brand: '', description: '', category: 'Pants' }), {}, ORIGINAL)).toEqual({ brand: '', description: '', category: 'Pants' })
  })

  it('cannot clear a gender, only change it', () => {
    expect(buildProductPatch(editForm({ gender: '' }), {}, ORIGINAL)).toEqual({})
    expect(buildProductPatch(editForm({ gender: 'unisex' }), {}, ORIGINAL)).toEqual({ gender: 'unisex' })
  })

  it('leaves images out unless the ordered list or an alt text changed, then sends the whole list', () => {
    expect(buildProductPatch(editForm({ name: 'New name' }), {}, ORIGINAL)).not.toHaveProperty('images')
    const [a, b] = editForm().images
    expect(buildProductPatch(editForm({ images: [b, a] }), {}, ORIGINAL).images).toEqual([
      { url: 'https://x/b.jpg', altText: 'Heritage Polo', displayOrder: 0, isPrimary: true },
      { url: 'https://x/a.jpg', altText: 'Front', displayOrder: 1, isPrimary: false },
    ])
    expect(buildProductPatch(editForm({ images: [a] }), {}, ORIGINAL).images).toHaveLength(1)
    const added: ImageDraft = { id: 'img1', file: new File(['x'], 'c.jpg', { type: 'image/jpeg' }), preview: 'blob:c', alt: 'Back' }
    expect(buildProductPatch(editForm({ images: [a, b, added] }), { img1: 'https://x/c.jpg' }, ORIGINAL).images?.[2]).toEqual({
      url: 'https://x/c.jpg',
      altText: 'Back',
      displayOrder: 2,
      isPrimary: false,
    })
    expect(buildProductPatch(editForm({ images: [{ ...a, alt: 'Changed' }, b] }), {}, ORIGINAL).images).toBeDefined()
  })
})

const VARIANT: ProductVariant = {
  id: 'v1',
  sku: 'TEE-M-NAVY',
  name: null,
  size: 'M',
  color: 'Navy',
  colorHex: '#26324a',
  price: 500,
  stock: 3,
  imageUrl: null,
  measurements: { chestWidthCm: 52, waistWidthCm: null, hipWidthCm: null, totalLengthCm: 70, inseamCm: null, shoulderWidthCm: null, sleeveLengthCm: null, neckCm: null, thighCm: null },
}

describe('validateVariantForm', () => {
  const form = (over: Partial<VariantFormValues> = {}): VariantFormValues => ({ ...variantFormValues(), size: 'M', price: '500', ...over })

  it('accepts a size and a price, with the SKU left blank on add', () => {
    expect(validateVariantForm(form(), { mode: 'add' })).toEqual({})
  })

  it('needs at least one of size, colour and name', () => {
    expect(validateVariantForm(form({ size: '' }), { mode: 'add' }).identity).toBeDefined()
    expect(validateVariantForm(form({ size: '', name: 'Gift set' }), { mode: 'add' })).toEqual({})
  })

  it('needs a valid hex with a colour, and none without one', () => {
    expect(validateVariantForm(form({ color: 'Navy' }), { mode: 'add' }).colorHex).toBeDefined()
    expect(validateVariantForm(form({ color: 'Navy', colorHex: '#zzz' }), { mode: 'add' }).colorHex).toBeDefined()
    expect(validateVariantForm(form({ color: 'Navy', colorHex: '#fff' }), { mode: 'add' })).toEqual({})
  })

  it('needs a price, a stock on add, and a SKU on edit', () => {
    expect(validateVariantForm(form({ price: '' }), { mode: 'add' }).price).toBeDefined()
    expect(validateVariantForm(form({ stock: '' }), { mode: 'add' }).stock).toBeDefined()
    expect(validateVariantForm(form({ stock: '' }), { mode: 'edit' }).stock).toBeUndefined()
    expect(validateVariantForm(form({ sku: '' }), { mode: 'edit' }).sku).toBeDefined()
  })

  it('keeps each measurement within its range, and lets them be empty', () => {
    const m = (key: MeasurementKey, text: string) => ({ ...variantFormValues().measurements, [key]: text })
    expect(validateVariantForm(form({ measurements: m('chestWidthCm', '4.9') }), { mode: 'add' })['m:chestWidthCm']).toBeDefined()
    expect(validateVariantForm(form({ measurements: m('chestWidthCm', '250.1') }), { mode: 'add' })['m:chestWidthCm']).toBeDefined()
    expect(validateVariantForm(form({ measurements: m('chestWidthCm', '250') }), { mode: 'add' })['m:chestWidthCm']).toBeUndefined()
    expect(validateVariantForm(form({ measurements: m('chestWidthCm', '251') }), { mode: 'add' })['m:chestWidthCm']).toBeDefined()
    expect(validateVariantForm(form({ measurements: m('totalLengthCm', '9') }), { mode: 'add' })['m:totalLengthCm']).toBeDefined()
    expect(validateVariantForm(form({ measurements: m('neckCm', '100') }), { mode: 'add' })).toEqual({})
  })
})

describe('filterMeasurement', () => {
  it('keeps digits, one dot, one decimal and three integer digits', () => {
    expect(filterMeasurement('a1b2c3d4')).toBe('123')
    expect(filterMeasurement('52.56')).toBe('52.5')
    expect(filterMeasurement('5.2.1')).toBe('5.2')
    expect(filterMeasurement('.5')).toBe('.5')
  })
})

describe('buildVariantInput', () => {
  it('trims and leaves out empty boxes', () => {
    const v = { ...variantFormValues(), size: ' M ', price: '500', stock: '4' }
    expect(buildVariantInput(v)).toEqual({ size: 'M', price: 500, stock: 4 })
  })

  it('sends the colour with its hex, a typed SKU, the image and only the measurements filled in', () => {
    const v = {
      ...variantFormValues(),
      sku: 'MY-SKU',
      color: 'Navy',
      colorHex: '#26324A',
      name: 'Slim',
      price: '12.50',
      stock: '0',
      measurements: { ...variantFormValues().measurements, chestWidthCm: '52.5' },
    }
    expect(buildVariantInput(v, 'https://x/v.jpg')).toEqual({
      sku: 'MY-SKU',
      name: 'Slim',
      color: 'Navy',
      colorHex: '#26324a',
      price: 12.5,
      stock: 0,
      imageUrl: 'https://x/v.jpg',
      measurements: { chestWidthCm: 52.5 },
    })
  })
})

describe('buildVariantPatch', () => {
  const same = () => variantFormValues(VARIANT)

  it('is empty when nothing changed', () => {
    expect(buildVariantPatch(same(), VARIANT)).toEqual({})
  })

  it('sends only the price when only the price changed', () => {
    expect(buildVariantPatch({ ...same(), price: '700' }, VARIANT)).toEqual({ price: 700 })
  })

  it('sends a changed colour with its hex, together', () => {
    expect(buildVariantPatch({ ...same(), color: 'Red', colorHex: '#ff0000' }, VARIANT)).toEqual({ color: 'Red', colorHex: '#ff0000' })
    expect(buildVariantPatch({ ...same(), colorHex: '#000000' }, VARIANT)).toEqual({ color: 'Navy', colorHex: '#000000' })
  })

  it('sends color: null alone for a cleared colour, and null for a cleared size', () => {
    expect(buildVariantPatch({ ...same(), color: '', colorHex: '#26324a' }, VARIANT)).toEqual({ color: null })
    expect(buildVariantPatch({ ...same(), size: '' }, VARIANT)).toEqual({ size: null })
  })

  it('sends changed measurements only, null when cleared, and a new image URL', () => {
    const measurements = { ...same().measurements, chestWidthCm: '', neckCm: '38' }
    expect(buildVariantPatch({ ...same(), measurements }, VARIANT, 'https://x/v.jpg')).toEqual({
      imageUrl: 'https://x/v.jpg',
      measurements: { chestWidthCm: null, neckCm: 38 },
    })
  })
})
