import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError, request } from '../../src/service/fetchProductList'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const { getArFigures, getStockFigures, getRefundFigures } = await import('../../src/service/adminOverview')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getStockFigures', () => {
  it('reads the metrics with the low stock threshold and maps the counts', async () => {
    send.mockResolvedValue({ totalProducts: 40, arReadyProducts: 8, outOfStockCount: 3, lowStockCount: 7, lowStockThreshold: 5 })
    await expect(getStockFigures({ signal: new AbortController().signal })).resolves.toEqual({ out: 3, low: 7 })
    // The request is shared by the cards, so it carries no signal of its own.
    expect(send).toHaveBeenCalledWith('GET', '/products/metrics?lowStockThreshold=5', undefined, undefined)
  })

  it('rejects a body without both counts as a server error', async () => {
    send.mockResolvedValue({ lowStockCount: 1 })
    await expect(getStockFigures()).rejects.toMatchObject({ kind: 'server' })
  })

  it('passes a rate limit through with its retry delay', async () => {
    send.mockRejectedValue(new ProductListError('rate-limit', undefined, 429, undefined, 4000))
    await expect(getStockFigures()).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 4000 })
  })
})

describe('getArFigures', () => {
  it('maps the AR-ready and total product counts', async () => {
    send.mockResolvedValue({ totalProducts: 40, arReadyProducts: 8, outOfStockCount: 3, lowStockCount: 7, lowStockThreshold: 5 })
    await expect(getArFigures()).resolves.toEqual({ ready: 8, products: 40 })
  })

  it('rejects a body without both counts as a server error', async () => {
    send.mockResolvedValue({ totalProducts: 40 })
    await expect(getArFigures()).rejects.toMatchObject({ kind: 'server' })
    send.mockResolvedValue([])
    await expect(getArFigures()).rejects.toMatchObject({ kind: 'server' })
  })

  it('passes a rate limit through with its retry delay', async () => {
    send.mockRejectedValue(new ProductListError('rate-limit', undefined, 429, undefined, 4000))
    await expect(getArFigures()).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 4000 })
  })
})

describe('the AR-ready and stock cards together', () => {
  it('share one request while it is in flight, and ask again once it is done', async () => {
    send.mockResolvedValue({ totalProducts: 40, arReadyProducts: 8, outOfStockCount: 3, lowStockCount: 7, lowStockThreshold: 5 })
    await expect(Promise.all([getArFigures(), getStockFigures()])).resolves.toEqual([{ ready: 8, products: 40 }, { out: 3, low: 7 }])
    expect(send).toHaveBeenCalledTimes(1)
    await getStockFigures()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('stops one card waiting when its signal aborts, without cancelling the other', async () => {
    send.mockResolvedValue({ totalProducts: 40, arReadyProducts: 8, outOfStockCount: 3, lowStockCount: 7, lowStockThreshold: 5 })
    const gone = new AbortController()
    const leaving = getArFigures({ signal: gone.signal })
    const staying = getStockFigures()
    gone.abort()
    await expect(leaving).rejects.toMatchObject({ name: 'AbortError' })
    await expect(staying).resolves.toEqual({ out: 3, low: 7 })
  })

  it('lets a failed read be retried', async () => {
    send.mockRejectedValueOnce(new ProductListError('server'))
    await expect(getStockFigures()).rejects.toMatchObject({ kind: 'server' })
    send.mockResolvedValue({ totalProducts: 40, arReadyProducts: 8, outOfStockCount: 3, lowStockCount: 7, lowStockThreshold: 5 })
    await expect(getStockFigures()).resolves.toEqual({ out: 3, low: 7 })
  })
})

const TX = { totalTransactions: 42, paidCount: 40, refundedCount: 2, failedCount: 0, pendingCount: 0, totalGrossVolume: 72031, totalFeeVolume: 0, totalNetVolume: 142 }

describe('getRefundFigures', () => {
  it('counts refunded and partly refunded payments against every payment', async () => {
    send.mockResolvedValue({ ...TX, partiallyRefundedCount: 1 })
    await expect(getRefundFigures()).resolves.toEqual({ refunded: 3, payments: 42 })
    expect(send).toHaveBeenCalledWith('GET', '/admin/transactions/metrics', undefined, undefined)
  })

  it('works with an older API that has no partial count', async () => {
    send.mockResolvedValue(TX)
    await expect(getRefundFigures()).resolves.toEqual({ refunded: 2, payments: 42 })
  })

  it('rejects a body without the counts as a server error', async () => {
    send.mockResolvedValue({ totalTransactions: 5 })
    await expect(getRefundFigures()).rejects.toMatchObject({ kind: 'server' })
  })

  it('passes a rate limit through', async () => {
    send.mockRejectedValue(new ProductListError('rate-limit', undefined, 429, undefined, 4000))
    await expect(getRefundFigures()).rejects.toMatchObject({ kind: 'rate-limit' })
  })
})
