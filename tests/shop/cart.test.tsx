import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRODUCTS } from '../../src/data/products'
import { useCart, useCartCount } from '../../src/hooks/useCart'
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

describe('cart store', () => {
  it('adds one piece at a time and persists it', () => {
    const { result } = setup()
    act(() => {
      expect(result.current.cart.add(byId('p01'))).toBe('added')
      result.current.cart.add(byId('p01'))
      result.current.cart.add(byId('p03'))
    })
    expect(result.current.cart.qtyOf('p01')).toBe(2)
    expect(result.current.count).toBe(3)
    expect(stored()).toEqual(expect.arrayContaining([{ id: 'p01', qty: 2 }, { id: 'p03', qty: 1 }]))
  })

  it('refuses to go past the stock', () => {
    const { result } = setup()
    const blazer = byId('p02') // 4 in stock
    act(() => {
      for (let i = 0; i < 4; i++) expect(result.current.cart.add(blazer)).toBe('added')
      expect(result.current.cart.add(blazer)).toBe('limit')
    })
    expect(result.current.cart.qtyOf('p02')).toBe(4)
    expect(result.current.count).toBe(4)
  })

  it('never adds a sold-out piece', () => {
    const { result } = setup()
    act(() => {
      expect(result.current.cart.add(byId('p24'))).toBe('limit') // stock 0
    })
    expect(result.current.count).toBe(0)
  })

  it('undoes one add, dropping the line at zero', () => {
    const { result } = setup()
    act(() => {
      result.current.cart.add(byId('p01'))
      result.current.cart.add(byId('p01'))
    })
    act(() => result.current.cart.removeOne('p01'))
    expect(result.current.cart.qtyOf('p01')).toBe(1)
    act(() => result.current.cart.removeOne('p01'))
    expect(result.current.cart.qtyOf('p01')).toBe(0)
    expect(stored()).toEqual([])
  })

  it('survives corrupt storage and keeps only valid lines', () => {
    const { result } = setup()
    syncCart('not json at all')
    expect(result.current.count).toBe(0)
    syncCart('{"id":"p01"}')
    expect(result.current.count).toBe(0)
    syncCart(JSON.stringify([{ id: 'p01', qty: 2 }, { id: 5, qty: 1 }, { id: 'p03', qty: -1 }, { id: 'p04', qty: 1.5 }, null]))
    expect(result.current.count).toBe(2)
  })

  it('follows a change made in another tab', () => {
    const { result } = setup()
    syncCart(JSON.stringify([{ id: 'p03', qty: 3 }]))
    expect(result.current.count).toBe(3)
    syncCart()
    expect(result.current.count).toBe(0)
  })

  it('counts only catalogue pieces, capped at stock, without deleting the rest', () => {
    const { result } = setup()
    syncCart(JSON.stringify([{ id: 'p02', qty: 9 }, { id: 'gone', qty: 2 }]))
    expect(result.current.count).toBe(4)
    expect(stored()).toHaveLength(2)
  })

  it('reports no count until the catalogue is known', () => {
    const { result } = setup()
    syncCart(JSON.stringify([{ id: 'p01', qty: 2 }]))
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
      result.current.cart.add(byId('p01'))
    })
    expect(result.current.count).toBe(1)
    vi.restoreAllMocks()
  })
})
