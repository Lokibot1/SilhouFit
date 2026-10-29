import { ProductListError, request } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'

export interface ProductFilterOptions {
  categories: string[]
  brands: string[]
  /** Alphabetical, as the API sends them; order them for display with `orderSizes`. */
  sizes: string[]
  /** One per name; null when the API sent no swatch colour. */
  colors: { name: string; hex: string | null }[]
  /** The variant price range of the active products; 0 and 0 when there are none. */
  minPrice: number
  maxPrice: number
}

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : [])
const amount = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

/** GET /products/filters: what the active products offer, in one request. Public. */
export async function fetchProductFilters({ signal }: RequestOptions = {}): Promise<ProductFilterOptions> {
  const body = await request('GET', '/products/filters', undefined, signal)
  if (typeof body !== 'object' || body === null) throw new ProductListError('server')
  const { categories, brands, sizes, colors, minPrice, maxPrice } = body as Record<string, unknown>
  const byName = new Map<string, { name: string; hex: string | null }>()
  for (const entry of Array.isArray(colors) ? colors : []) {
    if (typeof entry !== 'object' || entry === null) continue
    const { name, hex } = entry as Record<string, unknown>
    if (typeof name === 'string' && name !== '' && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), { name, hex: typeof hex === 'string' && hex !== '' ? hex : null })
  }
  return { categories: strings(categories), brands: strings(brands), sizes: strings(sizes), colors: [...byName.values()], minPrice: amount(minPrice), maxPrice: amount(maxPrice) }
}
