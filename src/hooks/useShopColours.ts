import { useEffect, useState } from 'react'
import { fetchProductList, ProductListError } from '../service/fetchProductList'
import { clearProductCache, loadProduct } from './useProducts'

export interface ShopColour {
  name: string
  /** Null when the variant has no swatch colour. */
  hex: string | null
}

const PAGE_SIZE = 100
const CONCURRENCY = 4

/** True when `colour` is the option's name, ignoring case. */
export const sameColour = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** The option a URL colour names, or undefined when no loaded colour matches it (an unknown colour is dropped). */
export const validColour = (colour: string | undefined, options: ShopColour[]) => options.find((option) => colour !== undefined && sameColour(option.name, colour))?.name

let cached: ShopColour[] | null = null
let loading: Promise<ShopColour[]> | null = null
// Bumped by every invalidation, so a load that started before one cannot store its (stale) answer.
let generation = 0

/** Staff created, changed, archived or deleted a product or variant: the colours (and the products they came from) are loaded again next time. */
export function invalidateShopColours() {
  generation++
  cached = null
  loading = null
  clearProductCache()
}

async function everyActiveProductId() {
  const ids: string[] = []
  for (let page = 1; ; page++) {
    const { data, meta } = await fetchProductList({ limit: PAGE_SIZE, page })
    ids.push(...data.map((item) => item.id))
    if (!meta.hasNextPage) return ids
  }
}

/**
 * The colours that exist on active products. N+1 on purpose: GET /products lists no variants, so each product's detail is fetched
 * (through the shared product cache, four at a time) and its variants' colours collected. Replace this with the backend's
 * GET /products/filters once it exists.
 */
async function loadColours(): Promise<ShopColour[]> {
  const ids = await everyActiveProductId()
  const colours = new Map<string, ShopColour>()
  let next = 0
  async function worker() {
    while (next < ids.length) {
      // Archived since the list was read: it has no colours to offer.
      const product = await loadProduct(ids[next++]).catch((error: unknown) => (error instanceof ProductListError && error.kind === 'not-found' ? null : Promise.reject(error)))
      for (const { color, colorHex } of product?.variants ?? []) {
        if (!color) continue
        const known = colours.get(color.toLowerCase())
        if (!known) colours.set(color.toLowerCase(), { name: color, hex: colorHex })
        else if (!known.hex && colorHex) known.hex = colorHex
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker))
  return [...colours.values()]
}

function colours(): Promise<ShopColour[]> {
  if (cached) return Promise.resolve(cached)
  if (!loading) {
    const started = generation
    const pending = loadColours().then((found) => {
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

type State = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; colours: ShopColour[] }

/**
 * The colours to offer in the Filters dialog. Nothing is requested until `enabled` (the dialog opens); the answer is kept for the
 * session. A failure is quiet: the dialog hides the colour section, and the next opening tries again.
 */
export function useShopColours(enabled: boolean): State {
  const [state, setState] = useState<State>(() => (cached ? { status: 'ready', colours: cached } : { status: 'idle' }))

  useEffect(() => {
    if (!enabled) return
    let current = true
    colours().then(
      (found) => current && setState({ status: 'ready', colours: found }),
      () => current && setState({ status: 'error' }),
    )
    return () => {
      current = false
    }
  }, [enabled])

  // Each opening that has nothing yet shows the skeleton until the answer arrives.
  return enabled && state.status === 'idle' ? { status: 'loading' } : state
}
