import { CATEGORIES, PRODUCTS, sizesFor, type Category, type Product } from '../data/products'
import { payablePrice } from '../utils/productQuery'
import { MAX_STOCK } from '../utils/stockEdit'
import type { PaginatedProducts, ProductListItem, ProductListParams, ProductVariant } from './fetchProductList'
import type { NewProductInput } from './productAdmin'
import type { RequestOptions } from './simulateRequest'
import { simulateRequest } from './simulateRequest'

/** True while Inventory lists the shop's mock catalogue (data/products) instead of GET /products. Set to false when the backend has the products. */
export const INVENTORY_SAMPLE_DATA = true

/** The mock catalogue as an editable, in-memory store: variants are the source of truth and a product's stock is their sum. Resets on reload. */
interface StoredProduct {
  product: Product
  active: boolean
  variants: ProductVariant[]
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
    size,
    color,
    stock: Math.floor(product.stock / combos.length) + (n < product.stock % combos.length ? 1 : 0),
    effectivePrice: payablePrice(product),
  }))
}

// The mock has no archived products to seed from, so every product starts active; archive one to try the Archived tab.
const products = () => (store ??= new Map(PRODUCTS.map((product) => [product.id, { product, active: true, variants: seedVariants(product) }])))

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
  minPrice: Math.min(...variants.map((v) => v.effectivePrice)),
  maxPrice: Math.max(...variants.map((v) => v.effectivePrice)),
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

export async function sampleProductDetail(id: string, { signal, delayMs = 400 }: RequestOptions = {}): Promise<{ variants: ProductVariant[] }> {
  await simulateRequest(delayMs, signal, () => false)
  return { variants: find(id).variants.map((v) => ({ ...v })) }
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
    effectivePrice: v.price ?? input.basePrice,
  }))
  products().set(id, { product, active: true, variants })
  return { id, name: input.name }
}
