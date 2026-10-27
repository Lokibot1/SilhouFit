import { useEffect, useState } from 'react'
import type { Product } from '../data/products'
import { fetchProductList } from '../service/fetchProductList'
import { loadProduct } from './useProducts'

/**
 * The piece the tour shows: the first in-stock one from the API, loaded in full (its variants). `product` is null when the shop has
 * none, or the request failed; the tour then runs on its fallback copy. The cart is never touched.
 */
export function useTourProduct() {
  const [state, setState] = useState<{ ready: boolean; product: Product | null }>({ ready: false, product: null })

  useEffect(() => {
    const controller = new AbortController()
    fetchProductList({ limit: 1, inStockOnly: true, sortBy: 'createdAt' }, { signal: controller.signal })
      .then(({ data }) => (data[0] ? loadProduct(data[0].id) : null))
      .then(
        (product) => setState({ ready: true, product: product?.variants?.some((v) => v.stock > 0) ? product : null }),
        () => !controller.signal.aborted && setState({ ready: true, product: null }),
      )
    return () => controller.abort()
  }, [])

  return state
}
