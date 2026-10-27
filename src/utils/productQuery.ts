import { LOW_STOCK, type Category, type Product, type ProductGender } from '../data/products'
import type { ProductListParams } from '../service/fetchProductList'

export type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc'
export type Availability = 'store' | 'online' | 'low'

/** Sizes offered as one-tap choices in filters; any other size can be typed where the screen allows. */
export const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

export interface ProductFilters {
  /** Bounds on a variant's price. */
  minPrice?: number
  maxPrice?: number
  /** One colour name (the API takes one). */
  color?: string
  /** Matches any listed availability. Only `online` reaches the API (as inStockOnly); store and low stock need a backend field. */
  availability?: Availability[]
  /** Needs a backend `arReady` field on products: kept in the URL and the dialog, never sent. */
  arReady?: boolean
  /** Exact match, ignoring case. */
  brand?: string
  gender?: ProductGender
  /** Exact match, ignoring case. */
  size?: string
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

// The API sorts by date or name only. Featured and the price sorts have no backend field, so they ask for newest first.
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name-asc', label: 'Name: A to Z' },
  { value: 'name-desc', label: 'Name: Z to A' },
]
export const PER_PAGE_OPTIONS = [12, 24, 48]

export const AVAILABILITY: { value: Availability; label: string }[] = [
  { value: 'store', label: 'In store' },
  { value: 'online', label: 'Online' },
  { value: 'low', label: `Low stock (${LOW_STOCK} or fewer)` },
]

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
  'price-asc': NEWEST,
  'price-desc': NEWEST,
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
    size: query.size,
    color: query.color,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    inStockOnly: query.availability?.includes('online') || undefined,
    ...API_SORT[query.sort],
    page: Math.max(1, Math.trunc(query.page) || 1),
    limit: query.perPage,
  }
}
