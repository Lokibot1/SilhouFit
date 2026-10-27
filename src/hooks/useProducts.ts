import { useEffect, useState } from 'react'
import type { Product } from '../data/products'
import { ProductListError } from '../service/fetchProductList'
import { fetchShopProduct } from '../service/fetchShopProducts'

// Products from the API, by id and by slug, in memory for the session. Shop list pages fill it with what a card needs; a product's
// detail (variants, so sizes, colours, per-variant price and stock) replaces that entry. Staff changes clear it (`clearProductCache`).
const byId = new Map<string, Product>()
const idBySlug = new Map<string, string>()
const inflight = new Map<string, Promise<Product>>()

function remember(product: Product) {
  byId.set(product.id, product)
  if (product.slug) idBySlug.set(product.slug, product.id)
  return product
}

/** Remembers the products of a shop list page. One already loaded in full keeps its detail. */
export function cacheListProducts(products: Product[]) {
  for (const product of products) if (!byId.get(product.id)?.variants) remember(product)
}

/** A remembered product by id or slug, outside React. */
export const getCachedProduct = (idOrSlug: string) => byId.get(idOrSlug) ?? byId.get(idBySlug.get(idOrSlug) ?? '')

export function clearProductCache() {
  byId.clear()
  idBySlug.clear()
  inflight.clear()
}

/** A product in full by id or slug (variants included), from memory unless `fresh`. A product that is archived or gone rejects with kind 'not-found'. Callers share one request. */
export function loadProduct(idOrSlug: string, { fresh = false } = {}): Promise<Product> {
  const known = getCachedProduct(idOrSlug)
  if (known?.variants && !fresh) return Promise.resolve(known)
  let pending = inflight.get(idOrSlug)
  if (!pending) {
    pending = fetchShopProduct(idOrSlug).then(remember)
    pending.then(
      () => inflight.delete(idOrSlug),
      () => inflight.delete(idOrSlug),
    )
    inflight.set(idOrSlug, pending)
  }
  return pending
}

const isNotFound = (error: unknown) => error instanceof ProductListError && error.kind === 'not-found'

/** The products with these ids, in order, loaded in full. An id that is archived or gone is left out; any other failure rejects. */
export async function resolveProducts(ids: string[]): Promise<Product[]> {
  const found = await Promise.all(ids.map((id) => loadProduct(id).catch((error: unknown) => (isNotFound(error) ? null : Promise.reject(error)))))
  return found.filter((product): product is Product => product !== null)
}

type ProductState = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'success'; product: Product }

/** One product by slug or id. A remembered one shows at once and is refreshed behind it; a failed refresh keeps it. */
export function useProduct(idOrSlug: string | undefined) {
  const [loaded, setLoaded] = useState<{ key: string; state: ProductState } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const known = idOrSlug ? getCachedProduct(idOrSlug) : undefined
  const state: ProductState = loaded && loaded.key === idOrSlug ? loaded.state : known?.variants ? { status: 'success', product: known } : { status: 'loading' }

  useEffect(() => {
    if (!idOrSlug) return
    let current = true
    loadProduct(idOrSlug, { fresh: true }).then(
      (product) => current && setLoaded({ key: idOrSlug, state: { status: 'success', product } }),
      (error: unknown) => {
        if (!current) return
        if (isNotFound(error)) setLoaded({ key: idOrSlug, state: { status: 'missing' } })
        else if (!getCachedProduct(idOrSlug)?.variants) setLoaded({ key: idOrSlug, state: { status: 'error' } })
      },
    )
    return () => {
      current = false
    }
  }, [idOrSlug, attempt])

  function retry() {
    setLoaded(null)
    setAttempt((n) => n + 1)
  }
  return { ...state, retry }
}

/** Several products by id, loaded in full (see `resolveProducts`). */
export function useProductsByIds(ids: string[]) {
  const key = ids.join(',')
  const [loaded, setLoaded] = useState<{ key: string; products: Product[] | 'error' } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    resolveProducts(key ? key.split(',') : []).then(
      (products) => current && setLoaded({ key, products }),
      () => current && setLoaded({ key, products: 'error' }),
    )
    return () => {
      current = false
    }
  }, [key, attempt])

  function retry() {
    setLoaded(null)
    setAttempt((n) => n + 1)
  }
  if (!loaded || loaded.key !== key) {
    // Ids already loaded in full show at once (a card removed from the wishlist, or an Undo), without a skeleton in between.
    const known = ids.map(getCachedProduct)
    return known.every((product) => product?.variants) ? { status: 'success' as const, products: known as Product[], retry } : { status: 'loading' as const, retry }
  }
  return loaded.products === 'error' ? { status: 'error' as const, retry } : { status: 'success' as const, products: loaded.products, retry }
}
