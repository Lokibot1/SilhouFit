import { type Category, type Product, type ProductGender } from '../data/products'
import type { ProductListParams } from '../service/fetchProductList'

export type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc' | 'low-stock'

/** Sizes offered as one-tap choices in filters; any other size can be typed where the screen allows. */
export const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

/** Sizes for display: XS to XXL first, then numbers ascending, then the rest alphabetically, and "One size" last. */
export function orderSizes(sizes: readonly string[]): string[] {
  const rank = (size: string) => {
    const lower = size.toLowerCase()
    if (lower === 'one size') return [3, 0]
    const common = COMMON_SIZES.findIndex((s) => s.toLowerCase() === lower)
    if (common >= 0) return [0, common]
    const number = Number(size)
    return size.trim() !== '' && Number.isFinite(number) ? [1, number] : [2, 0]
  }
  return [...sizes].sort((a, b) => {
    const [groupA, valueA] = rank(a)
    const [groupB, valueB] = rank(b)
    return groupA - groupB || valueA - valueB || a.localeCompare(b)
  })
}

export interface ProductFilters {
  /** Bounds on a variant's price. */
  minPrice?: number
  maxPrice?: number
  /** Colour names; a piece matches when it comes in any of them. */
  colors?: string[]
  /** Only AR-ready products; sent as `isArReady=true`. */
  arReady?: boolean
  /** Exact match, ignoring case. */
  brand?: string
  gender?: ProductGender
  /** Exact match, ignoring case; a piece matches when it comes in any of them. */
  sizes?: string[]
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

// The API sorts by date, name or price. Featured and low stock first have no backend equivalent, so they ask for newest first.
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name-asc', label: 'Name: A to Z' },
  { value: 'name-desc', label: 'Name: Z to A' },
  { value: 'low-stock', label: 'Low stock first' },
]
export const PER_PAGE_OPTIONS = [12, 24, 48]

export const GENDER_OPTIONS: { value: ProductGender; label: string }[] = [
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
  { value: 'unisex', label: 'Unisex' },
  { value: 'other', label: 'Other' },
]

/** The page heading for a shop URL, so the route fallback can show it before any data arrives. */
export function shopTitle(params: URLSearchParams) {
  return params.get('category')?.trim().slice(0, 50) || 'All pieces'
}

const NEWEST = { sortBy: 'createdAt', sortOrder: 'desc' } as const
const API_SORT: Record<SortKey, Pick<ProductListParams, 'sortBy' | 'sortOrder'>> = {
  featured: NEWEST,
  'price-asc': { sortBy: 'price', sortOrder: 'asc' },
  'price-desc': { sortBy: 'price', sortOrder: 'desc' },
  'low-stock': NEWEST,
  newest: { sortBy: 'createdAt', sortOrder: 'desc' },
  'name-asc': { sortBy: 'name', sortOrder: 'asc' },
  'name-desc': { sortBy: 'name', sortOrder: 'desc' },
}

/** The shop query as GET /products takes it. */
export function toApiParams(query: ProductQuery): ProductListParams {
  return {
    search: query.q.trim() || undefined,
    category: query.category === 'all' ? undefined : query.category,
    brand: query.brand,
    gender: query.gender,
    sizes: query.sizes,
    colors: query.colors,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    isArReady: query.arReady || undefined,
    ...API_SORT[query.sort],
    page: Math.max(1, Math.trunc(query.page) || 1),
    limit: query.perPage,
  }
}
