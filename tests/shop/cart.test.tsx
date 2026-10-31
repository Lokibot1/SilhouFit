import { act, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { clearCartCache, useCart, useCartCount } from '../../src/hooks/useCart'
import { clearProductCache } from '../../src/hooks/useProducts'
import { ProductListError } from '../../src/service/fetchProductList'
import { addCartItem, fetchCart } from '../../src/service/cartApi'
import { fetchShopProduct } from '../../src/service/fetchShopProducts'
import { clearSession, setSession } from '../../src/service/session'
import { createCartStore, type CartStore, type StoreProduct } from '../fixtures/cartStore'
import { BLAZER, POLO, SOLD_OUT } from '../fixtures/shopProducts'
import { storeProducts, wireCartApi, wireShopProducts } from '../fixtures/wireCartApi'

vi.mock('../../src/service/cartApi')
vi.mock('../../src/service/fetchShopProducts')

const KEY = 'silhoufit-cart'
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? '[]')
const PIECES = [POLO, BLAZER, SOLD_OUT]
const NAVY = 'p01-m-navy' // 5 in stock
const BLACK = 'p02-m-black' // 4 in stock

let rows: StoreProduct[]
let server: CartStore

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>
async function setup() {
  const hook = renderHook(() => ({ cart: useCart(), count: useCartCount() }), { wrapper })
  await waitFor(() => expect(hook.result.current.cart.status).toBe('ready'))
  return hook
}
const signIn = () => setSession({ name: 'Test Shopper', email: 'shopper@example.com' })

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  clearSession()
  clearProductCache()
  rows = storeProducts(PIECES)
  server = createCartStore(() => rows)
  wireCartApi(server)
  wireShopProducts(PIECES)
  clearCartCache()
})

describe('guest cart', () => {
  it('adds a variant and keeps {variantId, productId, qty} in storage', async () => {
    const { result } = await setup()
    await act(async () => {
      expect(await result.current.cart.add({ product: POLO, variantId: NAVY, qty: 2 })).toBe('added')
    })
    expect(result.current.count).toBe(2)
    expect(stored()).toEqual([{ variantId: NAVY, productId: 'p01', qty: 2 }])
    expect(result.current.cart.lines[0]).toMatchObject({ name: 'Heritage Polo', size: 'M', color: 'Navy', unitPrice: 2100, stock: 5, active: true })
    expect(addCartItem).not.toHaveBeenCalled()
  })

  it('merges the same variant into one line and keeps others apart', async () => {
    const { result } = await setup()
    await act(async () => {
      await result.current.cart.add({ product: POLO, variantId: NAVY })
      await result.current.cart.add({ product: POLO, variantId: NAVY })
      await result.current.cart.add({ product: POLO, variantId: 'p01-s-white' })
    })
    expect(result.current.cart.lines.map((l) => [l.variantId, l.qty])).toEqual([[NAVY, 2], ['p01-s-white', 1]])
    expect(result.current.cart.qtyOfVariant(NAVY)).toBe(2)
    expect(result.current.count).toBe(3)
  })

  it("never adds past the variant's stock, and never a sold-out variant", async () => {
    const { result } = await setup()
    await act(async () => {
      expect(await result.current.cart.add({ product: BLAZER, variantId: BLACK, qty: 3 })).toBe('added')
      expect(await result.current.cart.add({ product: BLAZER, variantId: BLACK, qty: 2 })).toBe('limit') // 3 + 2 > 4
      expect(await result.current.cart.add({ product: BLAZER, variantId: BLACK, qty: 1 })).toBe('added')
      expect(await result.current.cart.add({ product: SOLD_OUT, variantId: 'p24-m-indigo' })).toBe('limit')
    })
    expect(result.current.count).toBe(4)
  })

  it('caps a stock limit per variant, not per piece', async () => {
    const { result } = await setup()
    await act(async () => {
      await result.current.cart.add({ product: POLO, variantId: NAVY, qty: 5 })
      expect(await result.current.cart.add({ product: POLO, variantId: 'p01-m-white', qty: 10 })).toBe('added')
    })
    expect(result.current.count).toBe(15)
  })

  it('takes a quantity off a line for Undo, dropping the line at zero', async () => {
    const { result } = await setup()
    await act(async () => void (await result.current.cart.add({ product: POLO, variantId: NAVY, qty: 3 })))
    await act(async () => void (await result.current.cart.remove(NAVY, 2)))
    expect(result.current.cart.qtyOfVariant(NAVY)).toBe(1)
    await act(async () => void (await result.current.cart.remove(NAVY, 1)))
    expect(result.current.cart.lines).toEqual([])
    expect(stored()).toEqual([])
  })

  it('sets a quantity capped at the stock, removes at zero and ignores a line that does not exist', async () => {
    const { result } = await setup()
    await act(async () => void (await result.current.cart.add({ product: BLAZER, variantId: BLACK })))
    await act(async () => void (await result.current.cart.setQty(BLACK, 9)))
    expect(result.current.cart.lines[0].qty).toBe(4)
    await act(async () => void (await result.current.cart.setQty('nope', 3)))
    expect(result.current.cart.lines).toHaveLength(1)
    await act(async () => void (await result.current.cart.setQty(BLACK, 0)))
    expect(result.current.cart.lines).toEqual([])
  })

  it('removes exactly the named lines', async () => {
    const { result } = await setup()
    await act(async () => {
      await result.current.cart.add({ product: POLO, variantId: NAVY })
      await result.current.cart.add({ product: POLO, variantId: 'p01-s-white' })
      await result.current.cart.add({ product: BLAZER, variantId: BLACK })
    })
    await act(async () => void (await result.current.cart.removeLines([NAVY, BLACK])))
    expect(result.current.cart.lines.map((l) => l.variantId)).toEqual(['p01-s-white'])
    expect(stored()).toHaveLength(1)
  })

  it('moves a line to another size and colour, joining the line already there', async () => {
    const { result } = await setup()
    await act(async () => {
      await result.current.cart.add({ product: POLO, variantId: NAVY, qty: 2 })
      await result.current.cart.add({ product: POLO, variantId: 'p01-s-white', qty: 1 })
    })
    let next = ''
    await act(async () => void (next = await result.current.cart.changeVariant(NAVY, 'S', 'White')))
    expect(next).toBe('p01-s-white')
    expect(result.current.cart.lines.map((l) => [l.variantId, l.qty])).toEqual([['p01-s-white', 3]])
  })

  it('keeps a line whose piece has gone, as one that cannot be bought', async () => {
    localStorage.setItem(KEY, JSON.stringify([{ variantId: 'gone-v', productId: 'gone', qty: 2 }, { variantId: NAVY, productId: 'p01', qty: 1 }]))
    clearCartCache()
    const { result } = await setup()
    expect(result.current.cart.lines.map((l) => [l.variantId, l.active])).toEqual([['gone-v', false], [NAVY, true]])
    expect(result.current.count).toBe(3)
    expect(stored()).toHaveLength(2)
  })

  it('shows an error with a retry when the pieces cannot be loaded', async () => {
    localStorage.setItem(KEY, JSON.stringify([{ variantId: NAVY, productId: 'p01', qty: 1 }]))
    const { fetchShopProduct } = await import('../../src/service/fetchShopProducts')
    vi.mocked(fetchShopProduct).mockRejectedValueOnce(new ProductListError('network'))
    clearCartCache()
    const hook = renderHook(() => useCart(), { wrapper })
    await waitFor(() => expect(hook.result.current.status).toBe('error'))
    act(() => hook.result.current.retry())
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    expect(hook.result.current.lines).toHaveLength(1)
  })

  it('survives corrupt storage and keeps only valid entries', async () => {
    localStorage.setItem(KEY, 'not json at all')
    clearCartCache()
    const first = await setup()
    expect(first.result.current.count).toBe(0)
    first.unmount()
    localStorage.setItem(KEY, JSON.stringify([{ variantId: NAVY, productId: 'p01', qty: 2 }, { variantId: 5, qty: 1 }, { id: 'p03', qty: 1 }, { variantId: 'x', productId: 'p01', qty: -1 }, null]))
    clearCartCache()
    const second = await setup()
    expect(second.result.current.count).toBe(2)
    expect(second.result.current.cart.lines).toHaveLength(1)
  })

  it('follows a change made in another tab', async () => {
    const { result } = await setup()
    localStorage.setItem(KEY, JSON.stringify([{ variantId: NAVY, productId: 'p01', qty: 3 }]))
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: KEY })))
    await waitFor(() => expect(result.current.count).toBe(3))
    localStorage.clear()
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: null })))
    await waitFor(() => expect(result.current.count).toBe(0))
  })

  it('keeps the cart in memory when storage is blocked', async () => {
    const { result } = await setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await act(async () => void (await result.current.cart.add({ product: POLO, variantId: NAVY })))
    expect(result.current.count).toBe(1)
    vi.restoreAllMocks()
  })
})

describe('signed-in cart', () => {
  beforeEach(() => {
    signIn()
  })

  it("loads the server's cart and counts its totalItems", async () => {
    server.seed(NAVY, 2)
    server.seed(BLACK, 1)
    const { result } = await setup()
    expect(fetchCart).toHaveBeenCalled()
    expect(result.current.count).toBe(3)
    expect(result.current.cart.lines.map((l) => [l.variantId, l.qty, l.itemId !== undefined])).toEqual([[NAVY, 2, true], [BLACK, 1, true]])
    expect(result.current.cart.lines[0]).toMatchObject({ productId: 'p01', name: 'Heritage Polo', unitPrice: 2100, stock: 5, active: true })
  })

  it('shows the product photo the cart carries (the primary image)', async () => {
    rows[0].images = [{ url: 'https://img.test/polo-back.webp', isPrimary: false }, { url: 'https://img.test/polo-front.webp', isPrimary: true }]
    server.seed(NAVY, 1)
    const { result } = await setup()
    expect(result.current.cart.lines[0].image).toBe('https://img.test/polo-front.webp')
    expect(fetchShopProduct).not.toHaveBeenCalled() // nothing to look up when the cart has the photo
  })

  it('adds with { variantId, quantity } and uses the cart the server returns', async () => {
    const { result } = await setup()
    await act(async () => {
      expect(await result.current.cart.add({ product: POLO, variantId: NAVY, qty: 2 })).toBe('added')
    })
    expect(addCartItem).toHaveBeenCalledWith(NAVY, 2)
    expect(result.current.count).toBe(2)
    expect(server.items).toHaveLength(1)
    expect(stored()).toEqual([]) // nothing local while signed in
  })

  it('stops at the variant stock before asking the server', async () => {
    server.seed(BLACK, 3)
    const { result } = await setup()
    await act(async () => {
      expect(await result.current.cart.add({ product: BLAZER, variantId: BLACK, qty: 2 })).toBe('limit')
    })
    expect(addCartItem).not.toHaveBeenCalled()
  })

  it('sets a quantity, and drops the item at zero', async () => {
    server.seed(NAVY, 2)
    const { result } = await setup()
    await act(async () => void (await result.current.cart.setQty(NAVY, 4)))
    expect(server.items[0].quantity).toBe(4)
    await act(async () => void (await result.current.cart.remove(NAVY, 4)))
    expect(server.items).toEqual([])
    expect(result.current.cart.lines).toEqual([])
    expect(result.current.count).toBe(0)
  })

  it('removes the named lines', async () => {
    server.seed(NAVY, 1)
    server.seed(BLACK, 1)
    const { result } = await setup()
    await act(async () => void (await result.current.cart.removeLines([NAVY])))
    expect(server.items.map((i) => i.variantId)).toEqual([BLACK])
    expect(result.current.cart.lines.map((l) => l.variantId)).toEqual([BLACK])
  })

  it('moves a line to another variant with an add and a delete', async () => {
    server.seed(NAVY, 2)
    const { result } = await setup()
    await act(async () => void (await result.current.cart.changeVariant(NAVY, 'S', 'White')))
    expect(server.items.map((i) => [i.variantId, i.quantity])).toEqual([['p01-s-white', 2]])
    expect(result.current.cart.lines.map((l) => l.variantId)).toEqual(['p01-s-white'])
  })

  it('marks a line of an archived product as not available, and does not drop it', async () => {
    server.seed(NAVY, 1)
    rows[0].isActive = false
    const { result } = await setup()
    expect(result.current.cart.lines[0].active).toBe(false)
    expect(result.current.count).toBe(1)
  })

  it('says why in a toast when the server refuses, and reloads the cart', async () => {
    server.seed(BLACK, 1)
    const { result } = await setup()
    rows[1].variants[0].stock = 1 // the stock fell after the cart loaded
    const calls = vi.mocked(fetchCart).mock.calls.length
    await act(async () => {
      expect(await result.current.cart.add({ product: BLAZER, variantId: BLACK })).toBe('failed')
    })
    expect(await screen.findByText(/Couldn't update your cart: Only 1 in stock/)).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(fetchCart).mock.calls.length).toBeGreaterThan(calls))
  })

  it('tells the shopper when the connection fails', async () => {
    const { result } = await setup()
    vi.mocked(addCartItem).mockRejectedValueOnce(new ProductListError('network'))
    await act(async () => {
      expect(await result.current.cart.add({ product: POLO, variantId: NAVY })).toBe('failed')
    })
    expect(await screen.findByText(/The request failed, most likely because the connection dropped/)).toBeInTheDocument()
  })

  it('shows an error with a retry when the cart cannot be loaded', async () => {
    vi.mocked(fetchCart).mockRejectedValueOnce(new ProductListError('server'))
    const hook = renderHook(() => useCart(), { wrapper })
    await waitFor(() => expect(hook.result.current.status).toBe('error'))
    act(() => hook.result.current.retry())
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  })
})

describe('signing in', () => {
  it("joins the guest cart to the server's once, then clears storage", async () => {
    localStorage.setItem(KEY, JSON.stringify([{ variantId: NAVY, productId: 'p01', qty: 2 }, { variantId: BLACK, productId: 'p02', qty: 1 }]))
    clearCartCache()
    const { result } = await setup()
    expect(result.current.count).toBe(3)

    act(() => signIn())
    await waitFor(() => expect(result.current.cart.status).toBe('ready'))
    await waitFor(() => expect(server.items).toHaveLength(2))
    expect(vi.mocked(addCartItem).mock.calls).toEqual([[NAVY, 2], [BLACK, 1]])
    expect(stored()).toEqual([])
    expect(result.current.count).toBe(3)
    expect(result.current.cart.lines.every((l) => l.itemId)).toBe(true)
  })

  it('adds to what the server already holds', async () => {
    server.seed(NAVY, 1)
    localStorage.setItem(KEY, JSON.stringify([{ variantId: NAVY, productId: 'p01', qty: 2 }]))
    clearCartCache()
    const { result } = await setup()
    act(() => signIn())
    await waitFor(() => expect(result.current.count).toBe(3))
  })

  it('leaves out a piece the server refuses, says so in a toast, and still clears storage', async () => {
    server.seed(BLACK, 4) // already all of the stock
    localStorage.setItem(KEY, JSON.stringify([{ variantId: BLACK, productId: 'p02', qty: 1 }, { variantId: NAVY, productId: 'p01', qty: 1 }]))
    clearCartCache()
    const { result } = await setup()
    act(() => signIn())
    await waitFor(() => expect(result.current.count).toBe(5))
    expect(await screen.findByText(/1 piece from your cart before sign-in could not be added \(Only 4 in stock\)/)).toBeInTheDocument()
    expect(stored()).toEqual([])
  })

  it('goes back to the guest cart on sign-out, and forgets the server cart', async () => {
    signIn()
    server.seed(NAVY, 2)
    clearCartCache()
    const { result } = await setup()
    expect(result.current.count).toBe(2)
    act(() => clearSession())
    await waitFor(() => expect(result.current.cart.status).toBe('ready'))
    expect(result.current.count).toBe(0)
    expect(result.current.cart.lines).toEqual([])
  })
})
