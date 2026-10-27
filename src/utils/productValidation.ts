import { SIZES_BY_CATEGORY, type Category } from '../data/products'
import type { Gender, MeasurementKey, ProductDetailFields, ProductListItem, ProductVariant } from '../service/fetchProductList'
import type { NewProductInput, ProductPatch, VariantInput, VariantPatch } from '../service/productAdmin'
import { cleanText } from './checkoutValidation'
import { stripEmoji } from './signUpValidation'
import { MAX_STOCK, parseStock, STOCK_ERROR } from './stockEdit'

export const PRODUCT_LIMITS = {
  nameMin: 2,
  nameMax: 100,
  descriptionMax: 1000,
  priceMax: 1_000_000,
  sizeMax: 6,
  colorNameMax: 30,
  colorsMax: 8,
  skuMax: 40,
  altMax: 120,
  imagesMax: 5,
  imageBytes: 5 * 1024 * 1024,
  variantsMax: 60,
  variantNameMax: 60,
  brandMax: 60,
} as const

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i
export const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
export const DEFAULT_HEX = '#1b1d21'

// Control characters are what this removes, on purpose.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F]/g

/** Live typing filter for single-line text: no emoji, no control characters, one space at a time, capped. Trimming is left to `cleanText` on submit. */
export const filterText = (input: string, max: number) => stripEmoji(input.replace(CONTROL, '')).replace(/ {2,}/g, ' ').slice(0, max)
/** Multi-line text keeps its line breaks. */
export const filterMultiline = (input: string, max: number) =>
  // oxlint-disable-next-line no-control-regex
  stripEmoji(input.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')).slice(0, max)
export const filterColorName = (input: string) => input.replace(/[^\p{L}\p{M} ]/gu, '').replace(/ {2,}/g, ' ').slice(0, PRODUCT_LIMITS.colorNameMax)
export const filterSize = (input: string) => input.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, PRODUCT_LIMITS.sizeMax)
export const filterSku = (input: string) => input.replace(/[^a-z0-9-]/gi, '').toUpperCase().slice(0, PRODUCT_LIMITS.skuMax)

/** Digits and one dot, two decimals at most, seven integer digits at most (1,000,000 is the ceiling). */
export function filterPrice(input: string) {
  const cleaned = input.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot < 0) return cleaned.slice(0, 7)
  return `${cleaned.slice(0, dot).slice(0, 7)}.${cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`
}
/** A filtered price with thousands commas for display (`1234.5` -> `1,234.5`). The stored value stays comma-free. */
export const formatPriceInput = (value: string) => value.replace(/^\d+/, (int) => int.replace(/\B(?=(\d{3})+$)/g, ','))
export { filterStock } from './stockEdit'

/** The amount typed in a price box, rounded to cents, or null when it is empty or not a number. */
export function parsePrice(text: string): number | null {
  if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(text)) return null
  return Math.round(Number(text) * 100) / 100
}

const PRICE_ERROR = 'Enter an amount above 0 and up to 1,000,000, with at most 2 decimals.'
export function validatePrice(text: string): string | null {
  const price = parsePrice(text)
  return price === null || price <= 0 || price > PRODUCT_LIMITS.priceMax ? PRICE_ERROR : null
}

/** Why a chosen file can't be used, or null. Checks the file's type and extension (the server checks again) and its size. */
export function checkImageFile(file: { name: string; type: string; size: number }): string | null {
  if (!IMAGE_TYPES.includes(file.type) || !IMAGE_EXTENSIONS.test(file.name))
    return `${file.name} wasn't added. Only JPG, PNG or WebP images work, so choose a different file.`
  if (file.size > PRODUCT_LIMITS.imageBytes)
    return `${file.name} wasn't added. It is ${(file.size / 1024 / 1024).toFixed(1)} MB and the limit is 5 MB, so choose a smaller file or compress it.`
  return null
}

export interface ImageDraft {
  id: string
  /** Missing for an image the product already has (its `url` is set and `preview` is that URL). */
  file?: File
  /** Object URL for the thumbnail. */
  preview: string
  /** null follows the product name until the staff member edits it. */
  alt: string | null
  /** Set once the file is uploaded, so a retry after a failed create does not upload it again. */
  url?: string
}
export interface ColorRow {
  id: string
  name: string
  hex: string
}
export interface RowEdit {
  sku?: string
  stock?: string
  price?: string
}
/** What the edit form starts from: the list row's id and name, and the rest from the product's detail. */
export type ProductEditSource = Pick<ProductListItem, 'id' | 'name'> & ProductDetailFields

export interface ProductFormValues {
  name: string
  /** Edit mode only. */
  brand?: string
  category: Category
  gender: Gender | ''
  arReady: boolean
  description: string
  basePrice: string
  images: ImageDraft[]
  /** The sizes ticked. */
  sizes: string[]
  /** Sizes added by hand, which stay as chips after they are unticked. */
  custom: string[]
  colors: ColorRow[]
  /** What was typed in a variant row, by row key; a missing field means "use the generated value". */
  edits: Record<string, RowEdit>
}

export interface VariantRowInfo {
  key: string
  size: string
  color: string
  hex: string
}

const unique = (items: string[]) => [...new Set(items)]
/** Every size chip: the category's sizes, then the custom ones, then any ticked size the category does not have. */
export const sizeChips = (v: Pick<ProductFormValues, 'category' | 'custom' | 'sizes'>) => unique([...SIZES_BY_CATEGORY[v.category], ...v.custom, ...v.sizes])

/** Size x colour combinations, in chip order. Colours still without a name make no row. */
export function variantRows(v: ProductFormValues): VariantRowInfo[] {
  const colors = v.colors.filter((c) => cleanText(c.name))
  return sizeChips(v)
    .filter((size) => v.sizes.includes(size))
    .flatMap((size) => colors.map((c) => ({ key: `${size}|${c.id}`, size, color: cleanText(c.name), hex: c.hex })))
}

const alnum = (text: string) => text.replace(/[^a-z0-9]/gi, '').toUpperCase()

/**
 * A SKU for every row, by key: what was typed, or `CAT-NAME-COL-SIZE` ("HOO-HERI-NAV-M"). A generated SKU that
 * collides with another row or with `taken` gets `-2`, `-3`... A typed SKU is kept as is, so its clash can be flagged.
 */
export function buildSkus(v: ProductFormValues, taken: ReadonlySet<string> = new Set()): Record<string, string> {
  const rows = variantRows(v)
  const typed = (key: string) => v.edits[key]?.sku
  const used = new Set([...taken].map((sku) => sku.toUpperCase()))
  for (const { key } of rows) if (typed(key)) used.add(typed(key)!.toUpperCase())
  const skus: Record<string, string> = {}
  for (const row of rows) {
    if (typed(row.key) !== undefined) {
      skus[row.key] = typed(row.key)!
      continue
    }
    const base = [alnum(v.category).slice(0, 3), alnum(cleanText(v.name)).slice(0, 4), alnum(row.color).slice(0, 3), alnum(row.size)].filter(Boolean).join('-')
    let sku = base
    for (let n = 2; used.has(sku); n++) sku = `${base}-${n}`
    used.add(sku)
    skus[row.key] = sku
  }
  return skus
}

/** The row keys whose SKU another row also has (ignoring case). */
export function findDuplicateSkus(skus: Record<string, string>): Set<string> {
  const seen = new Map<string, string[]>()
  for (const [key, sku] of Object.entries(skus)) seen.set(sku.toUpperCase(), [...(seen.get(sku.toUpperCase()) ?? []), key])
  return new Set([...seen.values()].filter((keys) => keys.length > 1).flat())
}

export interface ValidationOptions {
  /** 'edit' is the Edit details form: no base price, sizes, colours or SKUs, which belong to variants. */
  mode?: 'create' | 'edit'
  /** SKUs the catalogue already has. */
  existingSkus?: ReadonlySet<string>
  /** A SKU the server said is taken. */
  conflictSku?: string
}

/** Every problem in the form, by field key, in on-screen order. An empty object means it can be sent. */
export function validateProductForm(v: ProductFormValues, { existingSkus = new Set(), conflictSku, mode = 'create' }: ValidationOptions = {}): Record<string, string> {
  const errors: Record<string, string> = {}
  const name = cleanText(stripEmoji(v.name))
  if (name.length < PRODUCT_LIMITS.nameMin || name.length > PRODUCT_LIMITS.nameMax) errors.name = 'Enter a product name of 2 to 100 characters.'
  if (v.description.trim().length > PRODUCT_LIMITS.descriptionMax) errors.description = 'Keep the description to 1,000 characters or fewer.'
  const price = mode === 'edit' ? null : validatePrice(v.basePrice)
  if (price) errors.basePrice = price

  if (v.images.length === 0) errors.images = 'Add at least one image.'
  for (const image of v.images) if ((image.alt ?? '').length > PRODUCT_LIMITS.altMax) errors[`alt:${image.id}`] = 'Keep the alt text to 120 characters or fewer.'
  if (mode === 'edit') return errors

  if (v.sizes.length === 0) errors.sizes = 'Select at least one size.'
  if (v.colors.length === 0) errors.colors = 'Add at least one colour.'
  const names = new Set<string>()
  for (const color of v.colors) {
    const colorName = cleanText(color.name)
    if (!colorName || !/^[\p{L}\p{M} ]+$/u.test(colorName)) errors[`color-name:${color.id}`] = 'Enter a colour name using letters only.'
    else if (names.has(colorName.toLowerCase())) errors[`color-name:${color.id}`] = 'Each colour needs a different name.'
    names.add(colorName.toLowerCase())
    if (!HEX_COLOR.test(color.hex)) errors[`color-hex:${color.id}`] = 'Enter a hex colour such as #1b1d21 or #fff.'
  }

  const rows = variantRows(v)
  if (rows.length > PRODUCT_LIMITS.variantsMax)
    errors.matrix = `That makes ${rows.length} variants. Remove sizes or colours to get to ${PRODUCT_LIMITS.variantsMax} or fewer.`
  const skus = buildSkus(v, existingSkus)
  const duplicates = findDuplicateSkus(skus)
  const taken = new Set([...existingSkus, ...(conflictSku ? [conflictSku] : [])].map((sku) => sku.toUpperCase()))
  for (const { key } of rows) {
    const sku = skus[key]
    if (!sku) errors[`sku:${key}`] = 'Enter a SKU.'
    else if (duplicates.has(key)) errors[`sku:${key}`] = 'Another variant here has this SKU. Change one so each has its own.'
    else if (taken.has(sku.toUpperCase())) errors[`sku:${key}`] = `SKU ${sku} is already used by another product. Choose a different one.`
    const stock = parseStock(v.edits[key]?.stock ?? '0')
    if (stock === null || stock > MAX_STOCK) errors[`stock:${key}`] = STOCK_ERROR
    const override = v.edits[key]?.price
    if (override) {
      const message = validatePrice(override)
      if (message) errors[`price:${key}`] = message
    }
  }
  return errors
}

/** The request for a form that passed validation. `urls` is each image's public URL, by image id. */
export function buildProductInput(v: ProductFormValues, urls: Record<string, string>, existingSkus: ReadonlySet<string> = new Set()): NewProductInput {
  const name = cleanText(stripEmoji(v.name))
  const skus = buildSkus(v, existingSkus)
  const description = v.description.trim()
  return {
    name,
    category: v.category,
    basePrice: parsePrice(v.basePrice)!,
    ...(v.gender && { gender: v.gender }),
    arReady: v.arReady,
    ...(description && { description }),
    images: v.images.map((image, index) => ({
      url: urls[image.id],
      altText: cleanText(stripEmoji(image.alt ?? '')) || name,
      isPrimary: index === 0,
    })),
    variants: variantRows(v).map(({ key, size, color, hex }) => {
      const price = v.edits[key]?.price ? parsePrice(v.edits[key].price!) : null
      return { sku: skus[key], size, color, colorHex: hex.toLowerCase(), stock: parseStock(v.edits[key]?.stock ?? '0')!, ...(price !== null && { price }) }
    }),
  }
}

/** The request body for an edited product: only what changed. `urls` is the public URL of each newly added image, by image id. */
export function buildProductPatch(v: ProductFormValues, urls: Record<string, string>, original: ProductEditSource): ProductPatch {
  const name = cleanText(stripEmoji(v.name))
  const description = v.description.trim()
  const brand = (v.brand ?? '').trim()
  const urlOf = (image: ImageDraft) => urls[image.id] ?? image.url ?? ''
  // Images are replaced as a whole, so they are sent only when the list, its order or an alt text changed.
  const imagesChanged =
    v.images.length !== original.images.length ||
    v.images.some((image, i) => urlOf(image) !== original.images[i].url || (image.alt ?? null) !== original.images[i].altText)
  return {
    ...(name !== original.name && { name }),
    ...(description !== (original.description ?? '') && { description }),
    ...(brand !== (original.brand ?? '') && { brand }),
    ...(v.category !== original.category && { category: v.category }),
    ...(v.gender && v.gender !== original.gender && { gender: v.gender }),
    ...(imagesChanged && {
      images: v.images.map((image, index) => ({
        url: urlOf(image),
        altText: cleanText(stripEmoji(image.alt ?? '')) || name,
        displayOrder: index,
        isPrimary: index === 0,
      })),
    }),
  }
}

export const MEASUREMENT_FIELDS: { key: MeasurementKey; label: string; min: number; max: number }[] = [
  { key: 'chestWidthCm', label: 'Chest width', min: 5, max: 250 },
  { key: 'waistWidthCm', label: 'Waist width', min: 5, max: 250 },
  { key: 'hipWidthCm', label: 'Hip width', min: 5, max: 250 },
  { key: 'totalLengthCm', label: 'Total length', min: 10, max: 300 },
  { key: 'inseamCm', label: 'Inseam', min: 5, max: 200 },
  { key: 'shoulderWidthCm', label: 'Shoulder width', min: 5, max: 150 },
  { key: 'sleeveLengthCm', label: 'Sleeve length', min: 5, max: 150 },
  { key: 'neckCm', label: 'Neck', min: 5, max: 100 },
  { key: 'thighCm', label: 'Thigh', min: 5, max: 150 },
]

/** Digits and one dot, one decimal, three integer digits at most. */
export function filterMeasurement(input: string) {
  const cleaned = input.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot < 0) return cleaned.slice(0, 3)
  return `${cleaned.slice(0, dot).slice(0, 3)}.${cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 1)}`
}

const parseMeasurement = (text: string): number | null => (/^(\d+\.?\d?|\.\d)$/.test(text) ? Number(text) : null)

/** The Add / Edit variant form: every box holds text. */
export interface VariantFormValues {
  size: string
  color: string
  colorHex: string
  name: string
  sku: string
  price: string
  /** Add only: an existing variant's stock is changed in the stock editor. */
  stock: string
  measurements: Record<MeasurementKey, string>
}

/** The form for a variant being edited, or an empty one (stock 0) for a new variant. */
export function variantFormValues(variant?: ProductVariant): VariantFormValues {
  return {
    size: variant?.size ?? '',
    color: variant?.color ?? '',
    colorHex: variant?.colorHex ?? '',
    name: variant?.name ?? '',
    sku: variant?.sku ?? '',
    price: variant ? String(variant.price) : '',
    stock: '0',
    measurements: Object.fromEntries(MEASUREMENT_FIELDS.map(({ key }) => [key, String(variant?.measurements?.[key] ?? '')])) as VariantFormValues['measurements'],
  }
}

/** Every problem in the variant form, by field key (`identity` is "none of size, colour and name filled in"). An empty object means it can be sent. */
export function validateVariantForm(v: VariantFormValues, { mode }: { mode: 'add' | 'edit' }): Record<string, string> {
  const errors: Record<string, string> = {}
  const color = cleanText(v.color)
  if (!cleanText(v.size) && !color && !cleanText(stripEmoji(v.name))) errors.identity = 'Enter a size, a colour or a variant name so this variant can be told apart.'
  if (color && !HEX_COLOR.test(v.colorHex)) errors.colorHex = 'Enter a hex colour such as #1b1d21 or #fff.'
  if (mode === 'edit' && !v.sku) errors.sku = 'Enter a SKU.'
  const price = validatePrice(v.price)
  if (price) errors.price = price
  if (mode === 'add') {
    const stock = parseStock(v.stock)
    if (stock === null || stock > MAX_STOCK) errors.stock = STOCK_ERROR
  }
  for (const { key, label, min, max } of MEASUREMENT_FIELDS) {
    const text = v.measurements[key]
    if (!text) continue
    const value = parseMeasurement(text)
    if (value === null || value < min || value > max) errors[`m:${key}`] = `Enter ${label.toLowerCase()} from ${min} to ${max} cm.`
  }
  return errors
}

const variantText = (text: string) => cleanText(stripEmoji(text))

/** The request for a new variant that passed validation: empty boxes are left out. `imageUrl` is the uploaded image's URL. */
export function buildVariantInput(v: VariantFormValues, imageUrl?: string): VariantInput {
  const color = variantText(v.color)
  const measurements = Object.fromEntries(
    MEASUREMENT_FIELDS.filter(({ key }) => v.measurements[key]).map(({ key }) => [key, parseMeasurement(v.measurements[key])!]),
  )
  return {
    ...(v.sku && { sku: v.sku }),
    ...(variantText(v.name) && { name: variantText(v.name) }),
    ...(variantText(v.size) && { size: variantText(v.size) }),
    ...(color && { color, colorHex: v.colorHex.toLowerCase() }),
    price: parsePrice(v.price)!,
    stock: parseStock(v.stock)!,
    ...(imageUrl && { imageUrl }),
    ...(Object.keys(measurements).length > 0 && { measurements }),
  }
}

/** Only what differs from `original`. A colour change sends the colour with its hex; a cleared one sends `color: null` alone; a cleared measurement is `null`. An empty patch means nothing changed. */
export function buildVariantPatch(v: VariantFormValues, original: ProductVariant, imageUrl?: string): VariantPatch {
  const patch: VariantPatch = {}
  if (v.sku !== original.sku) patch.sku = v.sku
  for (const key of ['name', 'size'] as const) {
    const next = variantText(v[key])
    if (next !== (original[key] ?? '')) patch[key] = next || null
  }
  const color = variantText(v.color)
  const hex = v.colorHex.toLowerCase()
  if (color ? color !== (original.color ?? '') || hex !== (original.colorHex ?? '').toLowerCase() : original.color) {
    if (color) {
      patch.color = color
      patch.colorHex = hex
    } else patch.color = null
  }
  if (parsePrice(v.price) !== original.price) patch.price = parsePrice(v.price)!
  if (imageUrl) patch.imageUrl = imageUrl
  const measurements: NonNullable<VariantPatch['measurements']> = {}
  for (const { key } of MEASUREMENT_FIELDS) {
    const next = v.measurements[key] ? parseMeasurement(v.measurements[key]) : null
    if (next !== (original.measurements?.[key] ?? null)) measurements[key] = next
  }
  if (Object.keys(measurements).length > 0) patch.measurements = measurements
  return patch
}

/** aria-describedby for a control in a form field: its error and its counter, when it has them. */
export const describedBy = (id: string, error: string | undefined, counted = false) =>
  [error && `${id}-error`, counted && `${id}-count`].filter(Boolean).join(' ') || undefined

let nextColor = 0
export const newColor = (): ColorRow => ({ id: `c${++nextColor}`, name: '', hex: DEFAULT_HEX })
