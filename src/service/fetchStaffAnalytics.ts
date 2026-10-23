import { LOW_STOCK, PRODUCTS } from '../data/products'
import { addDays, defaultFilter, manilaToday, mondayOf, resolvePeriod, resolveSalesWindow, type Granularity, type PeriodFilterValue } from '../utils/period'
import { simulateRequest, type RequestOptions } from './simulateRequest'

// Stand-in for the analytics endpoints behind the staff dashboard. Nothing on the backend can answer these yet:
// it has no Order, OrderItem or AR fitting event models. Swap each function for its call when they exist
// (month is YYYY-MM, in Asia/Manila):
//   fetchStaffSummary  -> GET /analytics/summary?month=YYYY-MM
//   fetchSalesSeries   -> GET /analytics/sales?interval=day|week|month|quarter|year&year=YYYY
//     (the server returns the buckets inside the year; interval=year returns that year and the two before it)
//   fetchProductMix    -> GET /analytics/product-mix?period=&year=&from=&to=
//   fetchTrendingItems -> GET /analytics/trending?period=&year=&from=&to=&limit=5 (per item: category, orders, stock, arConversion)
//   fetchOrderLog      -> GET /orders?limit=&sort=-placedAt
// The three charts take a per-card filter. On Products sold and Trendy items, from and to are inclusive dates in Asia/Manila, resolved from period and
// year by the shared client helper (utils/period).
// Until then the figures are generated from the month, so a given month always shows the same numbers.

/** True while the figures are placeholders; the dashboard says so. Set to false when the real endpoints are wired. */
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

type Section = 'summary' | 'sales' | 'mix' | 'trending' | 'log'

// Dev-only hooks for the error and empty states: /staff?fail=sales (or summary, mix, trending, log), /staff?fail=empty.
const failParam = () => (import.meta.env.DEV ? new URLSearchParams(location.search).get('fail') : null)

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
const seedOf = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0

const pad = (n: number) => String(n).padStart(2, '0')

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
  const ranked = PRODUCTS.map((product) => ({ product, key: rand() }))
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
    const count = 4 + Math.floor(rand() * 7) + (weekday === 0 || weekday >= 5 ? 3 : 0)
    const dayOrders: MonthOrder[] = []
    for (let n = 0; n < count; n++) {
      const minute = 9 * 60 + Math.floor(rand() * 12 * 60)
      const customerName = `${FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)]}`
      const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => {
        const product = pick()
        const usedAr = convRand() < rateOf(product.id) && product.arReady
        return { productId: product.id, name: product.name, category: product.category, units: rand() < 0.8 ? 1 : 2, price: product.salePrice ?? product.price, usedAr }
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

const sampleGain = (value: number | null) => (SAMPLE_DATA && value !== null ? Math.abs(value) : value)
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

export async function fetchStaffSummary({ signal, delayMs = 600 }: RequestOptions = {}): Promise<StaffSummary> {
  await respond('summary', signal, delayMs)
  const month = buildMonth()
  const salesTotal = month.orders.reduce((sum, o) => sum + o.total, 0)
  // Last month, cut at the same day of the month, so the comparison is like for like.
  const prevKey = previousMonth(month.today.slice(0, 7))
  const prevDays = new Date(Date.UTC(Number(prevKey.slice(0, 4)), Number(prevKey.slice(5)), 0)).getUTCDate()
  const prev = buildMonthOrders(prevKey, Math.min(Number(month.today.slice(8)), prevDays), null)
  const prevSales = prev.orders.reduce((sum, o) => sum + o.total, 0)
  const change = (now: number, before: number) => (month.orders.length > 0 && before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null)
  return {
    arSessions: month.arUsers,
    salesTotal,
    aov: month.orders.length ? Math.round((salesTotal / month.orders.length) * 100) / 100 : 0,
    // Sample only: the generated months can all land below last month, so AR and sales are shown as gains to make
    // the up and down pills both visible. Orders keep their real sign. Real data needs no such step.
    arChange: sampleGain(change(month.arUsers, Math.round(prev.arUsers * 0.75))),
    salesChange: sampleGain(change(salesTotal, prevSales)),
    ordersChange: change(month.orders.length, prev.orders.length),
    orderCount: month.orders.length,
    unitsSold: month.orders.reduce((sum, o) => sum + o.itemCount, 0),
    periodStart: month.start,
    periodEnd: month.today,
  }
}

type FilterOptions = RequestOptions & { filter?: PeriodFilterValue }

const max = (a: string, b: string) => (a > b ? a : b)

/** The start of the bucket holding `date`; a week is clipped to the window's start. */
function bucketOf(date: string, granularity: Granularity, start: string) {
  switch (granularity) {
    case 'day':
      return date
    case 'week':
      return max(mondayOf(date), start)
    case 'month':
      return `${date.slice(0, 7)}-01`
    case 'quarter':
      return `${date.slice(0, 4)}-${pad(Math.floor((Number(date.slice(5, 7)) - 1) / 3) * 3 + 1)}-01`
    case 'year':
      return `${date.slice(0, 4)}-01-01`
  }
}

/** Sales per day, week, month, quarter or year, as the filter says; zero where nothing sold. Each entry is dated by its bucket's start. */
export async function fetchSalesSeries({ signal, delayMs = 900, filter = defaultFilter() }: FilterOptions = {}): Promise<SalesDay[]> {
  await respond('sales', signal, delayMs)
  const span = resolveSalesWindow(filter)
  // Every bucket of the span, in order, so quiet ones show as zero.
  const totals = new Map<string, number>()
  for (let date = span.start; date <= span.end; date = addDays(date, 1)) totals.set(bucketOf(date, span.granularity, span.start), 0)
  for (const order of ordersFor(span)) {
    const bucket = bucketOf(order.date, span.granularity, span.start)
    totals.set(bucket, totals.get(bucket)! + order.total)
  }
  return [...totals].map(([date, total]) => ({ date, total }))
}

/** Units per category over the period, largest first. */
export async function fetchProductMix({ signal, delayMs = 750, filter = defaultFilter() }: FilterOptions = {}): Promise<ProductMixItem[]> {
  await respond('mix', signal, delayMs)
  const units = new Map<string, number>()
  for (const order of ordersFor(resolvePeriod(filter))) for (const line of order.lines) units.set(line.category, (units.get(line.category) ?? 0) + line.units)
  return [...units].map(([category, count]) => ({ category, units: count })).sort((a, b) => b.units - a.units)
}

/** The five most ordered products over the period, by the orders that contain them. */
export async function fetchTrendingItems({ signal, delayMs = 850, filter = defaultFilter() }: FilterOptions = {}): Promise<TrendingItem[]> {
  await respond('trending', signal, delayMs)
  const tally = new Map<string, { name: string; category: string; orders: Set<string>; arOrders: Set<string> }>()
  for (const order of ordersFor(resolvePeriod(filter))) {
    for (const line of order.lines) {
      const entry = tally.get(line.productId) ?? { name: line.name, category: line.category, orders: new Set<string>(), arOrders: new Set<string>() }
      entry.orders.add(order.key)
      if (line.usedAr) entry.arOrders.add(order.key)
      tally.set(line.productId, entry)
    }
  }
  const top = [...tally]
    .map(([productId, t]): TrendingItem => {
      const product = PRODUCTS.find((p) => p.id === productId)
      return {
        productId,
        name: t.name,
        category: t.category,
        orders: t.orders.size,
        stock: product?.stock ?? 0,
        arConversion: product?.arReady ? Math.round((100 * t.arOrders.size) / t.orders.size) : null,
      }
    })
    .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name))
    .slice(0, 5)
  // Sample mode only: make sure the low-stock and sold-out states are visible. Real stock comes from the API.
  if (SAMPLE_DATA && top.length === 5) {
    if (!top.some((t) => t.stock >= 1 && t.stock <= LOW_STOCK)) top[2].stock = Math.min(top[2].stock, 3)
    if (!top.some((t) => t.stock === 0)) top[4].stock = 0
  }
  return top
}

/** The latest orders, newest first. The order is the API's; callers show it as it comes. */
export async function fetchOrderLog({ signal, delayMs = 1000, limit = 48 }: RequestOptions & { limit?: number } = {}): Promise<LoggedOrder[]> {
  await respond('log', signal, delayMs)
  return buildMonth()
    .orders.slice(-limit)
    .reverse()
    .map(({ orderId, customerName, placedAt, itemCount, total }) => ({ orderId, customerName, placedAt, itemCount, total }))
}

export interface HistoryOrder extends LoggedOrder {
  /** YYYY-MM-DD in Asia/Manila. */
  date: string
  lines: { productId: string; name: string; category: string; units: number; price: number }[]
}

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
      orders.map(({ customerName, placedAt, itemCount, total, date, lines }, i) => ({
        orderId: `SF-${firstNo.get(key)! + i}`,
        customerName,
        placedAt,
        itemCount,
        total,
        date,
        lines: lines.map(({ productId, name, category, units, price }) => ({ productId, name, category, units, price })),
      })),
    )
}
