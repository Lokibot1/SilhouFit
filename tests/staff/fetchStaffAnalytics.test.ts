import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOW_STOCK } from '../../src/data/products'
import { stockLabel } from '../../src/components/staff/TrendingItems'
import { ProductListError, request } from '../../src/service/fetchProductList'
import { SAMPLE_PRODUCTS as PRODUCTS } from '../fixtures/sampleProducts'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const { fetchOrderLog, fetchProductMix, fetchSalesSeries, fetchStaffSummary, fetchTrendingItems, setSampleProducts } = await import('../../src/service/fetchStaffAnalytics')

const NO_DELAY = { delayMs: 0 }
const SUMMARY = { arSessions: 0, salesTotal: 482350, orderCount: 96, unitsSold: 214, aov: 5024.48, arChange: null, salesChange: -8.7, ordersChange: 0, periodStart: '2026-10-01', periodEnd: '2026-10-22' }
const url = (call = 0) => new URL(`http://x${send.mock.calls[call][1]}`)

beforeEach(() => {
  send.mockReset()
  setSampleProducts(PRODUCTS)
  // 3:45 PM in Manila on Oct 22, 2026. Only Date is faked, so the request timers still run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-22T07:45:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe('fetchStaffSummary', () => {
  it('asks GET /analytics/summary with no query and returns the figures', async () => {
    send.mockResolvedValue({ ...SUMMARY, extra: 1 })
    const signal = new AbortController().signal
    expect(await fetchStaffSummary({ signal })).toEqual(SUMMARY)
    expect(send).toHaveBeenCalledWith('GET', '/analytics/summary', undefined, signal)
  })

  it('rejects a body of the wrong shape as a server error', async () => {
    for (const body of [null, [], { ...SUMMARY, salesTotal: '482350' }, { ...SUMMARY, orderCount: Number.NaN }, { ...SUMMARY, arChange: undefined }, { ...SUMMARY, periodEnd: 5 }]) {
      send.mockResolvedValueOnce(body)
      await expect(fetchStaffSummary()).rejects.toMatchObject({ kind: 'server' })
    }
  })

  it('passes a rate limit through with the wait the server asked for', async () => {
    send.mockRejectedValue(new ProductListError('rate-limit', undefined, 429, undefined, 30_000))
    await expect(fetchStaffSummary()).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 30_000 })
  })
})

describe('fetchSalesSeries', () => {
  it('asks for the filter period and year, the default being the month period of this year', async () => {
    send.mockResolvedValue([{ date: '2026-01-01', total: 10 }, { date: '2026-02-01', total: 0 }])
    expect(await fetchSalesSeries()).toEqual([{ date: '2026-01-01', total: 10 }, { date: '2026-02-01', total: 0 }])
    expect(url().pathname).toBe('/analytics/sales')
    expect([...url().searchParams]).toEqual([['interval', 'month'], ['year', '2026']])
    await fetchSalesSeries({ filter: { period: 'quarter', year: 2025 } })
    expect([...url(1).searchParams]).toEqual([['interval', 'quarter'], ['year', '2025']])
  })

  it('adds the month, and buckets it by day or by week', async () => {
    send.mockResolvedValue([])
    await fetchSalesSeries({ filter: { period: 'week', year: 2026, month: 3 } })
    expect([...url(0).searchParams]).toEqual([['interval', 'week'], ['year', '2026'], ['month', '3']])
    await fetchSalesSeries({ filter: { period: 'quarter', year: 2026, month: 3 } })
    expect(url(1).searchParams.get('interval')).toBe('day')
  })

  it('shows the empty series the server gives for a future year', async () => {
    send.mockResolvedValue([])
    expect(await fetchSalesSeries({ filter: { period: 'month', year: 2027 } })).toEqual([])
    expect(url().searchParams.get('year')).toBe('2027')
  })

  it('rejects a body of the wrong shape as a server error', async () => {
    for (const body of [{}, [null], [{ date: '2026-01-01' }], [{ date: 20260101, total: 1 }], [{ date: '2026-01-01', total: '1' }]]) {
      send.mockResolvedValueOnce(body)
      await expect(fetchSalesSeries()).rejects.toMatchObject({ kind: 'server' })
    }
  })

  it('passes a rate limit through', async () => {
    send.mockRejectedValue(new ProductListError('rate-limit', undefined, 429, undefined, 15_000))
    await expect(fetchSalesSeries()).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 15_000 })
  })
})

describe('fetchProductMix', () => {
  it('asks for the dates the period covers and nothing else', async () => {
    send.mockResolvedValue([{ category: 'Tops', units: 12 }])
    expect(await fetchProductMix()).toEqual([{ category: 'Tops', units: 12 }])
    expect(url().pathname).toBe('/analytics/product-mix')
    expect([...url().searchParams]).toEqual([['from', '2026-10-01'], ['to', '2026-10-22']])
    await fetchProductMix({ filter: { period: 'quarter', year: 2025 } })
    expect([...url(1).searchParams]).toEqual([['from', '2025-10-01'], ['to', '2025-12-31']])
  })

  it('drops the categories with no units, which the API lists too, so an empty period is empty', async () => {
    send.mockResolvedValueOnce([{ category: 'Hoodie', units: 0 }, { category: 'Shirt', units: 5 }, { category: 'Pants', units: 0 }])
    expect(await fetchProductMix()).toEqual([{ category: 'Shirt', units: 5 }])
    send.mockResolvedValueOnce([{ category: 'Hoodie', units: 0 }, { category: 'Shirt', units: 0 }])
    expect(await fetchProductMix()).toEqual([])
  })

  it('asks nothing for a year that has not begun', async () => {
    expect(await fetchProductMix({ filter: { period: 'year', year: 2027 } })).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects a body of the wrong shape as a server error', async () => {
    for (const body of [{}, [{ category: 'Tops' }], [{ category: 3, units: 1 }]]) {
      send.mockResolvedValueOnce(body)
      await expect(fetchProductMix()).rejects.toMatchObject({ kind: 'server' })
    }
  })

  it('passes a rate limit through', async () => {
    send.mockRejectedValue(new ProductListError('rate-limit', undefined, 429, undefined, 15_000))
    await expect(fetchProductMix()).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 15_000 })
  })
})

describe('fetchTrendingItems', () => {
  const ITEM = { productId: 'p1', name: 'Tee', category: 'Tops', orders: 30, stock: 4, arConversion: null }

  it('asks for the same dates with a limit of five', async () => {
    send.mockResolvedValue([ITEM, { ...ITEM, productId: 'p2', arConversion: 42 }])
    expect(await fetchTrendingItems({ filter: { period: 'week', year: 2026 } })).toEqual([ITEM, { ...ITEM, productId: 'p2', arConversion: 42 }])
    expect(url().pathname).toBe('/analytics/trending')
    expect([...url().searchParams]).toEqual([['from', '2026-10-19'], ['to', '2026-10-22'], ['limit', '5']])
  })

  it('asks nothing for a year that has not begun', async () => {
    expect(await fetchTrendingItems({ filter: { period: 'month', year: 2027 } })).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects a body of the wrong shape as a server error', async () => {
    for (const body of [{}, [null], [{ ...ITEM, orders: '3' }], [{ ...ITEM, arConversion: undefined }], [{ ...ITEM, name: 7 }]]) {
      send.mockResolvedValueOnce(body)
      await expect(fetchTrendingItems()).rejects.toMatchObject({ kind: 'server' })
    }
  })

  it('passes a rate limit through', async () => {
    send.mockRejectedValue(new ProductListError('rate-limit', undefined, 429, undefined, 15_000))
    await expect(fetchTrendingItems()).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 15_000 })
  })
})

describe('fetchOrderLog', () => {
  it('gives the same orders every time for the same day', async () => {
    expect(await fetchOrderLog(NO_DELAY)).toEqual(await fetchOrderLog(NO_DELAY))
  })

  it('lists orders newest first without placing any in the future', async () => {
    const log = await fetchOrderLog(NO_DELAY)
    const times = log.map((o) => Date.parse(o.placedAt))
    expect(log.length).toBeGreaterThan(8)
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(times[0]).toBeLessThanOrEqual(Date.now())
    expect(new Set(log.map((o) => o.orderId)).size).toBe(log.length)
  })

  it('has no orders while the shop has no products, or on ?fail=empty', async () => {
    setSampleProducts([])
    expect(await fetchOrderLog(NO_DELAY)).toEqual([])
    setSampleProducts(PRODUCTS)
    window.history.replaceState(null, '', '/?fail=empty')
    expect(await fetchOrderLog(NO_DELAY)).toEqual([])
  })

  it('rejects with a network error on ?fail=log', async () => {
    window.history.replaceState(null, '', '/?fail=log')
    await expect(fetchOrderLog(NO_DELAY)).rejects.toMatchObject({ kind: 'network' })
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
