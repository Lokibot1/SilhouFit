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

const NO_DELAY = { delayMs: 0 }

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

  it('has one entry per day from the 1st to today and none in the future', async () => {
    const series = await fetchSalesSeries(NO_DELAY)
    expect(series).toHaveLength(22)
    expect(series[0].date).toBe('2026-10-01')
    expect(series.at(-1)!.date).toBe('2026-10-22')
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
    const [summary, series, mix] = await Promise.all([fetchStaffSummary(NO_DELAY), fetchSalesSeries(NO_DELAY), fetchProductMix(NO_DELAY)])
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

describe('stockLabel', () => {
  it('says how many are left, or that the item is sold out', () => {
    expect(stockLabel(0)).toEqual({ kind: 'out', text: 'Sold out' })
    expect(stockLabel(1)).toEqual({ kind: 'low', text: 'Low stock · 1 left' })
    expect(stockLabel(LOW_STOCK)).toMatchObject({ kind: 'low' })
    expect(stockLabel(LOW_STOCK + 1)).toEqual({ kind: 'in', text: 'In stock' })
  })
})
