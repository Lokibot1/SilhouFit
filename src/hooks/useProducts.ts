import { useEffect, useState, useSyncExternalStore } from 'react'
import { fetchProducts, type CatalogueData } from '../service/fetchProducts'

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; data: CatalogueData }

// Module-level so returning to /shop from another route shows the last catalogue at once; a fresh copy still loads.
let cache: CatalogueData | null = null

const listeners = new Set<() => void>()

function setCache(next: CatalogueData | null) {
  cache = next
  listeners.forEach((listener) => listener())
}

/** Test seams: forget, or pre-fill, the cached catalogue. */
export function resetProductsCache() {
  setCache(null)
}
export function primeProductsCache(data: CatalogueData) {
  setCache(data)
}

/** The products loaded so far (null until the first load), for UI outside the shop page, e.g. the navbar. */
export function useCatalogue() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => cache,
  )?.products ?? null
}

export function useProducts() {
  const [state, setState] = useState<State>(() => (cache ? { status: 'success', data: cache } : { status: 'loading' }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchProducts({ signal: controller.signal }).then(
      (data) => {
        setCache(data)
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
