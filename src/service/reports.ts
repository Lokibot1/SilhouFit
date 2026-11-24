import { LOW_STOCK } from '../data/products'
import { resolvePeriod, resolveSalesWindow, type PeriodFilterValue } from '../utils/period'
import { getStockFigures } from './adminOverview'
import { fetchAdminOrders } from './adminOrdersApi'
import { fetchAdminTransactions, type AdminTransactionRow } from './adminTransactionsApi'
import { fetchProductDetail, fetchProductList, type ProductListItem } from './fetchProductList'
import { fetchProductMix, fetchSalesSeries, fetchTrendingItems, type ProductMixItem, type SalesDay, type TrendingItem } from './fetchStaffAnalytics'
import type { RequestOptions } from './simulateRequest'

// The data behind the downloadable reports. Only figures the API really has: sales, orders, best sellers, category units and stock.
// (AR try-ons, product views, wishlist adds and stock changes are not recorded yet, so no report is built on them.)

export interface SalesReport {
  /** "Monthly totals" and where the buckets run, from the Sales chart's window. */
  seriesScope: string
  granularity: string
  /** Where best sellers, category units and the order count are measured: the chosen period. */
  periodScope: string
  start: string
  end: string
  series: SalesDay[]
  revenue: number
  orders: number
  bestSellers: TrendingItem[]
  mix: ProductMixItem[]
}

/** Sales, orders and best sellers for the period; one failed request fails the report, so no half-empty file is made. */
export async function loadSalesReport(filter: PeriodFilterValue, { signal }: Pick<RequestOptions, 'signal'> = {}): Promise<SalesReport> {
  const window = resolveSalesWindow(filter)
  const period = resolvePeriod(filter)
  const [series, bestSellers, mix, orders] = await Promise.all([
    fetchSalesSeries({ signal, filter }),
    fetchTrendingItems({ signal, filter }),
    fetchProductMix({ signal, filter }),
    period.end < period.start ? Promise.resolve(0) : fetchAdminOrders({ from: period.start, to: period.end, limit: 1 }, { signal }).then((page) => page.meta.total),
  ])
  return {
    seriesScope: window.scope,
    granularity: window.granularity,
    periodScope: period.scope,
    start: period.start,
    end: period.end,
    series,
    revenue: series.filter((s) => s.date >= period.start && s.date <= period.end).reduce((sum, s) => sum + s.total, 0),
    orders,
    bestSellers,
    mix,
  }
}

export interface TransactionsReport {
  periodScope: string
  start: string
  end: string
  rows: AdminTransactionRow[]
  /** Payments that exist in the period; more than `rows` when the list was cut at the cap. */
  total: number
  /** The three volumes count paid payments only, like the Transactions page. */
  paidCount: number
  gross: number
  fees: number
  net: number
}

const TRANSACTIONS_PAGE = 100
const TRANSACTIONS_CAP = 5000

/** Every payment in the period, newest first, up to 5,000; one failed request fails the report, so no half-empty file is made. */
export async function loadTransactionsReport(filter: PeriodFilterValue, { signal }: Pick<RequestOptions, 'signal'> = {}): Promise<TransactionsReport> {
  const period = resolvePeriod(filter)
  const rows: AdminTransactionRow[] = []
  let total = 0
  if (period.end >= period.start) {
    for (let page = 1; rows.length < TRANSACTIONS_CAP; page++) {
      const result = await fetchAdminTransactions({ page, limit: TRANSACTIONS_PAGE, from: period.start, to: period.end, sortBy: 'createdAt', sortOrder: 'desc' }, { signal })
      total = result.meta.total
      rows.push(...result.data)
      if (page >= result.meta.totalPages || result.data.length === 0) break
    }
  }
  const paid = rows.filter((r) => r.status === 'PAID')
  return {
    periodScope: period.scope,
    start: period.start,
    end: period.end,
    rows,
    total,
    paidCount: paid.length,
    gross: paid.reduce((sum, r) => sum + r.amount, 0),
    fees: paid.reduce((sum, r) => sum + (r.fee ?? 0), 0),
    net: paid.reduce((sum, r) => sum + (r.net ?? 0), 0),
  }
}

export interface StockOverview {
  products: number
  low: number
  out: number
  inStock: number
}

/** The stock picture in two cheap requests (the product count and the dashboard's low and sold-out counts), for the page's preview. Counts products, not sizes. */
export async function loadStockOverview({ signal }: Pick<RequestOptions, 'signal'> = {}): Promise<StockOverview> {
  const [page, figures] = await Promise.all([fetchProductList({ page: 1, limit: 1, status: 'active' }, { signal }), getStockFigures({ signal })])
  const products = page.meta.total
  return { products, low: figures.low, out: figures.out, inStock: Math.max(0, products - figures.low - figures.out) }
}

export interface StockRow {
  product: string
  category: string
  size: string
  colour: string
  sku: string
  stock: number
}
export interface InventoryReport {
  rows: StockRow[]
  products: number
  units: number
  low: StockRow[]
  out: StockRow[]
  lowThreshold: number
}

const PAGE = 100
const CONCURRENCY = 6

/** Every active product with its stock per size and colour. The list has no per-variant stock, so each product's detail is read, a few at a time. */
export async function loadInventoryReport({ signal }: Pick<RequestOptions, 'signal'> = {}): Promise<InventoryReport> {
  const products: ProductListItem[] = []
  for (let page = 1; ; page++) {
    const { data, meta } = await fetchProductList({ page, limit: PAGE, status: 'active', sortBy: 'name', sortOrder: 'asc' }, { signal })
    products.push(...data)
    if (!meta.hasNextPage || data.length === 0) break
  }

  const rows: StockRow[][] = new Array(products.length)
  let next = 0
  async function worker() {
    while (next < products.length) {
      const at = next++
      const item = products[at]
      const { variants } = await fetchProductDetail(item.id, { signal })
      rows[at] = variants.map((v) => ({ product: item.name, category: item.category, size: v.size ?? '', colour: v.color ?? '', sku: v.sku, stock: v.stock }))
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, products.length) }, worker))

  const flat = rows.flat()
  return {
    rows: flat,
    products: products.length,
    units: flat.reduce((sum, r) => sum + r.stock, 0),
    low: flat.filter((r) => r.stock > 0 && r.stock <= LOW_STOCK),
    out: flat.filter((r) => r.stock === 0),
    lowThreshold: LOW_STOCK,
  }
}
