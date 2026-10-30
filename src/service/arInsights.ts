// The AR Fitting Insights page's figures, generated from the period and the sample products until the backend records AR fitting events.
// A given period always yields the same numbers.
import { addDays, resolvePeriod, resolveSalesWindow, type PeriodFilterValue } from '../utils/period'
import { bucketOf, failParam, getSampleProducts, loadSampleProducts, seedOf } from './fetchStaffAnalytics'
import { simulateRequest, type RequestOptions } from './simulateRequest'

/** Dev-only: /admin/ar-insights?fail=ar-summary (or ar-sessions, ar-top, ar-fit, ar-size, ar-not-ready) fails that section. */
const wait = (section: string, delayMs: number, signal?: AbortSignal) =>
  simulateRequest(delayMs, signal, () => failParam() === section).catch((error: Error) => {
    throw error.name === 'AbortError' ? error : Object.assign(error, { kind: 'network' })
  })

type FilterOptions = RequestOptions & { filter: PeriodFilterValue }

export interface ArSummary {
  sessions: number
  /** Percent of AR sessions that ended in a purchase, one decimal. */
  conversionPct: number
  arReady: number
  products: number
  /** 0 to 100. */
  avgFitScore: number
}
export interface ArSessionPoint {
  /** The bucket's first day, YYYY-MM-DD. */
  date: string
  sessions: number
}
export interface ArTopProduct {
  productId: string
  name: string
  category: string
  tryOns: number
  purchases: number
  conversionPct: number
  imageUrl?: string
}
/** Whole percents of the try-ons; they add up to 100. */
export interface FitBreakdown {
  tooTight: number
  goodFit: number
  loose: number
}
/** Of the shoppers who bought after a size was recommended. */
export interface SizeAgreement {
  recommended: number
  purchasedSame: number
  purchasedLarger: number
  purchasedSmaller: number
}
export interface ArNotReadyItem {
  productId: string
  name: string
  category: string
  stock: number
}

export const AR_TOP_LIMIT = 10
/** How many rows the top products table and the not-ready list will show, known before their data arrives. */
export const arTopCount = () => Math.min(AR_TOP_LIMIT, getSampleProducts().filter((p) => p.arReady).length)
export const notArReadyCount = () => getSampleProducts().filter((p) => !p.arReady).length

const sessionsOn = (date: string) => 8 + (seedOf(`ar-${date}`) % 15)
const days = (start: string, end: string) => {
  const found: string[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) found.push(date)
  return found
}
const conversionOf = (seed: string) => 12 + (seedOf(seed) % 200) / 10

/** Sessions inside the period, the same days the summary cards describe. */
const sessionsIn = (filter: PeriodFilterValue) => {
  const { start, end } = resolvePeriod(filter)
  return days(start, end).reduce((sum, date) => sum + sessionsOn(date), 0)
}

/** REPLACE: GET /analytics/ar/summary?period=&year= -> ArSummary (arReady and products as in GET /products). */
export async function getArSummary({ signal, delayMs = 700, filter }: FilterOptions): Promise<ArSummary> {
  await wait('ar-summary', delayMs, signal)
  await loadSampleProducts()
  const products = getSampleProducts()
  const { scope } = resolvePeriod(filter)
  return {
    sessions: sessionsIn(filter),
    conversionPct: conversionOf(`${scope}-conv`),
    arReady: products.filter((p) => p.arReady).length,
    products: products.length,
    avgFitScore: 72 + (seedOf(`${scope}-fit`) % 20),
  }
}

/** REPLACE: GET /analytics/ar/sessions?interval=day|week|month|quarter|year&year=YYYY -> ArSessionPoint[] (buckets as GET /analytics/sales). */
export async function getArSessionsSeries({ signal, delayMs = 900, filter }: FilterOptions): Promise<ArSessionPoint[]> {
  await wait('ar-sessions', delayMs, signal)
  const span = resolveSalesWindow(filter)
  const totals = new Map<string, number>()
  for (const date of days(span.start, span.end)) {
    const bucket = bucketOf(date, span.granularity, span.start)
    totals.set(bucket, (totals.get(bucket) ?? 0) + sessionsOn(date))
  }
  return [...totals].map(([date, sessions]) => ({ date, sessions }))
}

/** REPLACE: GET /analytics/ar/top-products?period=&year=&limit=10 -> ArTopProduct[] (try-on events joined with the orders that followed). */
export async function getArTopProducts({ signal, delayMs = 850, filter }: FilterOptions): Promise<ArTopProduct[]> {
  await wait('ar-top', delayMs, signal)
  await loadSampleProducts()
  const { scope, start, end } = resolvePeriod(filter)
  const length = days(start, end).length
  return getSampleProducts()
    .filter((p) => p.arReady)
    .map((p): ArTopProduct => {
      const tryOns = length * (1 + (seedOf(`${p.id}-${scope}`) % 6))
      const purchases = Math.round((tryOns * conversionOf(`${p.id}-${scope}`)) / 100)
      return {
        productId: p.id,
        name: p.name,
        category: p.category,
        tryOns,
        purchases,
        conversionPct: tryOns ? Math.round((purchases / tryOns) * 1000) / 10 : 0,
        imageUrl: p.imageUrl,
      }
    })
    .sort((a, b) => b.tryOns - a.tryOns || a.name.localeCompare(b.name))
    .slice(0, AR_TOP_LIMIT)
}

/** REPLACE: GET /analytics/ar/fit-breakdown?period=&year= -> FitBreakdown. */
export async function getArFitBreakdown({ signal, delayMs = 750, filter }: FilterOptions): Promise<FitBreakdown> {
  await wait('ar-fit', delayMs, signal)
  const { scope } = resolvePeriod(filter)
  const tooTight = 10 + (seedOf(`${scope}-tight`) % 15)
  const loose = 12 + (seedOf(`${scope}-loose`) % 15)
  return { tooTight, goodFit: 100 - tooTight - loose, loose }
}

/** REPLACE: GET /analytics/ar/size-agreement?period=&year= -> SizeAgreement. */
export async function getSizeAgreement({ signal, delayMs = 800, filter }: FilterOptions): Promise<SizeAgreement> {
  await wait('ar-size', delayMs, signal)
  const { scope } = resolvePeriod(filter)
  const recommended = Math.round((sessionsIn(filter) * conversionOf(`${scope}-conv`)) / 100)
  const purchasedSame = Math.round((recommended * (60 + (seedOf(`${scope}-same`) % 20))) / 100)
  const purchasedLarger = Math.round((recommended * (10 + (seedOf(`${scope}-larger`) % 10))) / 100)
  return { recommended, purchasedSame, purchasedLarger, purchasedSmaller: recommended - purchasedSame - purchasedLarger }
}

/** REPLACE: GET /products?isArReady=false -> id, name, category, totalStock (the Inventory list's own filter). */
export async function getNotArReady({ signal, delayMs = 700 }: RequestOptions = {}): Promise<ArNotReadyItem[]> {
  await wait('ar-not-ready', delayMs, signal)
  await loadSampleProducts()
  return getSampleProducts()
    .filter((p) => !p.arReady)
    .map((p) => ({ productId: p.id, name: p.name, category: p.category, stock: p.stock }))
}
