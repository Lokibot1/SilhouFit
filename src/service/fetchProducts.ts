import { PRODUCTS, type Product } from '../data/products'
import { simulateRequest, type RequestOptions } from './simulateRequest'

export interface CatalogueData {
  products: Product[]
  /** ISO time of the last stock sync. */
  syncedAt: string
}

// Stand-in for the real endpoint. Querying the whole list on the client (ShopPage and utils/productQuery) is a
// placeholder too: adapt this seam when the backend API arrives.
export async function fetchProducts({ signal, delayMs = 700 }: RequestOptions = {}): Promise<CatalogueData> {
  // Dev-only hook for exercising the error state: /shop?fail (`fail=order` is the checkout's own, for placing an order).
  await simulateRequest(delayMs, signal, () => {
    const fail = new URLSearchParams(location.search).get('fail')
    return import.meta.env.DEV && fail !== null && fail !== 'order'
  })
  return { products: PRODUCTS, syncedAt: new Date().toISOString() }
}
