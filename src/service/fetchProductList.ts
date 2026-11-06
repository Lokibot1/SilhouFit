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
  // Optional: the list sends them, a product detail does not; hidden in the UI while they are missing.
  isActive?: boolean
  outOfStockVariants?: number
  variantCount?: number
  /** Distinct colours across the product's variants (the list only). */
  colors?: { name: string; hex: string }[]
  /** Distinct sizes across the product's variants, in the order the API found them (the list only). */
  sizes?: string[]
  /** The API's `isArReady`; the AR column shows a dash while it is missing. */
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
  /** Exact matches, ignoring case, sent as repeated keys. Size, colour, price and stock must all hold for the same variant. */
  sizes?: string[]
  /** Colour names, exact match ignoring case, sent as repeated keys (a name may hold a comma). */
  colors?: string[]
  /** Bounds on a variant's price. */
  minPrice?: number
  maxPrice?: number
  page?: number
  /** `in`: some variant has stock. `low`: some variant has 5 or fewer (sold out included). `out`: every variant is sold out. */
  stockLevel?: 'in' | 'low' | 'out'
  /** Only AR-ready products (`true`) or only those that are not (`false`); absent lists both. */
  isArReady?: boolean
  /** Price orders by the cheapest variant ascending and the priciest descending; products without variants come last. */
  sortBy?: 'createdAt' | 'name' | 'price'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  /** Staff only: the API answers 403 to anyone else when this is not `active`. Absent means active. */
  status?: 'active' | 'archived' | 'all'
}

/** The shape of a full product id; anything else is searched by name. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ProductListErrorKind = 'network' | 'rate-limit' | 'not-found' | 'server' | 'validation' | 'conflict' | 'forbidden'

// Lets a section pick accurate copy; 'not-found' is only raised for a product looked up by id or slug.
export class ProductListError extends Error {
  kind: ProductListErrorKind
  /** What the server said was wrong, when it said (a 400 or 409 on creating a product). */
  detail?: string
  /** The HTTP status, when the server answered (401 and 403 share the 'forbidden' kind). */
  status?: number
  /** The server's machine-readable `code` (`staff_not_found`, `weak_password`), when it sent one. */
  code?: string

  constructor(kind: ProductListErrorKind, detail?: string, status?: number, code?: string) {
    super(`Loading products failed (${kind}).`)
    this.kind = kind
    this.detail = detail
    this.status = status
    this.code = code
  }
}

const STATUS_KIND: Record<number, ProductListErrorKind> = { 400: 'validation', 401: 'forbidden', 403: 'forbidden', 404: 'not-found', 409: 'conflict', 429: 'rate-limit' }

/** The server's own message (Nest sends a string or a list of them) and its `code`, each undefined when the body does not have it. */
async function errorBody(response: Response): Promise<{ detail?: string; code?: string }> {
  try {
    const { message, code } = (await response.json()) as { message?: unknown; code?: unknown }
    const text = Array.isArray(message) ? message.filter((m) => typeof m === 'string').join('; ') : message
    return { detail: typeof text === 'string' && text ? text.slice(0, 300) : undefined, code: typeof code === 'string' ? code : undefined }
  } catch {
    return {}
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
  if (!response.ok) {
    const { detail, code } = await errorBody(response)
    throw new ProductListError(STATUS_KIND[response.status] ?? 'server', detail, response.status, code)
  }
  try {
    return await response.json()
  } catch {
    throw new ProductListError('server')
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isCount = (value: unknown) => typeof value === 'number' && Number.isFinite(value)

const isColour = (value: unknown): value is { name: string; hex: string } =>
  isRecord(value) && typeof value.name === 'string' && value.name !== '' && typeof value.hex === 'string'

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
    ...(typeof value.isArReady === 'boolean' && { arReady: value.isArReady }),
    ...(isCount(value.outOfStockVariants) && { outOfStockVariants: value.outOfStockVariants as number }),
    ...(isCount(value.variantCount) && { variantCount: value.variantCount as number }),
    ...(Array.isArray(value.colors) && { colors: value.colors.filter(isColour) }),
    ...(Array.isArray(value.sizes) && { sizes: value.sizes.filter((size): size is string => typeof size === 'string' && size !== '') }),
  }
}

const PRICE_KEYS = ['minPrice', 'maxPrice']

/**
 * GET /products. Active products unless `status` says otherwise (archived and all are staff only: anyone else gets a 'forbidden'
 * error); the API caps `limit` at 100. Backend need still open: a bulk or atomic stock endpoint (restock sends one PATCH per variant).
 */
export async function fetchProductList(params: ProductListParams, { signal }: RequestOptions = {}): Promise<PaginatedProducts> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) if (item.trim()) query.append(key, item.trim())
      continue
    }
    // The API rejects unknown values, so blanks, bad numbers and an unknown sort (`basePrice`) never go out.
    if (typeof value === 'string' && !value.trim()) continue
    if (typeof value === 'number' && (Number.isNaN(value) || (PRICE_KEYS.includes(key) && value < 0))) continue
    if (key === 'sortBy' && value !== 'createdAt' && value !== 'name' && value !== 'price') continue
    if (key === 'stockLevel' && value !== 'in' && value !== 'low' && value !== 'out') continue
    if (key === 'isArReady' && typeof value !== 'boolean') continue
    if (key === 'status' && value !== 'active' && value !== 'archived' && value !== 'all') continue
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
  isArReady: boolean
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
      isArReady: body.isArReady === true,
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
