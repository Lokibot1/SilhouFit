import type { RequestOptions } from './simulateRequest'
import { getSupabase } from './supabase'

export interface ProductListItem {
  id: string
  name: string
  /** Set when the API sends it; the by-slug lookup relies on it. */
  slug?: string
  category: string
  brand: string | null
  minPrice: number
  maxPrice: number
  totalStock: number
  primaryImage: { url: string; altText: string | null } | null
  createdAt: string
  // Optional until the API sends them (see the note on `fetchProductList`); hidden in the UI while they are missing.
  isActive?: boolean
  outOfStockVariants?: number
  variantCount?: number
  /** Needs a backend `Product.arReady` boolean on list and detail; until then it is never set and the AR column shows a dash. */
  arReady?: boolean
}

export interface PaginatedProducts {
  data: ProductListItem[]
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean }
}

export type Gender = 'male' | 'female' | 'other' | 'unisex'

export interface ProductListParams {
  search?: string
  category?: string
  gender?: Gender
  /** Exact match, ignoring case. */
  brand?: string
  /** Exact match, ignoring case. Size, colour, price and stock must all hold for the same variant. */
  size?: string
  /** One colour, exact match ignoring case. */
  color?: string
  /** Bounds on a variant's price. */
  minPrice?: number
  maxPrice?: number
  page?: number
  inStockOnly?: boolean
  /** The API sorts by date or name only, never by price. */
  sortBy?: 'createdAt' | 'name'
  sortOrder?: 'asc' | 'desc'
  limit?: number
}

/** The shape of a full product id; anything else is searched by name. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ProductListErrorKind = 'network' | 'rate-limit' | 'not-found' | 'server' | 'validation' | 'conflict' | 'forbidden'

// Lets a section pick accurate copy; 'not-found' is only raised for a product looked up by id or slug.
export class ProductListError extends Error {
  kind: ProductListErrorKind
  /** What the server said was wrong, when it said (a 400 or 409 on creating a product). */
  detail?: string

  constructor(kind: ProductListErrorKind, detail?: string) {
    super(`Loading products failed (${kind}).`)
    this.kind = kind
    this.detail = detail
  }
}

const STATUS_KIND: Record<number, ProductListErrorKind> = { 400: 'validation', 401: 'forbidden', 403: 'forbidden', 404: 'not-found', 409: 'conflict', 429: 'rate-limit' }

/** The server's own message (Nest sends a string or a list of them), or undefined when the body is not that. */
async function errorDetail(response: Response): Promise<string | undefined> {
  try {
    const { message } = (await response.json()) as { message?: unknown }
    const text = Array.isArray(message) ? message.filter((m) => typeof m === 'string').join('; ') : message
    return typeof text === 'string' && text ? text.slice(0, 300) : undefined
  } catch {
    return undefined
  }
}

// Same request shape as fetchMe: the Supabase token rides along, and an abort rejects with the AbortError itself.
export async function request(method: 'GET' | 'PATCH' | 'POST' | 'DELETE', path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  let token: string | undefined
  try {
    const supabase = await getSupabase()
    token = (await supabase.auth.getSession()).data.session?.access_token
  } catch {
    throw new ProductListError('server')
  }
  signal?.throwIfAborted()

  let response: Response
  try {
    response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
      method,
      headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (failure) {
    if (signal?.aborted) throw failure
    throw new ProductListError('network')
  }
  if (!response.ok) throw new ProductListError(STATUS_KIND[response.status] ?? 'server', await errorDetail(response))
  try {
    return await response.json()
  } catch {
    throw new ProductListError('server')
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isCount = (value: unknown) => typeof value === 'number' && Number.isFinite(value)

function toListItem(value: unknown): ProductListItem {
  if (!isRecord(value)) throw new ProductListError('server')
  const { id, name, category, minPrice, maxPrice, totalStock, createdAt } = value
  if (typeof id !== 'string' || typeof name !== 'string' || typeof category !== 'string') throw new ProductListError('server')
  if (!isCount(minPrice) || !isCount(maxPrice) || !isCount(totalStock)) throw new ProductListError('server')
  const image = value.primaryImage
  return {
    id,
    name,
    ...(typeof value.slug === 'string' && { slug: value.slug }),
    category,
    brand: typeof value.brand === 'string' ? value.brand : null,
    minPrice: minPrice as number,
    maxPrice: maxPrice as number,
    totalStock: totalStock as number,
    primaryImage: isRecord(image) && typeof image.url === 'string' ? { url: image.url, altText: typeof image.altText === 'string' ? image.altText : null } : null,
    createdAt: typeof createdAt === 'string' ? createdAt : '',
    ...(typeof value.isActive === 'boolean' && { isActive: value.isActive }),
  }
}

const PRICE_KEYS = ['minPrice', 'maxPrice']

/**
 * GET /products. Active products only; the API caps `limit` at 100.
 * Backend needs for staff Inventory: `?status=active|archived|all` (staff only) so archived products can be listed, `isActive`,
 * `outOfStockVariants` and `variantCount` on each list item, and a bulk or atomic stock endpoint (restock now sends one PATCH per variant).
 */
export async function fetchProductList(params: ProductListParams, { signal }: RequestOptions = {}): Promise<PaginatedProducts> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    // The API rejects unknown values, so blanks, bad numbers and a price sort (`basePrice`) never go out.
    if (typeof value === 'string' && !value.trim()) continue
    if (typeof value === 'number' && (Number.isNaN(value) || (PRICE_KEYS.includes(key) && value < 0))) continue
    if (key === 'sortBy' && value !== 'createdAt' && value !== 'name') continue
    query.set(key, typeof value === 'string' ? value.trim() : String(value))
  }
  const body = await request('GET', `/products?${query}`, undefined, signal)
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || !isCount(meta.total)) throw new ProductListError('server')
  return {
    data: body.data.map(toListItem),
    meta: {
      total: meta.total as number,
      page: Number(meta.page) || 1,
      limit: Number(meta.limit) || 0,
      totalPages: Number(meta.totalPages) || 0,
      hasNextPage: meta.hasNextPage === true,
      hasPreviousPage: meta.hasPreviousPage === true,
    },
  }
}

/** Shapes a product detail body into a list item: the API sends the price range, stock is summed from its variants. */
function toDetailItem(body: unknown): ProductListItem {
  if (!isRecord(body) || !Array.isArray(body.variants) || !Array.isArray(body.images) || !isCount(body.minPrice) || !isCount(body.maxPrice)) throw new ProductListError('server')
  const variants = body.variants.filter(isRecord)
  const images = body.images.filter(isRecord)
  return toListItem({
    ...body,
    totalStock: variants.reduce((sum, variant) => sum + (isCount(variant.stock) ? (variant.stock as number) : 0), 0),
    primaryImage: images.find((image) => image.isPrimary === true) ?? images[0] ?? null,
  })
}

/** GET /products/:id. The API answers with the detail shape, so price range and stock are worked out from its variants. */
export async function fetchProductById(id: string, { signal }: RequestOptions = {}): Promise<ProductListItem> {
  return toDetailItem(await request('GET', `/products/${encodeURIComponent(id)}`, undefined, signal))
}

/** GET /products/slug/:slug. Same detail shape as by id, so the result matches `fetchProductById` and carries the slug. */
export async function fetchProductBySlug(slug: string, { signal }: RequestOptions = {}): Promise<ProductListItem> {
  return toDetailItem(await request('GET', `/products/slug/${encodeURIComponent(slug)}`, undefined, signal))
}

export const MEASUREMENT_KEYS = [
  'chestWidthCm',
  'waistWidthCm',
  'hipWidthCm',
  'totalLengthCm',
  'inseamCm',
  'shoulderWidthCm',
  'sleeveLengthCm',
  'neckCm',
  'thighCm',
] as const
export type MeasurementKey = (typeof MEASUREMENT_KEYS)[number]
/** A variant's garment measurements in cm for AR Fitting; a measurement never filled in is null. */
export type Measurements = Record<MeasurementKey, number | null>

export interface ProductVariant {
  id: string
  sku: string
  name: string | null
  size: string | null
  color: string | null
  colorHex: string | null
  price: number
  stock: number
  imageUrl: string | null
  measurements: Measurements | null
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : null)

/** Shapes one variant from the API (a product detail, or the answer to adding or editing a variant). Size, colour and name may each be missing. */
export function toVariant(value: unknown): ProductVariant {
  if (!isRecord(value)) throw new ProductListError('server')
  const { id, sku, stock, price, measurements } = value
  if (typeof id !== 'string' || typeof sku !== 'string' || !isCount(stock) || !isCount(price)) throw new ProductListError('server')
  return {
    id,
    sku,
    name: text(value.name),
    size: text(value.size),
    color: text(value.color),
    colorHex: text(value.colorHex),
    price: price as number,
    stock: stock as number,
    imageUrl: text(value.imageUrl),
    measurements: isRecord(measurements)
      ? (Object.fromEntries(MEASUREMENT_KEYS.map((key) => [key, isCount(measurements[key]) ? measurements[key] : null])) as Measurements)
      : null,
  }
}

export interface ProductImageInfo {
  url: string
  altText: string | null
  displayOrder: number
  isPrimary: boolean
}

/** What the edit form starts from. */
export interface ProductDetailFields {
  description: string | null
  gender: Gender | null
  brand: string | null
  category: string
  images: ProductImageInfo[]
}

const GENDERS: readonly string[] = ['male', 'female', 'other', 'unisex']

function toDetail(body: unknown): { variants: ProductVariant[]; product: ProductDetailFields } {
  if (!isRecord(body) || !Array.isArray(body.variants)) throw new ProductListError('server')
  const images = Array.isArray(body.images) ? body.images.filter(isRecord) : []
  return {
    variants: body.variants.map(toVariant),
    product: {
      description: text(body.description),
      gender: typeof body.gender === 'string' && GENDERS.includes(body.gender) ? (body.gender as Gender) : null,
      brand: text(body.brand),
      category: typeof body.category === 'string' ? body.category : '',
      images: images
        .filter((image) => typeof image.url === 'string')
        .map((image, index) => ({
          url: image.url as string,
          altText: text(image.altText),
          displayOrder: isCount(image.displayOrder) ? (image.displayOrder as number) : index,
          isPrimary: image.isPrimary === true,
        }))
        .sort((a, b) => a.displayOrder - b.displayOrder),
    },
  }
}

/** GET /products/:id, reduced to the variants a staff member checks stock against and the fields the edit form needs. */
export async function fetchProductDetail(
  id: string,
  { signal }: RequestOptions = {},
): Promise<{ variants: ProductVariant[]; product?: ProductDetailFields }> {
  return toDetail(await request('GET', `/products/${encodeURIComponent(id)}`, undefined, signal))
}

/** A product's whole detail, for the product page: the list fields, its description and images, and every variant. */
export interface ProductFull extends ProductDetailFields {
  item: ProductListItem
  variants: ProductVariant[]
}

/** GET /products/:idOrSlug (a UUID is an id, anything else a slug). It answers for archived products too, so check `item.isActive`. */
export async function fetchProductFull(idOrSlug: string, { signal }: RequestOptions = {}): Promise<ProductFull> {
  const body = await request('GET', UUID.test(idOrSlug) ? `/products/${encodeURIComponent(idOrSlug)}` : `/products/slug/${encodeURIComponent(idOrSlug)}`, undefined, signal)
  const { variants, product } = toDetail(body)
  return { item: toDetailItem(body), variants, ...product }
}
