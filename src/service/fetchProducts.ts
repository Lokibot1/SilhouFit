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
  // Dev-only hook for exercising the error state: /shop?fail.
  await simulateRequest(delayMs, signal, () => import.meta.env.DEV && new URLSearchParams(location.search).has('fail'))
  return { products: PRODUCTS, syncedAt: new Date().toISOString() }
}
