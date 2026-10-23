import { LOW_STOCK, PRODUCTS } from '../data/products'
import { simulateRequest, type RequestOptions } from './simulateRequest'

// Stand-in for the analytics endpoints behind the staff dashboard. Nothing on the backend can answer these yet:
// it has no Order, OrderItem or AR fitting event models. Swap each function for its call when they exist
// (month is YYYY-MM, in Asia/Manila):
//   fetchStaffSummary  -> GET /analytics/summary?month=YYYY-MM
//   fetchSalesSeries   -> GET /analytics/sales?from=&to=&interval=day
//   fetchProductMix    -> GET /analytics/product-mix?month=
//   fetchTrendingItems -> GET /analytics/trending?month=&limit=5 (per item: category, orders, stock, arConversion)
//   fetchOrderLog      -> GET /orders?limit=&sort=-placedAt
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
  /** Orders this month that contain the item. An order counts once, however many pieces it has. */
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

/** Now in Asia/Manila (no daylight saving). */
function manilaNow(now: Date) {
  const stamp = now.toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }) // "2026-10-22 15:45:12"
  return { date: stamp.slice(0, 10), minutes: Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16)) }
}

const pad = (n: number) => String(n).padStart(2, '0')

interface MonthOrder extends LoggedOrder {
  date: string
  lines: { productId: string; name: string; category: string; units: number; usedAr: boolean }[]
}

interface Month {
  today: string
  start: string
  days: string[]
  orders: MonthOrder[]
  arUsers: number
}

/** Every order of the current month up to now, oldest first. All five fetchers read from this. */
function buildMonth(): Month {
  const { date: today, minutes: nowMinutes } = manilaNow(new Date())
  const monthKey = today.slice(0, 7)
  const dayCount = Number(today.slice(8))
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
  for (let day = 1; day <= dayCount; day++) {
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
      // Today's orders stop at the current time.
      if (date === today && minute > nowMinutes) continue
      dayOrders.push({
        orderId: '',
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
  orders.forEach((order, i) => (order.orderId = `SF-${10001 + i}`))

  const empty = failParam() === 'empty'
  return { today, start: `${monthKey}-01`, days, orders: empty ? [] : orders, arUsers: empty ? 0 : Math.round(arUsers * 0.75) }
}

export async function fetchStaffSummary({ signal, delayMs = 600 }: RequestOptions = {}): Promise<StaffSummary> {
  await respond('summary', signal, delayMs)
  const month = buildMonth()
  return {
    arSessions: month.arUsers,
    salesTotal: month.orders.reduce((sum, o) => sum + o.total, 0),
    orderCount: month.orders.length,
    unitsSold: month.orders.reduce((sum, o) => sum + o.itemCount, 0),
    periodStart: month.start,
    periodEnd: month.today,
  }
}

/** One entry per day from the 1st to today, zero on days without orders. */
export async function fetchSalesSeries({ signal, delayMs = 900 }: RequestOptions = {}): Promise<SalesDay[]> {
  await respond('sales', signal, delayMs)
  const month = buildMonth()
  const totals = new Map<string, number>()
  for (const order of month.orders) totals.set(order.date, (totals.get(order.date) ?? 0) + order.total)
  return month.days.map((date) => ({ date, total: totals.get(date) ?? 0 }))
}

/** Units per category, largest first. */
export async function fetchProductMix({ signal, delayMs = 750 }: RequestOptions = {}): Promise<ProductMixItem[]> {
  await respond('mix', signal, delayMs)
  const units = new Map<string, number>()
  for (const order of buildMonth().orders) for (const line of order.lines) units.set(line.category, (units.get(line.category) ?? 0) + line.units)
  return [...units].map(([category, count]) => ({ category, units: count })).sort((a, b) => b.units - a.units)
}

/** The five most ordered products this month, by the orders that contain them. */
export async function fetchTrendingItems({ signal, delayMs = 850 }: RequestOptions = {}): Promise<TrendingItem[]> {
  await respond('trending', signal, delayMs)
  const tally = new Map<string, { name: string; category: string; orders: Set<string>; arOrders: Set<string> }>()
  for (const order of buildMonth().orders) {
    for (const line of order.lines) {
      const entry = tally.get(line.productId) ?? { name: line.name, category: line.category, orders: new Set<string>(), arOrders: new Set<string>() }
      entry.orders.add(order.orderId)
      if (line.usedAr) entry.arOrders.add(order.orderId)
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
