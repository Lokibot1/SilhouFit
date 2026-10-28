// The three operations figures on the admin dashboard, each answered from the sample data the staff pages use until the backend has them.
// None repeats the staff cards (AR sessions, sales, orders, units sold).
import { LOW_STOCK } from '../data/products'
import { getSampleProducts, loadSampleProducts } from './fetchStaffAnalytics'
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

/** REPLACE: GET /products, counting `totalStock` of 0 (out) and 1 to LOW_STOCK (low). */
export async function getStockFigures({ signal, delayMs = 700 }: RequestOptions = {}): Promise<StockFigures> {
  await simulateRequest(delayMs, signal, () => false)
  await loadSampleProducts()
  const products = getSampleProducts()
  return { out: products.filter((p) => p.stock <= 0).length, low: products.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK).length }
}
