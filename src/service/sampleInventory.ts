import { CATEGORIES, PRODUCTS, sizesFor, type Category, type Product } from '../data/products'
import { payablePrice } from '../utils/productQuery'
import { MAX_STOCK } from '../utils/stockEdit'
import type { Gender, PaginatedProducts, ProductDetailFields, ProductListItem, ProductListParams, ProductVariant } from './fetchProductList'
import type { NewProductInput, ProductPatch, VariantInput, VariantPatch } from './productAdmin'
import type { RequestOptions } from './simulateRequest'
import { simulateRequest } from './simulateRequest'

/** True while Inventory lists the shop's mock catalogue (data/products) instead of GET /products. Set to false when the backend has the products. */
export const INVENTORY_SAMPLE_DATA = true

/** The mock catalogue as an editable, in-memory store: variants are the source of truth and a product's stock is their sum. Resets on reload. */
interface StoredProduct {
  product: Product
  active: boolean
  variants: ProductVariant[]
  gender: Gender | null
}

let store: Map<string, StoredProduct> | null = null
let created = 0
/** Hex of the colours products were created with, by name, for swatches the shop catalogue does not know. */
export const SAMPLE_COLOR_HEX = new Map<string, string>()

/** Size x colour variants whose stock adds up to the product's: shared evenly, the first variants take the remainder. */
function seedVariants(product: Product): ProductVariant[] {
  const combos = sizesFor(product).flatMap((size) => product.colors.map((color) => ({ size, color: color.name })))
  return combos.map(({ size, color }, n) => ({
    id: `${product.id}-${size}-${color}`,
    sku: `${product.id.toUpperCase()}-${size}-${color.toUpperCase()}`,
    name: null,
    size,
    color,
    colorHex: product.colors.find((c) => c.name === color)?.hex ?? null,
    stock: Math.floor(product.stock / combos.length) + (n < product.stock % combos.length ? 1 : 0),
    price: payablePrice(product),
    imageUrl: null,
    measurements: null,
  }))
}

// The mock has no archived products to seed from, so every product starts active; archive one to try the Archived tab.
const products = () => (store ??= new Map(PRODUCTS.map((product) => [product.id, { product, active: true, variants: seedVariants(product), gender: null }])))

/** Puts the sample catalogue back as it was on load. For tests. */
export function resetSampleInventory() {
  store = null
  created = 0
  SAMPLE_COLOR_HEX.clear()
}

const sumStock = (variants: ProductVariant[]) => variants.reduce((sum, v) => sum + v.stock, 0)

const toListItem = ({ product: p, active, variants }: StoredProduct): ProductListItem => ({
  id: p.id,
  name: p.name,
  category: p.category,
  brand: p.boutique || null,
  // A product with no variants has no price, as the API reports it.
  minPrice: variants.length ? Math.min(...variants.map((v) => v.price)) : 0,
  maxPrice: variants.length ? Math.max(...variants.map((v) => v.price)) : 0,
  totalStock: sumStock(variants),
  primaryImage: { url: p.image, altText: p.alt },
  createdAt: p.addedAt,
  isActive: active,
  outOfStockVariants: variants.filter((v) => v.stock <= 0).length,
  variantCount: variants.length,
  arReady: p.arReady,
})

const COMPARE = {
  createdAt: (a: Product, b: Product) => a.addedAt.localeCompare(b.addedAt),
  name: (a: Product, b: Product) => a.name.localeCompare(b.name),
  basePrice: (a: Product, b: Product) => payablePrice(a) - payablePrice(b),
}

const find = (id: string) => {
  const stored = products().get(id)
  if (!stored) throw Object.assign(new Error('Product not found.'), { kind: 'not-found' })
  return stored
}

export type SampleListParams = ProductListParams & {
  /** Only AR Fitting ready products (`true`) or only those that are not (`false`); the API has no such filter yet. */
  arReady?: boolean
  /** Only products that are sold out (the API has no such filter yet). */
  outOfStockOnly?: boolean
  /** Only products with at least one size sold out, fully sold-out ones included. */
  sizesOutOnly?: boolean
  /** Which products to list; the API only lists active ones. */
  status?: 'active' | 'archived'
}

/** The same query the API takes (plus `outOfStockOnly`, `sizesOutOnly`, `arReady` and `status`, which it does not have yet), answered from the mock catalogue. `gender` is ignored: the mock has none. */
export async function sampleProductList(params: SampleListParams, { signal, delayMs = 500 }: RequestOptions = {}): Promise<PaginatedProducts> {
  await simulateRequest(delayMs, signal, () => false)
  const needle = params.search?.trim().toLowerCase()
  const sign = params.sortOrder === 'asc' ? 1 : -1
  const matched = [...products().values()]
    .filter(({ active }) => active === ((params.status ?? 'active') === 'active'))
    .filter(({ product: p }) => !params.category || p.category.toLowerCase() === params.category.toLowerCase())
    .filter(({ variants }) => !params.inStockOnly || sumStock(variants) > 0)
    .filter(({ variants }) => !params.outOfStockOnly || sumStock(variants) <= 0)
    .filter(({ variants }) => !params.sizesOutOnly || variants.some((v) => v.stock <= 0))
    .filter(({ product: p }) => params.arReady === undefined || Boolean(p.arReady) === params.arReady)
    .filter(({ product: p }) => !needle || [p.name, p.boutique, p.id].some((text) => text.toLowerCase().includes(needle)))
    .sort((a, b) => sign * COMPARE[params.sortBy ?? 'createdAt'](a.product, b.product))
  const limit = params.limit ?? 25
  const page = params.page ?? 1
  const totalPages = Math.ceil(matched.length / limit)
  return {
    data: matched.slice((page - 1) * limit, page * limit).map(toListItem),
    meta: { total: matched.length, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
  }
}

export async function sampleProductDetail(
  id: string,
  { signal, delayMs = 400 }: RequestOptions = {},
): Promise<{ variants: ProductVariant[]; product: ProductDetailFields }> {
  await simulateRequest(delayMs, signal, () => false)
  const { product: p, variants, gender } = find(id)
  return {
    variants: variants.map((v) => ({ ...v, measurements: v.measurements && { ...v.measurements } })),
    product: {
      description: p.description ?? null,
      gender,
      brand: p.boutique || null,
      category: p.category,
      images: [p.image, ...(p.images ?? [])].map((url, index) => ({ url, altText: p.alt, displayOrder: index, isPrimary: index === 0 })),
    },
  }
}

/** Sets each named variant's stock to exactly the given number, all or none (a bad change leaves every variant as it was). Answers with the product's variants. */
export async function sampleRestockVariants(
  productId: string,
  changes: { variantId: string; stock: number }[],
  { signal, delayMs = 400 }: RequestOptions = {},
): Promise<ProductVariant[]> {
  await simulateRequest(delayMs, signal, () => false)
  const stored = find(productId)
  for (const { variantId, stock } of changes) {
    if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK)
      throw Object.assign(new Error('Stock must be a whole number from 0 to 99999.'), { kind: 'validation' })
    if (!stored.variants.some((v) => v.id === variantId)) throw Object.assign(new Error('Variant not found.'), { kind: 'not-found' })
  }
  stored.variants = stored.variants.map((v) => ({ ...v, stock: changes.find((c) => c.variantId === v.id)?.stock ?? v.stock }))
  return stored.variants.map((v) => ({ ...v }))
}

/** Archives (`true`) or restores (`false`) a product. Nothing is deleted: an archived product is only hidden. */
export async function sampleSetArchived(productId: string, archived: boolean, { signal, delayMs = 400 }: RequestOptions = {}): Promise<void> {
  await simulateRequest(delayMs, signal, () => false)
  find(productId).active = !archived
}

/** Turns AR Fitting on or off for a product. The mock product is replaced, not mutated, so the shared catalogue data stays as it was. */
export async function sampleSetArReady(productId: string, arReady: boolean, { signal, delayMs = 400 }: RequestOptions = {}): Promise<void> {
  await simulateRequest(delayMs, signal, () => false)
  const stored = find(productId)
  stored.product = { ...stored.product, arReady }
}

/** Every SKU in the sample catalogue, so the form can flag a clash before sending. */
export const sampleSkus = (): Set<string> => new Set([...products().values()].flatMap(({ variants }) => variants.map((v) => v.sku)))

/** "Uploads" an image by keeping it in memory as an object URL. It lasts until the page reloads, like the rest of the sample catalogue. */
export async function sampleUploadImage(file: File, onProgress: (percent: number) => void, { signal, delayMs = 300 }: RequestOptions = {}): Promise<string> {
  await simulateRequest(delayMs, signal, () => false)
  onProgress(100)
  return URL.createObjectURL(file)
}

/**
 * Adds a product at the top of the list (its date is now). Variants come from the form, and a SKU already in the catalogue,
 * or twice in the form, is refused whole, as the API refuses it (409 and 400), with the SKU named in `detail`.
 */
export async function sampleCreateProduct(
  input: NewProductInput,
  { signal, delayMs = 600 }: RequestOptions = {},
): Promise<{ id: string; name: string }> {
  await simulateRequest(delayMs, signal, () => false)
  const taken = sampleSkus()
  const seen = new Set<string>()
  for (const { sku } of input.variants) {
    if (seen.has(sku.toUpperCase())) throw Object.assign(new Error('Duplicate SKU.'), { kind: 'validation', detail: `Duplicate SKU ${sku} in this product.` })
    seen.add(sku.toUpperCase())
    if ([...taken].some((t) => t.toUpperCase() === sku.toUpperCase()))
      throw Object.assign(new Error('SKU exists.'), { kind: 'conflict', detail: `SKU ${sku} already exists.` })
  }
  const id = `p-new-${++created}`
  const [main, ...rest] = [...input.images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  const colors = [...new Map(input.variants.map((v) => [v.color, { name: v.color, hex: v.colorHex }])).values()]
  for (const { name, hex } of colors) SAMPLE_COLOR_HEX.set(name, hex)
  const product: Product = {
    id,
    name: input.name,
    category: (CATEGORIES.find((c) => c === input.category) ?? CATEGORIES[0]) as Category,
    boutique: '',
    price: input.basePrice,
    image: main.url,
    images: rest.map((image) => image.url),
    alt: main.altText,
    colors,
    badges: [],
    stock: input.variants.reduce((sum, v) => sum + v.stock, 0),
    channels: ['online', 'store'],
    arReady: input.arReady,
    addedAt: new Date().toISOString(),
    description: input.description,
    rating: 0,
    reviews: 0,
  }
  const variants = input.variants.map((v) => ({
    id: `${id}-${v.sku}`,
    sku: v.sku,
    size: v.size,
    color: v.color,
    stock: v.stock,
    price: v.price ?? input.basePrice,
    name: null,
    colorHex: v.colorHex,
    imageUrl: null,
    measurements: null,
  }))
  products().set(id, { product, active: true, variants, gender: input.gender ?? null })
  return { id, name: input.name }
}

const EMPTY_MEASUREMENTS = {
  chestWidthCm: null,
  waistWidthCm: null,
  hipWidthCm: null,
  totalLengthCm: null,
  inseamCm: null,
  shoulderWidthCm: null,
  sleeveLengthCm: null,
  neckCm: null,
  thighCm: null,
}

const refuse = (kind: 'validation' | 'conflict', detail: string) => Object.assign(new Error(detail), { kind, detail })
const blank = (text: string | null | undefined) => !text?.trim()

/** The API's rules for a whole variant: something to tell it apart by, a hex with every colour, a price, and a SKU nobody else has. */
function checkVariant(v: Pick<ProductVariant, 'sku' | 'name' | 'size' | 'color' | 'colorHex' | 'price'>, others: ProductVariant[]) {
  if (blank(v.name) && blank(v.size) && blank(v.color)) throw refuse('validation', 'A variant needs a size, a colour or a name')
  if (!blank(v.color) && blank(v.colorHex)) throw refuse('validation', 'colorHex is required when color is provided')
  if (!Number.isFinite(v.price) || v.price < 0) throw refuse('validation', 'Price is required for the variant')
  if (others.some((o) => o.sku.toUpperCase() === v.sku.toUpperCase())) throw refuse('conflict', `SKU ${v.sku} is already in use`)
}

const allVariants = () => [...products().values()].flatMap(({ variants }) => variants)

/** Deletes a product with its variants. The shop catalogue it was seeded from is untouched. */
export async function sampleDeleteProduct(productId: string, { signal, delayMs = 400 }: RequestOptions = {}): Promise<void> {
  await simulateRequest(delayMs, signal, () => false)
  find(productId)
  products().delete(productId)
}

/** Adds a variant. A blank SKU is generated (`P-ID-SIZE-COLOUR`, then `-2`, `-3` if taken); a SKU typed by hand that is taken is a conflict. */
export async function sampleAddVariant(productId: string, input: VariantInput, { signal, delayMs = 500 }: RequestOptions = {}): Promise<ProductVariant> {
  await simulateRequest(delayMs, signal, () => false)
  const stored = find(productId)
  const taken = allVariants()
  const { size = null, color = null, name = null, colorHex = null } = input
  let sku = input.sku?.trim() ?? ''
  if (!sku) {
    const base = [productId.toUpperCase(), size, color?.toUpperCase(), !size && !color ? name : null].filter(Boolean).join('-')
    sku = base
    for (let n = 2; taken.some((t) => t.sku.toUpperCase() === sku.toUpperCase()); n++) sku = `${base}-${n}`
  }
  const variant: ProductVariant = {
    id: `${productId}-${sku}`,
    sku,
    name,
    size,
    color,
    colorHex: blank(color) ? null : colorHex,
    price: input.price ?? NaN,
    stock: input.stock ?? 0,
    imageUrl: input.imageUrl ?? null,
    measurements: input.measurements ? { ...EMPTY_MEASUREMENTS, ...input.measurements } : null,
  }
  checkVariant(variant, taken)
  if (color && colorHex) SAMPLE_COLOR_HEX.set(color, colorHex)
  stored.variants = [...stored.variants, variant]
  return { ...variant }
}

/** Edits a variant: what the patch leaves out stays, `null` clears. The merged variant must still follow the rules, as on the API. */
export async function sampleUpdateVariant(
  productId: string,
  variantId: string,
  patch: VariantPatch,
  { signal, delayMs = 500 }: RequestOptions = {},
): Promise<ProductVariant> {
  await simulateRequest(delayMs, signal, () => false)
  const stored = find(productId)
  const existing = stored.variants.find((v) => v.id === variantId)
  if (!existing) throw Object.assign(new Error('Variant not found.'), { kind: 'not-found' })
  const { measurements, ...fields } = patch
  const merged: ProductVariant = { ...existing, ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) }
  if (blank(merged.color)) merged.colorHex = null
  if (measurements) merged.measurements = { ...(existing.measurements ?? EMPTY_MEASUREMENTS), ...measurements }
  checkVariant(merged, allVariants().filter((v) => v.id !== variantId))
  if (merged.color && merged.colorHex) SAMPLE_COLOR_HEX.set(merged.color, merged.colorHex)
  stored.variants = stored.variants.map((v) => (v.id === variantId ? merged : v))
  return { ...merged }
}

export async function sampleDeleteVariant(productId: string, variantId: string, { signal, delayMs = 400 }: RequestOptions = {}): Promise<void> {
  await simulateRequest(delayMs, signal, () => false)
  const stored = find(productId)
  if (!stored.variants.some((v) => v.id === variantId)) throw Object.assign(new Error('Variant not found.'), { kind: 'not-found' })
  stored.variants = stored.variants.filter((v) => v.id !== variantId)
}

/** Edits a product's own fields. Like the API, `images` replaces every image. The mock product is replaced, not mutated, so the shared catalogue stays as it was. */
export async function sampleUpdateProduct(productId: string, patch: ProductPatch, { signal, delayMs = 500 }: RequestOptions = {}): Promise<void> {
  await simulateRequest(delayMs, signal, () => false)
  const stored = find(productId)
  const { name, description, category, brand, gender, images } = patch
  const main = images?.find((image) => image.isPrimary) ?? images?.[0]
  stored.product = {
    ...stored.product,
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(category !== undefined && { category: category as Category }),
    ...(brand !== undefined && { boutique: brand }),
    ...(main && { image: main.url, alt: main.altText ?? stored.product.alt, images: images!.filter((image) => image !== main).map((image) => image.url) }),
  }
  if (gender !== undefined) stored.gender = gender
}
