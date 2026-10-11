import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PRODUCTS } from '../../src/data/products'
import { lineKey, useCart } from '../../src/hooks/useCart'
import { primeProductsCache, resetProductsCache } from '../../src/hooks/useProducts'

const KEY = 'silhoufit-cart'
const byId = (id: string) => PRODUCTS.find((p) => p.id === id)!
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? '[]')

beforeEach(() => {
  localStorage.clear()
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
  })
  resetProductsCache()
  primeProductsCache({ products: PRODUCTS, syncedAt: '2026-10-10T15:05:00' })
})

describe('cart setQty and removeLines', () => {
  it("sets a line quantity, capped so all of a piece's lines stay within its stock", () => {
    const { result } = renderHook(() => useCart())
    const blazer = byId('p02') // 4 in stock
    act(() => {
      result.current.add({ product: blazer, size: 'S', color: 'Black', qty: 1 })
      result.current.add({ product: blazer, size: 'M', color: 'Black', qty: 2 })
    })
    const key = lineKey({ id: 'p02', size: 'S', color: 'Black' })
    act(() => result.current.setQty(key, 9)) // 4 in stock, 2 held by the M line, so S can reach 2 at most
    expect(result.current.lines.find((l) => l.size === 'S')!.qty).toBe(2)
    expect(result.current.qtyOfProduct('p02')).toBe(4)
    act(() => result.current.setQty(key, 0))
    expect(result.current.lines.map((l) => l.size)).toEqual(['M'])
  })

  it('ignores setQty for a line that does not exist', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.setQty('nope||', 3))
    expect(result.current.lines).toEqual([])
  })

  it('removes exactly the named lines, leaving ones added meanwhile', () => {
    const { result } = renderHook(() => useCart())
    act(() => {
      result.current.add({ product: byId('p01'), size: 'M', color: 'Navy' })
      result.current.add({ product: byId('p01'), size: 'L', color: 'Navy' })
      result.current.add({ product: byId('p03'), size: 'S', color: 'Black' })
    })
    act(() =>
      result.current.removeLines([
        lineKey({ id: 'p01', size: 'M', color: 'Navy' }),
        lineKey({ id: 'p03', size: 'S', color: 'Black' }),
      ]),
    )
    expect(result.current.lines.map((l) => `${l.id}${l.size}`)).toEqual(['p01L'])
    expect(stored()).toHaveLength(1)
  })
})
