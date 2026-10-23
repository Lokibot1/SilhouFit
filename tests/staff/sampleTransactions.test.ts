import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildOrderHistory, fetchOrderLog } from '../../src/service/fetchStaffAnalytics'
import { sampleTransactionDetail, sampleTransactionList } from '../../src/service/sampleTransactions'

const NO_DELAY = { delayMs: 0 }
const all = { limit: 100000 }

beforeEach(() => {
  // 3:45 PM in Manila on Oct 22, 2026. Only Date is faked, so the request timers still run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-22T07:45:00Z'))
})
afterEach(() => vi.useRealTimers())

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

describe('sampleTransactionList', () => {
  it('defaults to newest first and reports the paging', async () => {
    const { data, meta } = await sampleTransactionList({ limit: 10 }, NO_DELAY)
    expect(data).toHaveLength(10)
    const times = data.map((o) => Date.parse(o.placedAt))
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(meta).toMatchObject({ page: 1, limit: 10, hasNextPage: true, hasPreviousPage: false })
    expect(meta.totalPages).toBe(Math.ceil(meta.total / 10))
    expect(meta.total).toBe(buildOrderHistory().length)

    const last = await sampleTransactionList({ limit: 10, page: meta.totalPages }, NO_DELAY)
    expect(last.meta).toMatchObject({ hasNextPage: false, hasPreviousPage: true })
    expect((await sampleTransactionList({ limit: 10, page: meta.totalPages + 1 }, NO_DELAY)).data).toEqual([])
  })

  it('searches the order number, ignoring case, and the customer name', async () => {
    const [first] = buildOrderHistory()
    const byNo = await sampleTransactionList({ search: first.orderId.toLowerCase(), ...all }, NO_DELAY)
    expect(byNo.data.map((o) => o.orderNo)).toContain(first.orderId)
    expect(byNo.data.every((o) => o.orderNo.toLowerCase().includes(first.orderId.toLowerCase()))).toBe(true)

    const byName = await sampleTransactionList({ search: first.customerName.toUpperCase(), ...all }, NO_DELAY)
    expect(byName.meta.total).toBeGreaterThan(0)
    expect(byName.data.every((o) => o.customerName === first.customerName)).toBe(true)
    expect((await sampleTransactionList({ search: 'zzzz nobody', ...all }, NO_DELAY)).meta.total).toBe(0)
  })

  it('keeps orders inside an inclusive Manila date range', async () => {
    const { data } = await sampleTransactionList({ from: '2026-10-05', to: '2026-10-06', ...all }, NO_DELAY)
    const expected = buildOrderHistory().filter((o) => o.date >= '2026-10-05' && o.date <= '2026-10-06')
    expect(data).toHaveLength(expected.length)
    expect(data.length).toBeGreaterThan(0)
    const today = await sampleTransactionList({ from: '2026-10-22', to: '2026-10-22', ...all }, NO_DELAY)
    expect(today.data.every((o) => o.placedAt >= '2026-10-21T16:00:00.000Z')).toBe(true)
    expect((await sampleTransactionList({ from: '2026-10-23', ...all }, NO_DELAY)).meta.total).toBe(0)
  })

  it('sorts by total and by customer in either direction', async () => {
    const high = (await sampleTransactionList({ sortBy: 'total', sortOrder: 'desc', limit: 50 }, NO_DELAY)).data.map((o) => o.total)
    expect(high).toEqual([...high].sort((a, b) => b - a))
    const low = (await sampleTransactionList({ sortBy: 'total', sortOrder: 'asc', limit: 50 }, NO_DELAY)).data.map((o) => o.total)
    expect(low).toEqual([...low].sort((a, b) => a - b))
    const names = (await sampleTransactionList({ sortBy: 'customerName', sortOrder: 'asc', limit: 50 }, NO_DELAY)).data.map((o) => o.customerName)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('answers the same query with the same rows, and pages do not overlap', async () => {
    const params = { sortBy: 'total', sortOrder: 'desc', limit: 25 } as const
    const two = await sampleTransactionList({ ...params, page: 2 }, NO_DELAY)
    expect(await sampleTransactionList({ ...params, page: 2 }, NO_DELAY)).toEqual(two)
    const one = await sampleTransactionList({ ...params, page: 1 }, NO_DELAY)
    const ids = [...one.data, ...two.data].map((o) => o.id)
    expect(new Set(ids).size).toBe(50)
  })

  it('rejects with an abort when cancelled', async () => {
    const controller = new AbortController()
    const pending = sampleTransactionList({}, { signal: controller.signal, delayMs: 50 })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('sampleTransactionDetail', () => {
  it('answers with the list fields, the lines and a subtotal that matches the total', async () => {
    const [{ id, orderNo, total, itemCount }] = (await sampleTransactionList({ limit: 1 }, NO_DELAY)).data
    const detail = await sampleTransactionDetail(id, NO_DELAY)
    expect(detail).toMatchObject({ id, orderNo, total, itemCount })
    expect(detail.lines.length).toBeGreaterThan(0)
    expect(detail.lines.reduce((sum, l) => sum + l.units, 0)).toBe(itemCount)
    expect(detail.subtotal).toBe(total)
    expect(await sampleTransactionDetail(id, NO_DELAY)).toEqual(detail)
  })

  it('rejects with not-found for an unknown order', async () => {
    await expect(sampleTransactionDetail('00000000-0000-4000-8000-999999999999', NO_DELAY)).rejects.toMatchObject({ kind: 'not-found' })
  })
})
