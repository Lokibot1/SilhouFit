import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOW_STOCK, PRODUCTS } from '../../src/data/products'
import { stockLabel } from '../../src/components/staff/TrendingItems'
import {
  fetchOrderLog,
  fetchProductMix,
  fetchSalesSeries,
  fetchStaffSummary,
  fetchTrendingItems,
} from '../../src/service/fetchStaffAnalytics'
import type { Period } from '../../src/utils/period'

const NO_DELAY = { delayMs: 0 }

const PERIODS: Period[] = ['day', 'week', 'month', 'quarter', 'year']
const sum = (nums: number[]) => nums.reduce((a, b) => a + b, 0)
const forYear = (period: Period, year = 2026) => ({ ...NO_DELAY, filter: { period, year } })

beforeEach(() => {
  // 3:45 PM in Manila on Oct 22, 2026. Only Date is faked, so the request timers still run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-22T07:45:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe('fetchStaffAnalytics', () => {
  it('gives the same figures every time for the same day', async () => {
    expect(await fetchStaffSummary(NO_DELAY)).toEqual(await fetchStaffSummary(NO_DELAY))
    expect(await fetchOrderLog(NO_DELAY)).toEqual(await fetchOrderLog(NO_DELAY))
  })

  it('defaults to one point per month from January to the current one', async () => {
    const series = await fetchSalesSeries(NO_DELAY)
    expect(series.map((d) => d.date)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((m) => `2026-${m}-01`))
    expect(series.every((d) => d.total >= 0)).toBe(true)
  })

  it('lists orders newest first without placing any in the future', async () => {
    const log = await fetchOrderLog(NO_DELAY)
    const times = log.map((o) => Date.parse(o.placedAt))
    expect(log.length).toBeGreaterThan(8)
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(times[0]).toBeLessThanOrEqual(Date.now())
    expect(new Set(log.map((o) => o.orderId)).size).toBe(log.length)
  })

  it('adds up the same across the summary, series and mix', async () => {
    const [summary, series, mix] = await Promise.all([fetchStaffSummary(NO_DELAY), fetchSalesSeries(forYear('day')), fetchProductMix(NO_DELAY)])
    expect(series.reduce((sum, d) => sum + d.total, 0)).toBe(summary.salesTotal)
    expect(mix.reduce((sum, m) => sum + m.units, 0)).toBe(summary.unitsSold)
    expect(summary.periodStart).toBe('2026-10-01')
    expect(summary.periodEnd).toBe('2026-10-22')
  })

  it('ranks the five most ordered products with stock and AR Fitting use', async () => {
    const [trending, summary] = await Promise.all([fetchTrendingItems(NO_DELAY), fetchStaffSummary(NO_DELAY)])
    expect(trending).toHaveLength(5)
    const orders = trending.map((t) => t.orders)
    expect(orders).toEqual([...orders].sort((a, b) => b - a))
    for (const t of trending) {
      const product = PRODUCTS.find((p) => p.id === t.productId)!
      expect(Number.isInteger(t.stock) && t.stock >= 0).toBe(true)
      expect(t.stock).toBeLessThanOrEqual(product.stock) // sample mode may lower it to show the low and sold-out states
      expect(t.orders).toBeLessThanOrEqual(summary.orderCount)
      if (product.arReady) expect(Number.isInteger(t.arConversion) && t.arConversion! >= 0 && t.arConversion! <= 100).toBe(true)
      else expect(t.arConversion).toBeNull()
    }
    expect(await fetchTrendingItems(NO_DELAY)).toEqual(trending)
  })

  it('shows a low-stock and a sold-out item in the sample set', async () => {
    const trending = await fetchTrendingItems(NO_DELAY)
    expect(trending.some((t) => t.stock >= 1 && t.stock <= LOW_STOCK)).toBe(true)
    expect(trending.some((t) => t.stock === 0)).toBe(true)
  })

  it('rejects with a network error on a ?fail hook, and only for that section', async () => {
    window.history.replaceState(null, '', '/?fail=sales')
    await expect(fetchSalesSeries(NO_DELAY)).rejects.toMatchObject({ kind: 'network' })
    await expect(fetchStaffSummary(NO_DELAY)).resolves.toBeDefined()
  })

  it('returns empty data on ?fail=empty', async () => {
    window.history.replaceState(null, '', '/?fail=empty')
    expect(await fetchOrderLog(NO_DELAY)).toEqual([])
    expect(await fetchTrendingItems(NO_DELAY)).toEqual([])
    expect(await fetchProductMix(NO_DELAY)).toEqual([])
    expect(await fetchStaffSummary(NO_DELAY)).toMatchObject({ arSessions: 0, salesTotal: 0, orderCount: 0, unitsSold: 0 })
    expect((await fetchSalesSeries(NO_DELAY)).every((d) => d.total === 0)).toBe(true)
  })
})


describe('fetchStaffAnalytics with a period filter', () => {
  it('month of the current year is the default', async () => {
    const filter = { period: 'month', year: 2026 } as const
    expect(await fetchSalesSeries({ ...NO_DELAY, filter })).toEqual(await fetchSalesSeries(NO_DELAY))
    expect(await fetchProductMix({ ...NO_DELAY, filter })).toEqual(await fetchProductMix(NO_DELAY))
    expect(await fetchTrendingItems({ ...NO_DELAY, filter })).toEqual(await fetchTrendingItems(NO_DELAY))
  })

  it('adds up the same as the stat cards for the month', async () => {
    const [summary, series, mix] = await Promise.all([fetchStaffSummary(NO_DELAY), fetchSalesSeries(forYear('day')), fetchProductMix(forYear('month'))])
    expect(sum(series.map((d) => d.total))).toBe(summary.salesTotal)
    expect(sum(mix.map((m) => m.units))).toBe(summary.unitsSold)
  })

  it('day is one point per day from the 1st of the latest month to today', async () => {
    const today = (await fetchSalesSeries(forYear('day'))).map((b) => b.date)
    expect(today).toHaveLength(22)
    expect(today[0]).toBe('2026-10-01')
    expect(today.at(-1)).toBe('2026-10-22')
    const past = (await fetchSalesSeries(forYear('day', 2025))).map((b) => b.date)
    expect(past).toHaveLength(31)
    expect([past[0], past.at(-1)]).toEqual(['2025-12-01', '2025-12-31'])
  })

  it('week is one point per Monday-start week of the year, the first clipped to Jan 1', async () => {
    const weeks = (await fetchSalesSeries(forYear('week'))).map((b) => b.date)
    expect(weeks.slice(0, 3)).toEqual(['2026-01-01', '2026-01-05', '2026-01-12'])
    expect(weeks.at(-1)).toBe('2026-10-19')
    expect(weeks).toHaveLength(43)
    weeks.slice(1).forEach((date) => expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBe(1))
    const past = (await fetchSalesSeries(forYear('week', 2025))).map((b) => b.date)
    expect(past.slice(0, 2)).toEqual(['2025-01-01', '2025-01-06'])
    expect(past.at(-1)).toBe('2025-12-29')
  })

  it('month is one point per month, partial for the current year and twelve for a past one', async () => {
    expect(await fetchSalesSeries(forYear('month', 2025))).toHaveLength(12)
    expect((await fetchSalesSeries(forYear('month', 2025)))[11].date).toBe('2025-12-01')
  })

  it('quarter is one point per quarter, dated by its first day', async () => {
    expect((await fetchSalesSeries(forYear('quarter'))).map((b) => b.date)).toEqual(['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01'])
    expect((await fetchSalesSeries(forYear('quarter', 2025))).map((b) => b.date)).toEqual(['2025-01-01', '2025-04-01', '2025-07-01', '2025-10-01'])
    vi.setSystemTime(new Date('2026-03-31T04:00:00Z'))
    expect((await fetchSalesSeries(forYear('quarter'))).map((b) => b.date)).toEqual(['2026-01-01'])
    vi.setSystemTime(new Date('2026-04-01T04:00:00Z'))
    expect((await fetchSalesSeries(forYear('quarter'))).map((b) => b.date)).toEqual(['2026-01-01', '2026-04-01'])
  })

  it('year is one point for the chosen year and the two before it', async () => {
    expect((await fetchSalesSeries(forYear('year'))).map((b) => b.date)).toEqual(['2024-01-01', '2025-01-01', '2026-01-01'])
    expect((await fetchSalesSeries(forYear('year', 2025))).map((b) => b.date)).toEqual(['2023-01-01', '2024-01-01', '2025-01-01'])
  })

  it('adds up the same whatever the bucket size', async () => {
    for (const year of [2026, 2025]) {
      const totals = await Promise.all(['week', 'month', 'quarter'].map(async (p) => sum((await fetchSalesSeries(forYear(p as Period, year))).map((b) => b.total))))
      expect(totals[0]).toBeGreaterThan(0)
      expect(totals).toEqual([totals[0], totals[0], totals[0]])
      const years = await fetchSalesSeries(forYear('year', year))
      expect(years.at(-1)!.total).toBe(totals[0])
    }
  })

  it('agrees across sales, mix and trending for every period', async () => {
    for (const year of [2026, 2025])
      for (const period of PERIODS) {
        const options = forYear(period, year)
        const [series, mix, trending] = await Promise.all([fetchSalesSeries(options), fetchProductMix(options), fetchTrendingItems(options)])
        expect(sum(series.map((b) => b.total)) > 0, `${period} ${year}`).toBe(true)
        expect(sum(mix.map((m) => m.units)) > 0).toBe(true)
        expect(trending.length).toBeGreaterThan(0)
        // Every sold piece of the top items is a unit in the mix.
        expect(sum(trending.map((t) => t.orders))).toBeLessThanOrEqual(sum(mix.map((m) => m.units)))
      }
  })

  it('counts an item once per order across months, without undercounting', async () => {
    // Order ids restart each month, so counting ids alone would merge orders from different months.
    const top = (await fetchTrendingItems(forYear('year', 2025)))[0]
    const quarter = (await fetchTrendingItems(forYear('quarter', 2025))).find((t) => t.productId === top.productId)
    expect(top.orders).toBeGreaterThan((quarter?.orders ?? 0) * 2)
  })

  it('gives a past period the same numbers every time', async () => {
    for (const period of PERIODS) {
      expect(await fetchSalesSeries(forYear(period, 2025))).toEqual(await fetchSalesSeries(forYear(period, 2025)))
      expect(await fetchTrendingItems(forYear(period, 2025))).toEqual(await fetchTrendingItems(forYear(period, 2025)))
    }
  })

  it('returns no orders on ?fail=empty for every period', async () => {
    window.history.replaceState(null, '', '/?fail=empty')
    for (const period of PERIODS) {
      expect((await fetchSalesSeries(forYear(period))).every((b) => b.total === 0)).toBe(true)
      expect(await fetchProductMix(forYear(period))).toEqual([])
      expect(await fetchTrendingItems(forYear(period))).toEqual([])
    }
  })

  it('shows current stock whatever the period', async () => {
    for (const t of await fetchTrendingItems(forYear('year', 2025))) {
      expect(t.stock).toBeLessThanOrEqual(PRODUCTS.find((p) => p.id === t.productId)!.stock)
    }
  })
})

describe('stockLabel', () => {
  it('says how many are left, or that the item is sold out', () => {
    expect(stockLabel(0)).toEqual({ kind: 'out', text: 'Sold out' })
    expect(stockLabel(1)).toEqual({ kind: 'low', text: 'Low stock · 1 left' })
    expect(stockLabel(LOW_STOCK)).toMatchObject({ kind: 'low' })
    expect(stockLabel(LOW_STOCK + 1)).toEqual({ kind: 'in', text: 'In stock' })
  })
})
