import { useEffect, useState } from 'react'
import { fetchRecommendedProducts, fetchShopProducts } from '../service/fetchShopProducts'
import { toApiParams, type ProductPage, type ProductQuery } from '../utils/productQuery'
import { useDebouncedValue } from './useDebouncedValue'
import { cacheListProducts } from './useProducts'

/** `incomplete`: the fit ranking was refused because there is no body profile (404) or it lacks height, weight or build (422). */
type State = { status: 'loading' | 'error'; incomplete?: boolean } | { status: 'success'; page: ProductPage; syncedAt: string }

/**
 * One page of the shop from GET /products, filtered and sorted by the server. A change of query asks again after typing pauses; the
 * earlier page stays on screen until the new one arrives. The products are remembered for the product page and the cart.
 */
export function useShopCatalogue(query: ProductQuery) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const key = useDebouncedValue(JSON.stringify({ fit: !!query.fit, params: toApiParams(query) }), 300)

  useEffect(() => {
    const controller = new AbortController()
    const { fit, params } = JSON.parse(key)
    ;(fit ? fetchRecommendedProducts : fetchShopProducts)(params, { signal: controller.signal }).then(
      ({ products, ...page }) => {
        cacheListProducts(products)
        setState({ status: 'success', page: { items: products, ...page }, syncedAt: new Date().toISOString() })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', incomplete: fit && [404, 422].includes((error as { status?: number }).status ?? 0) })
      },
    )
    return () => controller.abort()
  }, [key, attempt])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }
  return state.status === 'success'
    ? { status: 'success' as const, retry, syncedAt: state.syncedAt, result: state.page, incomplete: false }
    : { status: state.status, retry, syncedAt: '', result: null, incomplete: state.incomplete === true }
}
