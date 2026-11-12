import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildOrderHistory, fetchOrderLog, setSampleProducts } from '../../src/service/fetchStaffAnalytics'
import { sampleAdminTransaction, sampleAdminTransactionMetrics, sampleAdminTransactions, sampleTransactionDetail, sampleTransactionSummary } from '../../src/service/sampleTransactions'

import { SAMPLE_PRODUCTS } from '../fixtures/sampleProducts'

const NO_DELAY = { delayMs: 0 }
const all = { limit: 100 }

beforeEach(() => {
  setSampleProducts(SAMPLE_PRODUCTS)
  // 3:45 PM in Manila on Oct 22, 2026. Only Date is faked, so the request timers still run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-22T07:45:00Z'))
})
afterEach(() => vi.useRealTimers())

/** Every payment the filters match, page by page (the API allows 100 a page). */
async function everything(params: Parameters<typeof sampleAdminTransactions>[0] = {}) {
  const first = await sampleAdminTransactions({ ...params, ...all, page: 1 }, NO_DELAY)
  const rest = await Promise.all(Array.from({ length: first.meta.totalPages - 1 }, (_, n) => sampleAdminTransactions({ ...params, ...all, page: n + 2 }, NO_DELAY)))
  return [first, ...rest].flatMap((page) => page.data)
}

describe('buildOrderHistory', () => {
  it('covers the last 12 months, oldest first, with every order number unique', () => {
    const history = buildOrderHistory()
    expect(history[0].date >= '2025-11-01').toBe(true)
    expect(history[0].date < '2025-12-01').toBe(true)
    const times = history.map((o) => Date.parse(o.placedAt))
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(new Set(history.map((o) => o.orderId)).size).toBe(history.length)
    expect(history.every((o) => /^SF-\d{4,5}$/.test(o.orderId))).toBe(true)
  })

  it('keeps this month as the dashboard order log and numbers earlier months below SF-10001', async () => {
    const log = await fetchOrderLog({ ...NO_DELAY, limit: 100000 })
    const history = buildOrderHistory()
    const thisMonth = history.filter((o) => o.date.startsWith('2026-10'))
    expect(thisMonth.map((o) => o.orderId)).toEqual([...log].reverse().map((o) => o.orderId))
    const earlier = history.filter((o) => !o.date.startsWith('2026-10')).map((o) => Number(o.orderId.slice(3)))
    expect(Math.max(...earlier)).toBe(10000)
  })

  it('gives every order lines that add up to its item count and total', () => {
    for (const order of buildOrderHistory().slice(0, 200)) {
      expect(order.lines.length).toBeGreaterThan(0)
      expect(order.lines.reduce((sum, l) => sum + l.units, 0)).toBe(order.itemCount)
      expect(order.lines.reduce((sum, l) => sum + l.units * l.price, 0)).toBe(order.total)
    }
  })

  it('is the same every time', () => {
    expect(buildOrderHistory()).toEqual(buildOrderHistory())
  })
})

describe('sampleAdminTransactions', () => {
  it('defaults to newest first and reports the paging, with the page size capped at 100', async () => {
    const { data, meta } = await sampleAdminTransactions({ limit: 10 }, NO_DELAY)
    expect(data).toHaveLength(10)
    const times = data.map((o) => Date.parse(o.at))
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(meta).toMatchObject({ page: 1, limit: 10 })
    expect(meta.totalPages).toBe(Math.ceil(meta.total / 10))
    expect(meta.total).toBe(buildOrderHistory().length)

    expect((await sampleAdminTransactions({ limit: 10, page: meta.totalPages + 1 }, NO_DELAY)).data).toEqual([])
    expect((await sampleAdminTransactions({ limit: 5000 }, NO_DELAY)).data).toHaveLength(100)
  })

  it('answers one payment per order, with the order and customer on the row and no fee yet', async () => {
    const [first] = (await sampleAdminTransactions({ limit: 1 }, NO_DELAY)).data
    expect(first).toMatchObject({ provider: 'paymongo', fee: null, net: null })
    expect(first.orderNumber).toMatch(/^SF-\d{4,5}$/)
    expect(first.reference).toBe(`pay_${first.orderNumber}`)
    expect(first.customerEmail).toMatch(/@/)
    expect(first.id).not.toBe(first.orderId)
    expect(['GCASH', 'PAYMAYA', 'OTHER']).toContain(first.method)
  })

  it('searches the order number, ignoring case, the customer name and the reference', async () => {
    const [first] = buildOrderHistory()
    const byNo = await sampleAdminTransactions({ search: first.orderId.toLowerCase(), ...all }, NO_DELAY)
    expect(byNo.data.map((o) => o.orderNumber)).toContain(first.orderId)
    expect(byNo.data.every((o) => o.orderNumber.toLowerCase().includes(first.orderId.toLowerCase()))).toBe(true)

    const byName = await sampleAdminTransactions({ search: first.customerName.toUpperCase(), ...all }, NO_DELAY)
    expect(byName.meta.total).toBeGreaterThan(0)
    expect(byName.data.every((o) => o.customerName === first.customerName)).toBe(true)
    expect((await sampleAdminTransactions({ search: `pay_${first.orderId}`, ...all }, NO_DELAY)).data.map((o) => o.orderNumber)).toContain(first.orderId)
    expect((await sampleAdminTransactions({ search: 'zzzz nobody', ...all }, NO_DELAY)).meta.total).toBe(0)
  })

  it('keeps payments inside an inclusive Manila date range', async () => {
    const { data } = await sampleAdminTransactions({ from: '2026-10-05', to: '2026-10-06', ...all }, NO_DELAY)
    const expected = buildOrderHistory().filter((o) => o.date >= '2026-10-05' && o.date <= '2026-10-06')
    expect(data).toHaveLength(expected.length)
    expect(data.length).toBeGreaterThan(0)
    const today = await sampleAdminTransactions({ from: '2026-10-22', to: '2026-10-22', ...all }, NO_DELAY)
    expect(today.data.every((o) => o.at >= '2026-10-21T16:00:00.000Z')).toBe(true)
    expect((await sampleAdminTransactions({ from: '2026-10-23', ...all }, NO_DELAY)).meta.total).toBe(0)
  })

  it('filters by status, method, provider and order', async () => {
    const paid = await everything({ status: 'PAID' })
    const refunded = await everything({ status: 'REFUNDED' })
    expect(paid.every((o) => o.status === 'PAID')).toBe(true)
    expect(refunded.length).toBeGreaterThan(0)
    expect(refunded.every((o) => o.status === 'REFUNDED' && o.orderStatus === 'REFUNDED')).toBe(true)
    expect(paid.length + refunded.length).toBe(buildOrderHistory().length)
    expect((await sampleAdminTransactions({ status: 'FAILED', ...all }, NO_DELAY)).meta.total).toBe(0)

    const gcash = await everything({ method: 'GCASH' })
    expect(gcash.length).toBeGreaterThan(0)
    expect(gcash.every((o) => o.method === 'GCASH')).toBe(true)
    expect((await everything({ method: 'CARD' })).length).toBe(0)

    expect((await sampleAdminTransactions({ provider: 'PayMongo', ...all }, NO_DELAY)).meta.total).toBe(buildOrderHistory().length)
    expect((await sampleAdminTransactions({ provider: 'xendit', ...all }, NO_DELAY)).meta.total).toBe(0)

    const [{ orderId }] = (await sampleAdminTransactions({ limit: 1 }, NO_DELAY)).data
    const one = await sampleAdminTransactions({ orderId }, NO_DELAY)
    expect(one.data.map((o) => o.orderId)).toEqual([orderId])
  })

  it('sorts by amount in either direction', async () => {
    const high = (await sampleAdminTransactions({ sortBy: 'amount', sortOrder: 'desc', limit: 50 }, NO_DELAY)).data.map((o) => o.amount)
    expect(high).toEqual([...high].sort((a, b) => b - a))
    const low = (await sampleAdminTransactions({ sortBy: 'amount', sortOrder: 'asc', limit: 50 }, NO_DELAY)).data.map((o) => o.amount)
    expect(low).toEqual([...low].sort((a, b) => a - b))
  })

  it('answers the same query with the same rows, and pages do not overlap', async () => {
    const params = { sortBy: 'amount', sortOrder: 'desc', limit: 25 } as const
    const two = await sampleAdminTransactions({ ...params, page: 2 }, NO_DELAY)
    expect(await sampleAdminTransactions({ ...params, page: 2 }, NO_DELAY)).toEqual(two)
    const one = await sampleAdminTransactions({ ...params, page: 1 }, NO_DELAY)
    const ids = [...one.data, ...two.data].map((o) => o.id)
    expect(new Set(ids).size).toBe(50)
  })

  it('rejects with an abort when cancelled', async () => {
    const controller = new AbortController()
    const pending = sampleAdminTransactions({}, { signal: controller.signal, delayMs: 50 })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('sampleAdminTransaction', () => {
  it('answers with the list row, the order total, the update time and a sample payload', async () => {
    const [row] = (await sampleAdminTransactions({ limit: 1 }, NO_DELAY)).data
    const detail = await sampleAdminTransaction(row.id, NO_DELAY)
    expect(detail).toMatchObject({ ...row, orderTotal: row.amount, payload: { sample: true } })
    expect(Date.parse(detail.updatedAt)).not.toBeNaN()
  })

  it('rejects with not-found for an unknown payment', async () => {
    await expect(sampleAdminTransaction('00000000-0000-4000-9000-999999999999', NO_DELAY)).rejects.toMatchObject({ kind: 'not-found' })
  })
})

describe('sampleAdminTransactionMetrics', () => {
  it('counts every payment and sums the paid ones only, with no fees', async () => {
    const rows = await everything()
    const paid = rows.filter((r) => r.status === 'PAID')
    const metrics = await sampleAdminTransactionMetrics(NO_DELAY)
    expect(metrics).toMatchObject({ totalTransactions: rows.length, paidCount: paid.length, refundedCount: rows.length - paid.length, failedCount: 0, pendingCount: 0, totalFeeVolume: 0 })
    expect(metrics.totalGrossVolume).toBeCloseTo(paid.reduce((sum, r) => sum + r.amount, 0), 2)
    expect(metrics.totalNetVolume).toBe(metrics.totalGrossVolume)
  })
})

describe('sampleTransactionDetail', () => {
  it('answers with the order fields, the lines and a subtotal that matches the total', async () => {
    const [{ orderId, orderNumber, amount }] = (await sampleAdminTransactions({ limit: 1 }, NO_DELAY)).data
    const detail = await sampleTransactionDetail(orderId, NO_DELAY)
    expect(detail).toMatchObject({ id: orderId, orderNo: orderNumber, total: amount })
    expect(detail.lines.length).toBeGreaterThan(0)
    expect(detail.lines.reduce((sum, l) => sum + l.units, 0)).toBe(detail.itemCount)
    expect(detail.subtotal).toBe(amount)
    expect(await sampleTransactionDetail(orderId, NO_DELAY)).toEqual(detail)
  })

  it('rejects with not-found for an unknown order', async () => {
    await expect(sampleTransactionDetail('00000000-0000-4000-8000-999999999999', NO_DELAY)).rejects.toMatchObject({ kind: 'not-found' })
  })
})

describe('sample invoice data', () => {
  it('gives every order a payment method, and exercises exempt, zero-rated and business-buyer orders', () => {
    const history = buildOrderHistory()
    expect(history.every((o) => ['gcash', 'maya', 'cod'].includes(o.paymentMethod))).toBe(true)
    expect(new Set(history.map((o) => o.paymentMethod)).size).toBe(3)
    const classes = new Set(history.flatMap((o) => o.lines.map((l) => l.vatClass)))
    expect(classes.has('exempt')).toBe(true)
    expect(classes.has('zero')).toBe(true)
    expect(history.some((o) => o.buyer)).toBe(true)
    expect(history.filter((o) => o.buyer).length).toBeLessThan(history.length / 5)
  })

  it('is the same on every call', () => {
    expect(buildOrderHistory().map((o) => [o.paymentMethod, o.buyer?.name])).toEqual(buildOrderHistory().map((o) => [o.paymentMethod, o.buyer?.name]))
  })

  it('carries the payment, buyer and tax classes into the order detail', async () => {
    const order = buildOrderHistory().find((o) => o.buyer && o.lines.some((l) => l.vatClass))!
    const { orderId } = (await sampleAdminTransactions({ search: order.orderId, limit: 1 }, NO_DELAY)).data[0]
    const detail = await sampleTransactionDetail(orderId, NO_DELAY)
    expect(detail.paymentMethod).toBe(order.paymentMethod)
    expect(detail.buyer).toEqual(order.buyer)
    expect(detail.lines.map((l) => l.vatClass)).toEqual(order.lines.map((l) => l.vatClass))
  })
})

describe('returned orders', () => {
  it('refunds about 7% of the payments, the same ones every time', async () => {
    const data = await everything()
    const refunded = data.filter((o) => o.status === 'REFUNDED')
    expect(refunded.length / data.length).toBeGreaterThan(0.05)
    expect(refunded.length / data.length).toBeLessThan(0.09)
    expect((await everything()).filter((o) => o.status === 'REFUNDED').map((o) => o.id)).toEqual(refunded.map((o) => o.id))
  })

  it('carries the return into the order detail, and leaves the dashboard order log alone', async () => {
    const [first] = await everything({ status: 'REFUNDED' })
    expect(await sampleTransactionDetail(first.orderId, NO_DELAY)).toMatchObject({ returnedAt: expect.any(String), refundAmount: first.amount })
    const log = await fetchOrderLog({ ...NO_DELAY, limit: 100000 })
    expect(log.every((o) => !('returnedAt' in o))).toBe(true)
  })
})

describe('sampleTransactionSummary', () => {
  it('summarises exactly the orders the dates match', async () => {
    const filters = { from: '2026-10-01', to: '2026-10-22' }
    const matched = buildOrderHistory().filter((o) => o.date >= filters.from && o.date <= filters.to)
    const summary = await sampleTransactionSummary(filters, NO_DELAY)
    const data = await everything(filters)
    const kept = data.filter((o) => o.status === 'PAID')
    expect(summary.count).toBe(matched.length)
    expect(summary.returnedCount).toBe(data.length - kept.length)
    expect(summary.gross).toBeCloseTo(kept.reduce((sum, o) => sum + o.amount, 0), 2)
    // VAT is at most 12/112 of the gross (less when lines are exempt or zero-rated), and some is exempt here.
    expect(summary.vat).toBeLessThan((summary.gross * 12) / 112)
    expect(summary.vat).toBeGreaterThan((summary.gross * 12) / 112 - summary.gross * 0.2)
  })
})
