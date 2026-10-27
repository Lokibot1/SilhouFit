import { useEffect, useState } from 'react'
import { fetchShopProducts } from '../service/fetchShopProducts'
import { toApiParams, type ProductPage, type ProductQuery } from '../utils/productQuery'
import { useDebouncedValue } from './useDebouncedValue'
import { cacheListProducts } from './useProducts'

type State = { status: 'loading' | 'error' } | { status: 'success'; page: ProductPage; syncedAt: string }

/**
 * One page of the shop from GET /products, filtered and sorted by the server. A change of query asks again after typing pauses; the
 * earlier page stays on screen until the new one arrives. The products are remembered for the product page and the cart.
 */
export function useShopCatalogue(query: ProductQuery) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const key = useDebouncedValue(JSON.stringify(toApiParams(query)), 300)

  useEffect(() => {
    const controller = new AbortController()
    fetchShopProducts(JSON.parse(key), { signal: controller.signal }).then(
      ({ products, ...page }) => {
        cacheListProducts(products)
        setState({ status: 'success', page: { items: products, ...page }, syncedAt: new Date().toISOString() })
      },
      () => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      },
    )
    return () => controller.abort()
  }, [key, attempt])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }
  return state.status === 'success'
    ? { status: 'success' as const, retry, syncedAt: state.syncedAt, result: state.page }
    : { status: state.status, retry, syncedAt: '', result: null }
}
