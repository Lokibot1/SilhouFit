import { useEffect, useState } from 'react'
import { fetchProducts, type CatalogueData } from '../service/fetchProducts'

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; data: CatalogueData }

// Module-level so returning to /shop from another route shows the last catalogue at once; a fresh copy still loads.
let cache: CatalogueData | null = null

/** Test seam: forget the cached catalogue. */
export function resetProductsCache() {
  cache = null
}

export function useProducts() {
  const [state, setState] = useState<State>(() => (cache ? { status: 'success', data: cache } : { status: 'loading' }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchProducts({ signal: controller.signal }).then(
      (data) => {
        cache = data
        setState({ status: 'success', data })
      },
      (error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        // A failed refresh keeps the cached catalogue on screen.
        if (!cache) setState({ status: 'error' })
      },
    )
    return () => controller.abort()
  }, [attempt])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  return { ...state, retry }
}
