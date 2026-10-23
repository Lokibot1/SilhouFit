import type { RequestOptions } from './simulateRequest'
import { getSupabase } from './supabase'

export interface ProductListItem {
  id: string
  name: string
  category: string
  brand: string | null
  minPrice: number
  maxPrice: number
  totalStock: number
  primaryImage: { url: string; altText: string | null } | null
  createdAt: string
}

export interface PaginatedProducts {
  data: ProductListItem[]
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean }
}

export interface ProductListParams {
  search?: string
  inStockOnly?: boolean
  sortBy?: 'createdAt' | 'basePrice' | 'name'
  sortOrder?: 'asc' | 'desc'
  limit?: number
}

export type ProductListErrorKind = 'network' | 'rate-limit' | 'not-found' | 'server'

// Lets a section pick accurate copy; 'not-found' is only raised for a product looked up by id.
export class ProductListError extends Error {
  kind: ProductListErrorKind

  constructor(kind: ProductListErrorKind) {
    super(`Loading products failed (${kind}).`)
    this.kind = kind
  }
}

const STATUS_KIND: Record<number, ProductListErrorKind> = { 404: 'not-found', 429: 'rate-limit' }

// Same request shape as fetchMe: the Supabase token rides along, and an abort rejects with the AbortError itself.
async function get(path: string, signal?: AbortSignal): Promise<unknown> {
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
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal,
    })
  } catch (failure) {
    if (signal?.aborted) throw failure
    throw new ProductListError('network')
  }
  if (!response.ok) throw new ProductListError(STATUS_KIND[response.status] ?? 'server')
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
    category,
    brand: typeof value.brand === 'string' ? value.brand : null,
    minPrice: minPrice as number,
    maxPrice: maxPrice as number,
    totalStock: totalStock as number,
    primaryImage: isRecord(image) && typeof image.url === 'string' ? { url: image.url, altText: typeof image.altText === 'string' ? image.altText : null } : null,
    createdAt: typeof createdAt === 'string' ? createdAt : '',
  }
}

/** GET /products. Active products only; the API caps `limit` at 100. */
export async function fetchProductList(params: ProductListParams, { signal }: RequestOptions = {}): Promise<PaginatedProducts> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value))
  const body = await get(`/products?${query}`, signal)
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

/** GET /products/:id. The API answers with the detail shape, so price range and stock are worked out from its variants. */
export async function fetchProductById(id: string, { signal }: RequestOptions = {}): Promise<ProductListItem> {
  const body = await get(`/products/${encodeURIComponent(id)}`, signal)
  if (!isRecord(body) || !Array.isArray(body.variants) || !Array.isArray(body.images) || !isCount(body.basePrice)) throw new ProductListError('server')
  const variants = body.variants.filter(isRecord)
  const prices = variants.map((variant) => (isCount(variant.effectivePrice) ? (variant.effectivePrice as number) : (body.basePrice as number)))
  const images = body.images.filter(isRecord)
  return toListItem({
    ...body,
    minPrice: prices.length ? Math.min(...prices) : body.basePrice,
    maxPrice: prices.length ? Math.max(...prices) : body.basePrice,
    totalStock: variants.reduce((sum, variant) => sum + (isCount(variant.stock) ? (variant.stock as number) : 0), 0),
    primaryImage: images.find((image) => image.isPrimary === true) ?? images[0] ?? null,
  })
}
