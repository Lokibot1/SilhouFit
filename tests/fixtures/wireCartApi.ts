import { vi } from 'vitest'
import { addCartItem, clearCart, fetchCart, removeCartItem, setCartItemQuantity } from '../../src/service/cartApi'
import type { Product } from '../../src/data/products'
import { ProductListError, type ProductListErrorKind } from '../../src/service/fetchProductList'
import { fetchShopProduct } from '../../src/service/fetchShopProducts'
import type { CartReply, CartStore, StoreProduct } from './cartStore'

const KIND: Record<number, ProductListErrorKind> = { 400: 'validation', 401: 'forbidden', 404: 'not-found', 409: 'conflict' }

function answer(reply: CartReply) {
  if (reply.status >= 400) {
    const message = (reply.json as { message?: string[] }).message?.[0]
    throw new ProductListError(KIND[reply.status] ?? 'server', message)
  }
  return reply.json
}

/**
 * Makes the (auto-mocked) cartApi module answer from `store`. The test file needs `vi.mock('../../src/service/cartApi')`.
 * Returns nothing; assert on `store.items` or the mocked functions.
 */
export function wireCartApi(store: CartStore) {
  vi.mocked(fetchCart).mockImplementation(async () => answer(store.get()) as never)
  vi.mocked(addCartItem).mockImplementation(async (variantId, quantity) => answer(store.add(variantId, quantity)) as never)
  vi.mocked(setCartItemQuantity).mockImplementation(async (itemId, quantity) => answer(store.patch(itemId, quantity)) as never)
  vi.mocked(clearCart).mockImplementation(async () => void answer(store.clear()))
  vi.mocked(removeCartItem).mockImplementation(async (itemId) => void answer(store.remove(itemId)))
}

/** The store's view of shop fixtures; `isActive` can be flipped on the result to archive a piece. */
export const storeProducts = (products: Product[]): StoreProduct[] =>
  products.map((p) => ({ id: p.id, name: p.name, slug: p.slug ?? p.id, category: p.category, brand: p.boutique || null, isActive: true, variants: p.variants!.map((v) => ({ ...v })) }))

/** Makes the (auto-mocked) fetchShopProduct answer with these products, and not-found for any other. Needs `vi.mock('../../src/service/fetchShopProducts')`. */
export function wireShopProducts(products: Product[]) {
  vi.mocked(fetchShopProduct).mockImplementation(async (idOrSlug) => {
    const found = products.find((p) => p.id === idOrSlug || p.slug === idOrSlug)
    if (!found) throw new ProductListError('not-found')
    return found
  })
}
