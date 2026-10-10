import { CATEGORIES, LOW_STOCK, type Category, type Product } from '../data/products'

export type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc'
export type Availability = 'store' | 'online' | 'low'

export interface ProductFilters {
  /** Compared against the price a shopper pays (sale price when there is one). */
  minPrice?: number
  maxPrice?: number
  /** Matches any listed colour name. */
  colors?: string[]
  /** Matches any listed availability. */
  availability?: Availability[]
  arReady?: boolean
}

export interface ProductQuery extends ProductFilters {
  category: Category | 'all'
  q: string
  sort: SortKey
  page: number
  perPage: number
}

export interface ProductPage {
  items: Product[]
  total: number
  page: number
  pageCount: number
}

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
]
export const PER_PAGE_OPTIONS = [12, 24, 48]

export const AVAILABILITY: { value: Availability; label: string }[] = [
  { value: 'store', label: 'In store' },
  { value: 'online', label: 'Online' },
  { value: 'low', label: `Low stock (${LOW_STOCK} or fewer)` },
]

export const payablePrice = (product: Product) => product.salePrice ?? product.price

function hasAvailability(product: Product, wanted: Availability) {
  if (wanted === 'low') return product.stock > 0 && product.stock <= LOW_STOCK
  return product.stock > 0 && product.channels.includes(wanted)
}

function matchesSearch(product: Product, needle: string) {
  if (!needle) return true
  const haystack = [product.name, product.category, product.boutique, ...product.colors.map((c) => c.name)]
  return haystack.some((text) => text.toLowerCase().includes(needle))
}

const SORTERS: Record<SortKey, (a: Product, b: Product) => number> = {
  featured: () => 0,
  newest: (a, b) => b.addedAt.localeCompare(a.addedAt),
  'price-asc': (a, b) => payablePrice(a) - payablePrice(b),
  'price-desc': (a, b) => payablePrice(b) - payablePrice(a),
}

export function queryProducts(list: Product[], query: ProductQuery): ProductPage {
  const { category, sort, perPage, minPrice, maxPrice, colors, availability, arReady } = query
  const needle = query.q.trim().toLowerCase()

  const matched = list
    .filter((p) => category === 'all' || p.category === category)
    .filter((p) => matchesSearch(p, needle))
    .filter((p) => minPrice === undefined || payablePrice(p) >= minPrice)
    .filter((p) => maxPrice === undefined || payablePrice(p) <= maxPrice)
    .filter((p) => !colors?.length || p.colors.some((c) => colors.includes(c.name)))
    .filter((p) => !availability?.length || availability.some((a) => hasAvailability(p, a)))
    .filter((p) => !arReady || p.arReady)
    // Array.prototype.sort is stable, so equal keys keep the catalogue (featured) order.
    .sort(SORTERS[sort])

  const pageCount = Math.max(1, Math.ceil(matched.length / perPage))
  const page = Math.min(Math.max(1, Math.trunc(query.page) || 1), pageCount)
  return {
    items: matched.slice((page - 1) * perPage, page * perPage),
    total: matched.length,
    page,
    pageCount,
  }
}

/** Per-category counts for the pill row; "all" is the whole list. */
export function categoryCounts(list: Product[]): Record<Category | 'all', number> {
  const counts = { all: list.length } as Record<Category | 'all', number>
  for (const category of CATEGORIES) counts[category] = list.filter((p) => p.category === category).length
  return counts
}

/** Distinct colour names (with a swatch) for the filter panel, in first-seen order. */
export function colorOptions(list: Product[]) {
  const seen = new Map<string, string>()
  for (const product of list) for (const color of product.colors) if (!seen.has(color.name)) seen.set(color.name, color.hex)
  return [...seen].map(([name, hex]) => ({ name, hex }))
}
