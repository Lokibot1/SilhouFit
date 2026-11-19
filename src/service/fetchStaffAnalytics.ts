import { defaultFilter, manilaToday, mondayOf, resolvePeriod, resolveSalesWindow, type Granularity, type PeriodFilterValue } from '../utils/period'
import type { VatClass } from '../utils/invoiceTax'
import { ProductListError, request } from './fetchProductList'
import { PAYMENT_METHODS, type Buyer, type PaymentMethod } from './fetchTransactions'
import { isMoney, isRecord } from './ordersApi'
import { simulateRequest, type RequestOptions } from './simulateRequest'

// The staff dashboard's figures. fetchStaffSummary, fetchSalesSeries, fetchProductMix and fetchTrendingItems call the API's
// /analytics endpoints (staff role or above). The API rejects query keys it does not know, so only the keys below are sent.
// The rest of this file is the sample-order generator, still read by Transactions, Refunds, Promotions, AR Insights and the
// admin overview, which the backend cannot answer yet. fetchOrderLog is no longer read by the dashboard: its Recent orders
// tile reads GET /admin/orders (service/adminOrdersApi).

/** True while some pages still show placeholder figures (AR Insights); the dashboard marks its own placeholder tiles instead. */
export const SAMPLE_DATA = true

export interface StaffSummary {
  /** Unique users who tried the AR Fitting this month. */
  arSessions: number
  salesTotal: number
  /** Orders placed this month. */
  orderCount: number
  /** Units sold, not orders. */
  unitsSold: number
  /** Average order value: sales divided by orders, in pesos (0 with no orders). */
  aov: number
  /** Percent change against the same days of last month, one decimal; null when last month had none to compare. */
  arChange: number | null
  salesChange: number | null
  ordersChange: number | null
  /** YYYY-MM-DD: the first day of the month and today. */
  periodStart: string
  periodEnd: string
}
export interface SalesDay {
  date: string
  total: number
}
export interface ProductMixItem {
  category: string
  units: number
}
export interface TrendingItem {
  productId: string
  name: string
  category: string
  /** Orders in the period that contain the item. An order counts once, however many pieces it has. */
  orders: number
  /** Pieces on hand now. */
  stock: number
  /** Whole percent of `orders` where the shopper tried the item in AR Fitting first; null when it has no AR Fitting. */
  arConversion: number | null
}
export interface LoggedOrder {
  orderId: string
  customerName: string
  /** ISO time. */
  placedAt: string
  itemCount: number
  total: number
}

type Section = 'log'

// Dev-only hooks for the error and empty states of the sample generator: /staff?fail=log, /staff?fail=empty.
export const failParam = () => (import.meta.env.DEV ? new URLSearchParams(location.search).get('fail') : null)

async function respond(section: Section, signal: AbortSignal | undefined, delayMs: number) {
  await simulateRequest(delayMs, signal, () => failParam() === section).catch((error: Error) => {
    throw error.name === 'AbortError' ? error : Object.assign(error, { kind: 'network' })
  })
}

const FIRST_NAMES = ['Maria', 'Jose', 'Angelica', 'Juan', 'Katrina', 'Mark', 'Bea', 'Paolo', 'Jasmine', 'Carlo', 'Trisha', 'Miguel', 'Camille', 'Gabriel', 'Nicole', 'Rafael', 'Andrea', 'Joshua', 'Patricia', 'Christian', 'Denise', 'Lorenzo', 'Isabel', 'Kevin']
const LAST_NAMES = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Dela Cruz', 'Villanueva', 'Aquino', 'Ramos', 'Castillo', 'Navarro', 'Pascual', 'Domingo', 'Soriano', 'Manalo', 'Hernandez', 'Lim']

/** Small seeded generator, so a given month always yields the same numbers. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const seedOf = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0

const pad = (n: number) => String(n).padStart(2, '0')

/** What the sample orders need of a product. */
export interface SampleProduct {
  id: string
  name: string
  category: string
  price: number
  stock: number
  arReady: boolean
  /** The product's photo; the built-in products borrow the landing gallery's pictures. */
  imageUrl?: string
}

const MOCK_PRODUCTS: SampleProduct[] = [
  { id: 'mock-01', name: 'Fence-Line Blazer', category: 'Jackets', price: 3490, stock: 4, arReady: true, imageUrl: '/images/gallery/blazer.webp' },
  { id: 'mock-02', name: 'Washed Black Tee', category: 'Tops', price: 790, stock: 0, arReady: true, imageUrl: '/images/gallery/black-tees.webp' },
  { id: 'mock-03', name: 'Heritage Polo', category: 'Tops', price: 1290, stock: 6, arReady: true, imageUrl: '/images/gallery/striped-polo.webp' },
  { id: 'mock-04', name: 'Tapered Chino', category: 'Bottoms', price: 1890, stock: 32, arReady: true, imageUrl: '/images/gallery/folded-jeans.webp' },
  { id: 'mock-05', name: 'Relaxed Denim', category: 'Bottoms', price: 2290, stock: 25, arReady: true, imageUrl: '/images/gallery/jeans-on-hanger.webp' },
  { id: 'mock-06', name: 'Coach Jacket', category: 'Jackets', price: 2790, stock: 18, arReady: false, imageUrl: '/images/gallery/jackets-on-hooks.webp' },
  { id: 'mock-07', name: 'Linen Overshirt', category: 'Tops', price: 1990, stock: 14, arReady: true, imageUrl: '/images/gallery/white-shirt-rail.webp' },
  { id: 'mock-08', name: 'Pleated Midi Skirt', category: 'Skirts', price: 1590, stock: 21, arReady: true },
  { id: 'mock-09', name: 'Ribbed Knit Dress', category: 'Dresses', price: 2490, stock: 9, arReady: true, imageUrl: '/images/gallery/dress-on-hanger.webp' },
  { id: 'mock-10', name: 'Wrap Dress', category: 'Dresses', price: 2690, stock: 12, arReady: false, imageUrl: '/images/gallery/floral-dresses.webp' },
  { id: 'mock-11', name: 'Canvas Belt', category: 'Accessories', price: 590, stock: 40, arReady: false },
  { id: 'mock-12', name: 'Bucket Hat', category: 'Accessories', price: 690, stock: 27, arReady: false },
]

let sampleProducts: SampleProduct[] = MOCK_PRODUCTS

/** The products the sample orders are drawn from. */
export const getSampleProducts = () => sampleProducts

/** Test seam: the products the sample orders are drawn from. */
export function setSampleProducts(products: SampleProduct[]) {
  sampleProducts = products
  pastMonths.clear()
}

/** The sample orders use the built-in products above, so the dashboard needs no backend; kept async so callers need not change. */
export function loadSampleProducts(): Promise<void> {
  return Promise.resolve()
}

interface MonthOrder extends LoggedOrder {
  date: string
  /** Unique across months (order ids restart every month), for counting orders over several months. */
  key: string
  lines: { productId: string; name: string; category: string; units: number; price: number; usedAr: boolean }[]
}

interface Month {
  today: string
  start: string
  days: string[]
  orders: MonthOrder[]
  arUsers: number
}

/**
 * Every order of one month, oldest first. `lastDay` is how many days to generate; `cutoffMinutes` stops the last
 * day at that Manila time (null for a full day). A given month always yields the same orders.
 */
function buildMonthOrders(monthKey: string, lastDay: number, cutoffMinutes: number | null) {
  const rand = mulberry32(seedOf(monthKey))
  const arRand = mulberry32(seedOf(`${monthKey}-ar`))
  const convRand = mulberry32(seedOf(`${monthKey}-conv`))
  // Each AR-ready item has its own steady share of orders that started in AR Fitting.
  const rateOf = (id: string) => 0.2 + 0.4 * ((seedOf(id) % 100) / 100)
  // A fixed shuffle per month, then a long-tailed pick, gives clear best sellers.
  const ranked = sampleProducts.map((product) => ({ product, key: rand() }))
    .sort((a, b) => a.key - b.key)
    .map((r) => r.product)
  const weights = ranked.map((_, i) => 1 / (i + 1) ** 0.9)
  const weightTotal = weights.reduce((sum, w) => sum + w, 0)
  const pick = () => {
    let r = rand() * weightTotal
    return ranked[weights.findIndex((w) => (r -= w) < 0)] ?? ranked[0]
  }

  const days: string[] = []
  const orders: MonthOrder[] = []
  let arUsers = 0
  for (let day = 1; day <= lastDay; day++) {
    const date = `${monthKey}-${pad(day)}`
    days.push(date)
    arUsers += 3 + arRand() * 5
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    const count = ranked.length === 0 ? 0 : 4 + Math.floor(rand() * 7) + (weekday === 0 || weekday >= 5 ? 3 : 0)
    const dayOrders: MonthOrder[] = []
    for (let n = 0; n < count; n++) {
      const minute = 9 * 60 + Math.floor(rand() * 12 * 60)
      const customerName = `${FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)]}`
      const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => {
        const product = pick()
        const usedAr = convRand() < rateOf(product.id) && product.arReady
        return { productId: product.id, name: product.name, category: product.category, units: rand() < 0.8 ? 1 : 2, price: product.price, usedAr }
      })
      // The last day's orders stop at the cutoff (today: the current time).
      if (day === lastDay && cutoffMinutes !== null && minute > cutoffMinutes) continue
      dayOrders.push({
        orderId: '',
        key: '',
        customerName,
        placedAt: new Date(`${date}T${pad(Math.floor(minute / 60))}:${pad(minute % 60)}:00+08:00`).toISOString(),
        itemCount: lines.reduce((sum, l) => sum + l.units, 0),
        total: lines.reduce((sum, l) => sum + l.units * l.price, 0),
        date,
        lines,
      })
    }
    orders.push(...dayOrders.sort((a, b) => a.placedAt.localeCompare(b.placedAt)))
  }
  orders.forEach((order, i) => {
    order.orderId = `SF-${10001 + i}`
    order.key = `${monthKey}:${order.orderId}`
  })

  return { days, orders, arUsers }
}

/** Every order of the current month up to now, oldest first. The summary and the order log read from this. */
function buildMonth(): Month {
  const { date: today, minutes } = manilaToday()
  const monthKey = today.slice(0, 7)
  const { days, orders, arUsers } = buildMonthOrders(monthKey, Number(today.slice(8)), minutes)
  const empty = failParam() === 'empty'
  return { today, start: `${monthKey}-01`, days, orders: empty ? [] : orders, arUsers: empty ? 0 : Math.round(arUsers * 0.75) }
}

const previousMonth = (key: string) => (key.endsWith('-01') ? `${Number(key.slice(0, 4)) - 1}-12` : `${key.slice(0, 5)}${pad(Number(key.slice(5)) - 1)}`)
const nextMonth = (key: string) => (key.endsWith('-12') ? `${Number(key.slice(0, 4)) + 1}-01` : `${key.slice(0, 5)}${pad(Number(key.slice(5)) + 1)}`)

// A finished month never changes, so it is built once.
const pastMonths = new Map<string, MonthOrder[]>()

/** The orders dated inside the period, oldest first, across as many months as it spans. */
function ordersFor(period: { start: string; end: string }): MonthOrder[] {
  if (failParam() === 'empty' || period.end < period.start) return []
  const now = manilaToday()
  const currentKey = now.date.slice(0, 7)
  const found: MonthOrder[] = []
  for (let key = period.start.slice(0, 7); key <= period.end.slice(0, 7); key = nextMonth(key)) {
    let orders = pastMonths.get(key)
    if (key === currentKey) orders = buildMonthOrders(key, Number(now.date.slice(8)), now.minutes).orders
    else if (!orders) {
      orders = buildMonthOrders(key, new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5)), 0)).getUTCDate(), null).orders
      pastMonths.set(key, orders)
    }
    found.push(...orders.filter((order) => order.date >= period.start && order.date <= period.end))
  }
  return found
}

const bad = () => new ProductListError('server')
const isChange = (value: unknown) => value === null || isMoney(value)

/** GET /analytics/summary: this month so far, in Asia/Manila. The server picks the month, so no query is sent. */
export async function fetchStaffSummary({ signal }: RequestOptions = {}): Promise<StaffSummary> {
  const body = await request('GET', '/analytics/summary', undefined, signal)
  if (!isRecord(body)) throw bad()
  const { arSessions, salesTotal, orderCount, unitsSold, aov, arChange, salesChange, ordersChange, periodStart, periodEnd } = body
  if (![arSessions, salesTotal, orderCount, unitsSold, aov].every(isMoney) || ![arChange, salesChange, ordersChange].every(isChange)) throw bad()
  if (typeof periodStart !== 'string' || typeof periodEnd !== 'string') throw bad()
  return { arSessions, salesTotal, orderCount, unitsSold, aov, arChange, salesChange, ordersChange, periodStart, periodEnd } as StaffSummary
}

type FilterOptions = RequestOptions & { filter?: PeriodFilterValue }

const max = (a: string, b: string) => (a > b ? a : b)

/** The start of the bucket holding `date`; a week is clipped to the window's start. */
export function bucketOf(date: string, granularity: Granularity, start: string, inMonth = false) {
  switch (granularity) {
    case 'day':
      return date
    case 'week':
      // Inside one month a week is days 1 to 7, 8 to 14, 15 to 21 and 22 to the end, so there are always four.
      return inMonth ? `${date.slice(0, 8)}${pad(Math.min(Math.floor((Number(date.slice(8)) - 1) / 7), 3) * 7 + 1)}` : max(mondayOf(date), start)
    case 'month':
      return `${date.slice(0, 7)}-01`
    case 'quarter':
      return `${date.slice(0, 4)}-${pad(Math.floor((Number(date.slice(5, 7)) - 1) / 3) * 3 + 1)}-01`
    case 'year':
      return `${date.slice(0, 4)}-01-01`
  }
}

/** GET /analytics/sales: one bucket per day, week, month, quarter or year, dated by its start; the server fills quiet buckets with zero and a future year gives none. */
export async function fetchSalesSeries({ signal, filter = defaultFilter() }: FilterOptions = {}): Promise<SalesDay[]> {
  const query = new URLSearchParams({ interval: resolveSalesWindow(filter).granularity, year: String(filter.year) })
  if (filter.month) query.set('month', String(filter.month))
  const body = await request('GET', `/analytics/sales?${query}`, undefined, signal)
  if (!Array.isArray(body)) throw bad()
  return body.map((row): SalesDay => {
    if (!isRecord(row) || typeof row.date !== 'string' || !isMoney(row.total)) throw bad()
    return { date: row.date, total: row.total }
  })
}

/** The inclusive Manila dates the period covers; null when it has not begun (a future year), so nothing is asked. */
function rangeQuery(filter: PeriodFilterValue) {
  const { start, end } = resolvePeriod(filter)
  return end < start ? null : new URLSearchParams({ from: start, to: end })
}

/** GET /analytics/product-mix: units per category over the period, largest first. */
export async function fetchProductMix({ signal, filter = defaultFilter() }: FilterOptions = {}): Promise<ProductMixItem[]> {
  const query = rangeQuery(filter)
  if (!query) return []
  const body = await request('GET', `/analytics/product-mix?${query}`, undefined, signal)
  if (!Array.isArray(body)) throw bad()
  const mix = body.map((row): ProductMixItem => {
    if (!isRecord(row) || typeof row.category !== 'string' || !isMoney(row.units)) throw bad()
    return { category: row.category, units: row.units }
  })
  // The API lists every category, sold or not; the chart draws, and counts as "sold", only the ones with units.
  return mix.filter((item) => item.units > 0)
}

/** GET /analytics/trending: the five most ordered products over the period, by the orders that contain them. */
export async function fetchTrendingItems({ signal, filter = defaultFilter() }: FilterOptions = {}): Promise<TrendingItem[]> {
  const query = rangeQuery(filter)
  if (!query) return []
  query.set('limit', '5')
  const body = await request('GET', `/analytics/trending?${query}`, undefined, signal)
  if (!Array.isArray(body)) throw bad()
  return body.map((row): TrendingItem => {
    if (!isRecord(row)) throw bad()
    const { productId, name, category, orders, stock, arConversion } = row
    if (typeof productId !== 'string' || typeof name !== 'string' || typeof category !== 'string' || !isMoney(orders) || !isMoney(stock)) throw bad()
    if (arConversion !== null && !isMoney(arConversion)) throw bad()
    return { productId, name, category, orders, stock, arConversion }
  })
}

/** The latest orders, newest first. The order is the API's; callers show it as it comes. */
export async function fetchOrderLog({ signal, delayMs = 1000, limit = 48 }: RequestOptions & { limit?: number } = {}): Promise<LoggedOrder[]> {
  await respond('log', signal, delayMs)
  await loadSampleProducts()
  return buildMonth()
    .orders.slice(-limit)
    .reverse()
    .map(({ orderId, customerName, placedAt, itemCount, total }) => ({ orderId, customerName, placedAt, itemCount, total }))
}

export interface HistoryOrder extends LoggedOrder {
  /** YYYY-MM-DD in Asia/Manila. */
  date: string
  paymentMethod: PaymentMethod
  /** Set on a few orders: a business buyer who gave a TIN. */
  buyer?: Buyer
  lines: { productId: string; name: string; category: string; units: number; price: number; vatClass?: VatClass }[]
}

// Fixed by hash, so an order always has the same payment, buyer and tax classes; about 1 line in 40 is exempt and 1 in 40 zero-rated.
const paymentMethodOf = (seed: string) => PAYMENT_METHODS[seedOf(seed) % PAYMENT_METHODS.length]
function vatClassOf(seed: string): VatClass | undefined {
  const n = seedOf(seed) % 40
  return n === 0 ? 'exempt' : n === 1 ? 'zero' : undefined
}
const SAMPLE_BUYERS: Buyer[] = [
  { name: 'Sample Trading Corp.', tin: '000-000-000-00000', address: '1 Sample Avenue, Sample City, Metro Manila 0000' },
  { name: 'Sample Uniforms Inc.', tin: '000-000-000-00000', address: '2 Sample Road, Sample City, Cebu 0000' },
]

/**
 * Every order of the last 12 months (this month up to now), oldest first, for the Transactions page. The current month is the
 * dashboard's own order log. Order numbers restart every month in the generator, so earlier months are numbered backwards from
 * SF-10001 and every number in the history is unique.
 */
export function buildOrderHistory(): HistoryOrder[] {
  const now = manilaToday()
  const currentKey = now.date.slice(0, 7)
  let firstKey = currentKey
  for (let n = 0; n < 11; n++) firstKey = previousMonth(firstKey)
  const months = new Map<string, MonthOrder[]>()
  for (const order of ordersFor({ start: `${firstKey}-01`, end: now.date })) {
    const key = order.date.slice(0, 7)
    months.set(key, [...(months.get(key) ?? []), order])
  }
  // Newest month first, so each earlier month ends where the one after it begins.
  const firstNo = new Map<string, number>()
  let next = 10001
  for (const [key, orders] of [...months].sort(([a], [b]) => (a < b ? 1 : -1))) {
    if (key !== currentKey) next -= orders.length
    firstNo.set(key, key === currentKey ? 10001 : next)
  }
  return [...months]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([key, orders]) =>
      orders.map(({ customerName, placedAt, itemCount, total, date, lines }, i) => {
        const buyer = seedOf(`${placedAt}:buyer`) % 23 === 0 ? SAMPLE_BUYERS[seedOf(placedAt) % SAMPLE_BUYERS.length] : undefined
        return {
          orderId: `SF-${firstNo.get(key)! + i}`,
          customerName,
          placedAt,
          itemCount,
          total,
          date,
          paymentMethod: paymentMethodOf(`${placedAt}:${customerName}`),
          ...(buyer && { buyer }),
          lines: lines.map(({ productId, name, category, units, price }, n) => {
            const vatClass = vatClassOf(`${placedAt}:${productId}:${n}`)
            return { productId, name, category, units, price, ...(vatClass && { vatClass }) }
          }),
        }
      }),
    )
}
