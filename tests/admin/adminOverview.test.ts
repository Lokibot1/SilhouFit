import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError, request } from '../../src/service/fetchProductList'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const { getStockFigures } = await import('../../src/service/adminOverview')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getStockFigures', () => {
  it('reads the metrics with the low stock threshold and maps the counts', async () => {
    send.mockResolvedValue({ totalProducts: 40, arReadyProducts: 8, outOfStockCount: 3, lowStockCount: 7, lowStockThreshold: 5 })
    const signal = new AbortController().signal
    await expect(getStockFigures({ signal })).resolves.toEqual({ out: 3, low: 7 })
    expect(send).toHaveBeenCalledWith('GET', '/products/metrics?lowStockThreshold=5', undefined, signal)
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
