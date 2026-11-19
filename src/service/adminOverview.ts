// The three operations figures on the admin dashboard. Stock is read from the backend; refunds and AR-ready are answered from the sample data the staff pages use until the backend has them.
// None repeats the staff cards (AR sessions, sales, orders, units sold).
import { LOW_STOCK } from '../data/products'
import { ProductListError, request } from './fetchProductList'
import { getSampleProducts, loadSampleProducts } from './fetchStaffAnalytics'
import { isMoney, isRecord } from './ordersApi'
import { sampleTransactionSummary } from './sampleTransactions'
import { simulateRequest, type RequestOptions } from './simulateRequest'

export interface RefundFigures {
  returned: number
  orders: number
}

/** REPLACE: GET /orders/summary (the Transactions page's fetchTransactionSummary): `returnedCount` and `count` for all orders. */
export async function getRefundFigures({ signal, delayMs = 700 }: RequestOptions = {}): Promise<RefundFigures> {
  const { count, returnedCount } = await sampleTransactionSummary({}, { signal, delayMs })
  return { returned: returnedCount, orders: count }
}

export interface ArFigures {
  ready: number
  products: number
}

/** REPLACE: GET /products, counting `arReady` (needs the backend `Product.arReady` boolean, see ProductListItem) against `meta.total`. */
export async function getArFigures({ signal, delayMs = 700 }: RequestOptions = {}): Promise<ArFigures> {
  await simulateRequest(delayMs, signal, () => false)
  await loadSampleProducts()
  const products = getSampleProducts()
  return { ready: products.filter((p) => p.arReady).length, products: products.length }
}

export interface StockFigures {
  /** Products with 0 left. */
  out: number
  /** Products with 1 to LOW_STOCK left. */
  low: number
}

/** Connected: GET /products/metrics (staff and above), counting products with 0 left (out) and 1 to LOW_STOCK left (low). */
export async function getStockFigures({ signal }: Pick<RequestOptions, 'signal'> = {}): Promise<StockFigures> {
  const body = await request('GET', `/products/metrics?lowStockThreshold=${LOW_STOCK}`, undefined, signal)
  if (!isRecord(body) || !isMoney(body.outOfStockCount) || !isMoney(body.lowStockCount)) throw new ProductListError('server')
  return { out: body.outOfStockCount, low: body.lowStockCount }
}
