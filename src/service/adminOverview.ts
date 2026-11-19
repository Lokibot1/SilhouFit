// The three operations figures on the admin dashboard. Stock and AR-ready are read from the backend (one GET /products/metrics serves both); refunds are answered from the sample data the staff pages use until the backend has them.
// None repeats the staff cards (AR sessions, sales, orders, units sold).
import { LOW_STOCK } from '../data/products'
import { ProductListError, request } from './fetchProductList'
import { isMoney, isRecord } from './ordersApi'
import { sampleTransactionSummary } from './sampleTransactions'
import type { RequestOptions } from './simulateRequest'

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

/** Connected: GET /products/metrics (staff and above), `arReadyProducts` against `totalProducts` (active products only). */
export async function getArFigures({ signal }: Pick<RequestOptions, 'signal'> = {}): Promise<ArFigures> {
  const body = await readProductMetrics(signal)
  if (!isMoney(body.arReadyProducts) || !isMoney(body.totalProducts)) throw new ProductListError('server')
  return { ready: body.arReadyProducts, products: body.totalProducts }
}

export interface StockFigures {
  /** Products with 0 left. */
  out: number
  /** Products with 1 to LOW_STOCK left. */
  low: number
}

/** Connected: GET /products/metrics (staff and above), counting products with 0 left (out) and 1 to LOW_STOCK left (low). */
export async function getStockFigures({ signal }: Pick<RequestOptions, 'signal'> = {}): Promise<StockFigures> {
  const body = await readProductMetrics(signal)
  if (!isMoney(body.outOfStockCount) || !isMoney(body.lowStockCount)) throw new ProductListError('server')
  return { out: body.outOfStockCount, low: body.lowStockCount }
}

// The AR-ready and stock cards load together and both need GET /products/metrics, so they share one request while it is in flight.
// The request itself carries no signal (one card leaving must not cancel it for the other); each caller still stops waiting when its own signal aborts.
let metricsInFlight: Promise<Record<string, unknown>> | null = null
function readProductMetrics(signal?: AbortSignal): Promise<Record<string, unknown>> {
  metricsInFlight ??= request('GET', `/products/metrics?lowStockThreshold=${LOW_STOCK}`, undefined, undefined)
    .then((body) => {
      if (!isRecord(body)) throw new ProductListError('server')
      return body
    })
    .finally(() => {
      metricsInFlight = null
    })
  const read = metricsInFlight
  if (!signal) return read
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'))
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    read.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
