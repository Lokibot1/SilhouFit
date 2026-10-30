import { CATEGORIES, type Category } from '../data/products'
import type { Gender, ProductListItem } from '../service/fetchProductList'
import { parseFilterPrice } from './format'

export const INVENTORY_SORTS = ['date', 'name', 'price'] as const
export type InventorySort = (typeof INVENTORY_SORTS)[number]
export type InventoryDir = 'asc' | 'desc'

/**
 * The API's `sortBy` for each URL sort. It cannot sort by price (that needs a backend field, and `basePrice` is a 400), so a price
 * sort asks for the default order, newest first, whatever its direction (see `apiSortOrder`).
 */
export const SORT_COLUMN = { date: 'createdAt', name: 'name', price: 'createdAt' } as const
export const apiSortOrder = (sort: InventorySort, dir: InventoryDir): InventoryDir => (sort === 'price' ? 'desc' : dir)
/** The way a column sorts when first chosen: newest first, A to Z, cheapest first. */
export const DEFAULT_DIR: Record<InventorySort, InventoryDir> = { date: 'desc', name: 'asc', price: 'asc' }

export const PER_PAGE_OPTIONS = [10, 25, 50]
const DEFAULT_PER_PAGE = 25
export const MAX_SEARCH = 100
/** Longest brand, size or colour typed into a filter. */
export const MAX_FILTER_TEXT = 50

export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
  { value: 'unisex', label: 'Unisex' },
  { value: 'other', label: 'Other' },
]

// Only `in` reaches the API (as inStockOnly). Out and sizes have no API filter, so they are kept but send nothing, and the list is not filtered on the client.
export const STOCK_FILTERS = ['in', 'out', 'sizes'] as const
export type StockFilter = (typeof STOCK_FILTERS)[number]

// `yes` is sent as isArReady=true and `no` as isArReady=false.
export const AR_FILTERS = ['yes', 'no'] as const
export type ArFilter = (typeof AR_FILTERS)[number]

export const STATUSES = ['active', 'archived'] as const
export type InventoryStatus = (typeof STATUSES)[number]

export interface InventoryQuery {
  /** Which products to list; absent from the URL means active. */
  status: InventoryStatus
  q: string
  category: Category | ''
  gender: Gender | ''
  /** Exact match on the brand, ignoring case; '' lists all. Likewise size and colour. */
  brand: string
  size: string
  color: string
  /** Bounds on a variant's price, when the URL has a valid amount. */
  minPrice?: number
  maxPrice?: number
  /** Only products with stock, only those sold out, or only those with a size sold out; '' lists all. */
  stock: StockFilter | ''
  /** Only AR Fitting ready products (`yes`) or only those that are not (`no`); '' lists all. */
  ar: ArFilter | ''
  sort: InventorySort
  dir: InventoryDir
  page: number
  per: number
}

/** Inner runs of whitespace become one space and the ends are trimmed, so "Ayala   Atelier " matches "Ayala Atelier". */
export const cleanFilterText = (value: string) => value.replace(/\s+/g, ' ').trim()
const text = (value: string | null) => cleanFilterText(value ?? '').slice(0, MAX_FILTER_TEXT)
export const parsePrice = parseFilterPrice

/** True when the minimum price is above the maximum, which can match nothing: the page shows an error instead of asking the API. */
export const priceRangeInvalid = ({ minPrice, maxPrice }: Pick<InventoryQuery, 'minPrice' | 'maxPrice'>) =>
  minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice

/** Reads the inventory URL. Anything not on a whitelist falls back to its default, so a hand-edited URL cannot reach the API. */
export function readInventoryQuery(params: URLSearchParams): InventoryQuery {
  const sort = INVENTORY_SORTS.find((s) => s === params.get('sort')) ?? 'date'
  const dir = params.get('dir')
  const page = Math.trunc(Number(params.get('page')))
  const per = Number(params.get('per'))
  return {
    status: params.get('status') === 'archived' ? 'archived' : 'active',
    q: (params.get('q') ?? '').trim().slice(0, MAX_SEARCH),
    category: CATEGORIES.find((c) => c.toLowerCase() === params.get('category')?.toLowerCase()) ?? '',
    gender: GENDERS.find((g) => g.value === params.get('gender'))?.value ?? '',
    brand: text(params.get('brand')),
    size: text(params.get('size')),
    color: text(params.get('color')),
    minPrice: parsePrice(params.get('minPrice')),
    maxPrice: parsePrice(params.get('maxPrice')),
    stock: STOCK_FILTERS.find((s) => s === params.get('stock')) ?? '',
    ar: AR_FILTERS.find((a) => a === params.get('ar')) ?? '',
    sort,
    dir: dir === 'asc' || dir === 'desc' ? dir : DEFAULT_DIR[sort],
    page: Number.isFinite(page) && page > 1 ? page : 1,
    per: PER_PAGE_OPTIONS.includes(per) ? per : DEFAULT_PER_PAGE,
  }
}

// Changing what is listed starts again from the first page; paging and sorting keep the page they are on.
const RESETS_PAGE = ['status', 'q', 'category', 'gender', 'brand', 'size', 'color', 'minPrice', 'maxPrice', 'stock', 'ar', 'per']

/** `withInventoryParams` changes that remove the search and every filter. */
export const CLEAR_FILTERS = { q: '', category: '', gender: '', brand: '', size: '', color: '', minPrice: '', maxPrice: '', stock: '', ar: '' }

/** How many filters are set (search not included). The two price bounds count as one. */
export const activeFilterCount = (query: InventoryQuery) =>
  [query.category, query.gender, query.brand, query.size, query.color, query.stock, query.ar].filter(Boolean).length +
  Number(query.minPrice !== undefined || query.maxPrice !== undefined)

/** The URL after `changes` (an empty value removes its key). Search, filter and page size writes reset the page. */
export function withInventoryParams(current: URLSearchParams, changes: Partial<Record<string, string>>): URLSearchParams {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value)
    else next.delete(key)
  }
  if (Object.keys(changes).some((key) => RESETS_PAGE.includes(key)) && !('page' in changes)) next.delete('page')
  return next
}

// A product is active unless the list says so otherwise (`isActive` comes with each list item; the Archived tab asks for status=archived).
export const isArchived = (product: ProductListItem) => product.isActive === false
/** Sold out and still for sale: the products a Restock action is for. */
export const isSoldOut = (product: ProductListItem) => !isArchived(product) && product.totalStock <= 0
