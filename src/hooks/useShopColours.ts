import { useEffect, useState } from 'react'
import { fetchProductFilters, type ProductFilterOptions } from '../service/fetchProductFilters'
import { clearProductCache } from './useProducts'

export interface ShopColour {
  name: string
  /** Null when the variant has no swatch colour. */
  hex: string | null
}

/** True when `colour` is the option's name, ignoring case. */
export const sameColour = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** The option a URL colour names, or undefined when no loaded colour matches it (an unknown colour is dropped). */
export const validColour = (colour: string | undefined, options: ShopColour[]) => options.find((option) => colour !== undefined && sameColour(option.name, colour))?.name

let cached: ProductFilterOptions | null = null
let loading: Promise<ProductFilterOptions> | null = null
// Bumped by every invalidation, so a load that started before one cannot store its (stale) answer.
let generation = 0

/** Staff created, changed, archived or deleted a product or variant: the filter options (and the products cached with them) are loaded again next time. */
export function invalidateShopColours() {
  generation++
  cached = null
  loading = null
  clearProductCache()
}

function facets(): Promise<ProductFilterOptions> {
  if (cached) return Promise.resolve(cached)
  if (!loading) {
    const started = generation
    const pending = fetchProductFilters().then((found) => {
      if (started === generation) cached = found
      return found
    })
    loading = pending
    const done = () => {
      if (loading === pending) loading = null
    }
    pending.then(done, done)
  }
  return loading
}

type FacetState = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; facets: ProductFilterOptions }

/**
 * What the active products offer (colours, sizes, brands, prices), from one GET /products/filters. Nothing is requested until `enabled`
 * (the dialog opens); the answer is kept for the session. A failure is quiet, and the next opening tries again.
 */
function useFacets(enabled: boolean): FacetState {
  const [state, setState] = useState<FacetState>(() => (cached ? { status: 'ready', facets: cached } : { status: 'idle' }))

  useEffect(() => {
    if (!enabled) return
    let current = true
    facets().then(
      (found) => current && setState({ status: 'ready', facets: found }),
      () => current && setState({ status: 'error' }),
    )
    return () => {
      current = false
    }
  }, [enabled])

  // Each opening that has nothing yet shows the skeleton until the answer arrives.
  return enabled && state.status === 'idle' ? { status: 'loading' } : state
}

type State = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; colours: ShopColour[] }

/** The colours to offer in the Filters dialog; the colour section is hidden while loading fails. */
export function useShopColours(enabled: boolean): State {
  const state = useFacets(enabled)
  return state.status === 'ready' ? { status: 'ready', colours: state.facets.colors } : state
}

/** The sizes, brands and price range to suggest in a filter dialog, or null until they are known (or if they could not be read). */
export function useShopFacets(enabled: boolean): ProductFilterOptions | null {
  const state = useFacets(enabled)
  return state.status === 'ready' ? state.facets : null
}
