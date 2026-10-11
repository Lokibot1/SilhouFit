import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRODUCTS, sizesFor } from '../../src/data/products'
import { lineKey, useCart, useCartCount } from '../../src/hooks/useCart'
import { primeProductsCache, resetProductsCache } from '../../src/hooks/useProducts'

const KEY = 'silhoufit-cart'
const byId = (id: string) => PRODUCTS.find((p) => p.id === id)!

// The store re-reads localStorage on a storage event, which is also how another tab reaches it.
function syncCart(raw?: string) {
  if (raw === undefined) localStorage.clear()
  else localStorage.setItem(KEY, raw)
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: raw === undefined ? null : KEY }))
  })
}
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? '[]')

function setup() {
  return renderHook(() => ({ cart: useCart(), count: useCartCount() }))
}

beforeEach(() => {
  syncCart()
  resetProductsCache()
  primeProductsCache({ products: PRODUCTS, syncedAt: '2026-10-10T15:05:00' })
})

describe('sizes', () => {
  it('offers sizes by category', () => {
    expect(sizesFor(byId('p01'))).toEqual(['XS', 'S', 'M', 'L', 'XL']) // Tops
    expect(sizesFor(byId('p04'))).toEqual(['26', '28', '30', '32', '34', '36']) // Bottoms
    expect(sizesFor(byId('p07'))).toEqual(['XS', 'S', 'M', 'L']) // Dresses
  })
})

describe('cart store', () => {
  it('adds a piece with a size, colour and quantity and persists it', () => {
    const { result } = setup()
    act(() => {
      expect(result.current.cart.add({ product: byId('p01'), size: 'M', color: 'Navy', qty: 2 })).toBe('added')
    })
    expect(result.current.count).toBe(2)
    expect(stored()).toEqual([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }])
  })

  it('keeps several lines per piece and merges the same size and colour', () => {
    const { result } = setup()
    const polo = byId('p01')
    act(() => {
      result.current.cart.add({ product: polo, size: 'M', color: 'Navy' })
      result.current.cart.add({ product: polo, size: 'M', color: 'Navy' })
      result.current.cart.add({ product: polo, size: 'L', color: 'Navy' })
      result.current.cart.add({ product: polo, size: 'M', color: 'White' })
    })
    expect(result.current.cart.lines).toHaveLength(3)
    expect(result.current.cart.qtyOfProduct('p01')).toBe(4)
    expect(result.current.count).toBe(4)
  })

  it('caps the total across all lines of a piece at its stock', () => {
    const { result } = setup()
    const blazer = byId('p02') // 4 in stock
    act(() => {
      expect(result.current.cart.add({ product: blazer, size: 'S', color: 'Black', qty: 3 })).toBe('added')
      expect(result.current.cart.add({ product: blazer, size: 'M', color: 'Black', qty: 2 })).toBe('limit') // 3 + 2 > 4
      expect(result.current.cart.add({ product: blazer, size: 'M', color: 'Black', qty: 1 })).toBe('added')
      expect(result.current.cart.add({ product: blazer, size: 'L', color: 'Black' })).toBe('limit')
    })
    expect(result.current.cart.qtyOfProduct('p02')).toBe(4)
    expect(result.current.count).toBe(4)
  })

  it('never adds a sold-out piece', () => {
    const { result } = setup()
    act(() => {
      expect(result.current.cart.add({ product: byId('p24'), size: 'M', color: 'Indigo' })).toBe('limit')
    })
    expect(result.current.count).toBe(0)
  })

  it('removes a quantity from a line for Undo, dropping the line at zero', () => {
    const { result } = setup()
    const key = lineKey({ id: 'p01', size: 'M', color: 'Navy' })
    act(() => {
      result.current.cart.add({ product: byId('p01'), size: 'M', color: 'Navy', qty: 3 })
    })
    act(() => result.current.cart.remove(key, 2))
    expect(result.current.cart.qtyOfProduct('p01')).toBe(1)
    act(() => result.current.cart.remove(key, 1))
    expect(result.current.cart.lines).toEqual([])
    expect(stored()).toEqual([])
  })

  it('only removes from the line that was added, not another size', () => {
    const { result } = setup()
    act(() => {
      result.current.cart.add({ product: byId('p01'), size: 'M', color: 'Navy' })
      result.current.cart.add({ product: byId('p01'), size: 'L', color: 'Navy' })
    })
    act(() => result.current.cart.remove(lineKey({ id: 'p01', size: 'L', color: 'Navy' }), 1))
    expect(result.current.cart.lines.map((l) => l.size)).toEqual(['M'])
  })

  it('keeps lines saved before sizes existed, but they are not counted as buyable', () => {
    const { result } = setup()
    syncCart(JSON.stringify([{ id: 'p03', qty: 2 }]))
    expect(result.current.count).toBe(0) // no size or colour: the drawer and checkout leave them out too
    expect(result.current.cart.lines).toEqual([{ id: 'p03', size: null, color: null, qty: 2 }])
  })

  it('survives corrupt storage and keeps only valid lines', () => {
    const { result } = setup()
    syncCart('not json at all')
    expect(result.current.count).toBe(0)
    syncCart('{"id":"p01"}')
    expect(result.current.count).toBe(0)
    syncCart(JSON.stringify([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }, { id: 5, qty: 1 }, { id: 'p03', qty: -1 }, { id: 'p04', qty: 1.5 }, null]))
    expect(result.current.count).toBe(2)
    expect(result.current.cart.lines).toHaveLength(1)
  })

  it('follows a change made in another tab', () => {
    const { result } = setup()
    syncCart(JSON.stringify([{ id: 'p03', size: 'M', color: 'White', qty: 3 }]))
    expect(result.current.count).toBe(3)
    syncCart()
    expect(result.current.count).toBe(0)
  })

  it('counts only catalogue pieces, capped at stock, without deleting the rest', () => {
    const { result } = setup()
    syncCart(
      JSON.stringify([
        { id: 'p02', size: 'S', color: 'Black', qty: 3 },
        { id: 'p02', size: 'M', color: 'Black', qty: 3 },
        { id: 'gone', qty: 2 },
      ]),
    )
    expect(result.current.count).toBe(4)
    expect(stored()).toHaveLength(3)
  })

  it('reports no count until the catalogue is known', () => {
    const { result } = setup()
    syncCart(JSON.stringify([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }]))
    act(() => resetProductsCache())
    expect(result.current.count).toBe(0)
    act(() => primeProductsCache({ products: PRODUCTS, syncedAt: 'x' }))
    expect(result.current.count).toBe(2)
  })

  it('keeps the cart in memory when storage is blocked', () => {
    const { result } = setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    act(() => {
      result.current.cart.add({ product: byId('p01'), size: 'M', color: 'Navy' })
    })
    expect(result.current.count).toBe(1)
    vi.restoreAllMocks()
  })
})
