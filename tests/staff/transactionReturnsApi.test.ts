import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../../src/service/fetchProductList'
import { fetchTransactionList, fetchTransactionSummary } from '../../src/service/fetchTransactions'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const api = vi.mocked(request)

const item = { id: 'a', orderNo: 'SF-10001', customerName: 'Maria', placedAt: '2026-10-22T07:45:00.000Z', itemCount: 2, total: 1000 }
const listOf = (...data: unknown[]) => ({ data, meta: { total: data.length } })
const returned = { returnedAt: '2026-10-24T02:05:00.000Z', returnReason: 'Wrong size', refundAmount: 1000 }

beforeEach(() => api.mockReset())

describe('GET /orders returned fields', () => {
  it('reads a returned order and leaves an active one without return fields', async () => {
    api.mockResolvedValue(listOf({ ...item, ...returned }, item))
    const { data } = await fetchTransactionList({})
    expect(data[0]).toMatchObject(returned)
    expect(data[1]).not.toHaveProperty('returnedAt')
  })

  it.each([
    ['only part of the return', { returnedAt: returned.returnedAt }],
    ['a partial refund', { ...returned, refundAmount: 400 }],
    ['an unknown reason', { ...returned, returnReason: 'Because' }],
    ['a return before the sale', { ...returned, returnedAt: '2026-10-21T00:00:00.000Z' }],
    ['a return that is not a date', { ...returned, returnedAt: 'soon' }],
  ])('rejects %s', async (_name, extra) => {
    api.mockResolvedValue(listOf({ ...item, ...extra }))
    await expect(fetchTransactionList({})).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('GET /orders/summary', () => {
  it('reads the net figures and the returned count', async () => {
    api.mockResolvedValue({ count: 10, gross: 8000, vat: 857.14, returnedCount: 2 })
    expect(await fetchTransactionSummary({})).toEqual({ count: 10, gross: 8000, vat: 857.14, returnedCount: 2 })
  })

  it.each([{ returnedCount: undefined }, { returnedCount: -1 }, { returnedCount: 1.5 }, { returnedCount: 11 }])('rejects %o', async (bad) => {
    api.mockResolvedValue({ count: 10, gross: 8000, vat: 857.14, ...bad })
    await expect(fetchTransactionSummary({})).rejects.toMatchObject({ kind: 'server' })
  })
})
