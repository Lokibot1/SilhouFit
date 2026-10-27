import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearProductCache } from '../../src/hooks/useProducts'
import { useTourProduct } from '../../src/hooks/useTourProduct'
import { fetchProductList, ProductListError } from '../../src/service/fetchProductList'
import { fetchShopProduct } from '../../src/service/fetchShopProducts'
import { POLO, SOLD_OUT } from '../fixtures/shopProducts'

vi.mock('../../src/service/fetchProductList', async (original) => ({
  ...(await original<typeof import('../../src/service/fetchProductList')>()),
  fetchProductList: vi.fn(),
}))
vi.mock('../../src/service/fetchShopProducts')

const list = (data: unknown[]) => ({ data, meta: { total: data.length, page: 1, limit: 1, totalPages: 1 } }) as never

beforeEach(() => {
  vi.resetAllMocks()
  clearProductCache()
})

describe('useTourProduct', () => {
  it('asks the API for the newest piece in stock and loads it in full, without touching the cart', async () => {
    vi.mocked(fetchProductList).mockResolvedValue(list([{ id: 'p01' }]))
    vi.mocked(fetchShopProduct).mockResolvedValue(POLO)
    const { result } = renderHook(() => useTourProduct())
    expect(result.current.ready).toBe(false)
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.product?.id).toBe('p01')
    expect(vi.mocked(fetchProductList).mock.calls[0][0]).toMatchObject({ limit: 1, inStockOnly: true, sortBy: 'createdAt' })
  })

  it('has no product, and is ready, when the shop has none', async () => {
    vi.mocked(fetchProductList).mockResolvedValue(list([]))
    const { result } = renderHook(() => useTourProduct())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.product).toBeNull()
    expect(fetchShopProduct).not.toHaveBeenCalled()
  })

  it('has no product when none of its variants is in stock', async () => {
    vi.mocked(fetchProductList).mockResolvedValue(list([{ id: 'p24' }]))
    vi.mocked(fetchShopProduct).mockResolvedValue(SOLD_OUT)
    const { result } = renderHook(() => useTourProduct())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.product).toBeNull()
  })

  it('has no product, and is ready, when the request fails', async () => {
    vi.mocked(fetchProductList).mockRejectedValue(new ProductListError('network'))
    const { result } = renderHook(() => useTourProduct())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.product).toBeNull()
  })
})
