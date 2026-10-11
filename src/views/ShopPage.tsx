import { animate, MotionConfig, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CategoryPills } from '../components/shop/CategoryPills'
import { FilterPanel } from '../components/shop/FilterPanel'
import { Pagination } from '../components/shop/Pagination'
import { ProductCard } from '../components/shop/ProductCard'
import { ShopHeader } from '../components/shop/ShopHeader'
import { ProductGridSkeleton, SummarySkeleton } from '../components/shop/ShopSkeleton'
import { ShopSummary, ShopToolbar } from '../components/shop/ShopToolbar'
import { TryOnPromo } from '../components/shop/TryOnPromo'
import { useToast } from '../components/toast/useToast'
import { PRIMARY_BUTTON } from '../components/ui/buttonStyles'
import { CATEGORIES, type Product } from '../data/products'
import { DURATION } from '../motion/tokens'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useMetaDescription } from '../hooks/useMetaDescription'
import { useProducts } from '../hooks/useProducts'
import { useCart } from '../hooks/useCart'
import { useSavedIds, useWishlist } from '../hooks/useWishlist'
import {
  AVAILABILITY,
  categoryCounts,
  PER_PAGE_OPTIONS,
  queryProducts,
  shopTitle,
  SORT_OPTIONS,
  type Availability,
  type ProductFilters,
} from '../utils/productQuery'

const DESCRIPTION =
  'Browse the SilhouFit catalogue: filter by category, check online and in-store stock, and preview how each piece fits with browser-based AR before you buy it.'

// Params holding their default are dropped from the URL.
const DEFAULTS: Record<string, string> = { category: 'all', sort: 'featured', perPage: '12', view: 'grid', page: '1' }
const FILTER_KEYS = ['category', 'q', 'min', 'max', 'colors', 'avail', 'ar', 'saved', 'page']

const price = (value: string | null) => (value !== null && /^\d+$/.test(value) ? Number(value) : undefined)

export function ShopPage() {
  useDocumentTitle('Shop the catalogue — SilhouFit')
  useMetaDescription(DESCRIPTION)

  const products = useProducts()
  const wishlist = useWishlist()
  const savedIds = useSavedIds()
  const cart = useCart()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const scrollOnPage = useRef(false)
  const listRef = useRef<HTMLUListElement>(null)
  const reduced = useReducedMotion()
  const urlState = params.toString()
  const shownUrlState = useRef(urlState)

  const category = CATEGORIES.find((c) => c === params.get('category')) ?? 'all'
  const q = params.get('q') ?? ''
  const sort = SORT_OPTIONS.find((o) => o.value === params.get('sort'))?.value ?? 'featured'
  const perPage = PER_PAGE_OPTIONS.find((n) => String(n) === params.get('perPage')) ?? 12
  const savedOnly = params.get('saved') === '1'
  const view = params.get('view') === 'list' ? 'list' : 'grid'
  const filters: ProductFilters = {
    minPrice: price(params.get('min')),
    maxPrice: price(params.get('max')),
    colors: params.get('colors')?.split(',').filter(Boolean),
    availability: params.get('avail')?.split(',').filter((a): a is Availability => AVAILABILITY.some((o) => o.value === a)),
    arReady: params.get('ar') === '1',
  }
  const activeFilters =
    Number(filters.minPrice !== undefined || filters.maxPrice !== undefined) +
    Number(!!filters.colors?.length) +
    Number(!!filters.availability?.length) +
    Number(filters.arReady)

  // Every change resets to page 1 unless it sets the page itself.
  function update(changes: Record<string, string | undefined>, replace = false) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (!('page' in changes)) next.delete('page')
        for (const [key, value] of Object.entries(changes)) {
          if (!value || value === DEFAULTS[key]) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace },
    )
  }

  const result =
    products.status === 'success'
      ? queryProducts(products.data.products, {
          ...filters,
          category,
          q,
          sort,
          perPage,
          page: Number(params.get('page')),
          onlyIds: savedOnly ? (savedIds ?? []) : undefined,
        })
      : null

  useEffect(() => {
    if (!scrollOnPage.current) return
    scrollOnPage.current = false
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    headingRef.current?.focus({ preventScroll: true })
  }, [result?.page])

  // The list stays mounted (no image reloads, no layout shift); a change of results just fades it in.
  useEffect(() => {
    if (shownUrlState.current === urlState) return
    shownUrlState.current = urlState
    if (!listRef.current || reduced) return
    animate(listRef.current, { opacity: [0, 1] }, { duration: DURATION.state })
  }, [urlState, reduced])

  function goToPage(page: number) {
    scrollOnPage.current = true
    update({ page: String(page) })
  }

  function clearAll() {
    // The navbar search box follows the URL, so it empties with it.
    update(Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])))
    // The button unmounts with the empty state, so hand focus to the results heading.
    headingRef.current?.focus()
  }

  function clearSavedOnly() {
    update({ saved: undefined })
    headingRef.current?.focus()
  }

  function toggleSaved(product: Product) {
    const wasSaved = wishlist.has(product.id)
    wishlist.toggle(product.id)
    // In the saved-only view the card disappears, so keep focus on the results heading.
    if (savedOnly && wasSaved) headingRef.current?.focus()
    toast.show(
      wasSaved
        ? { kind: 'info', message: 'Removed from wishlist', action: { label: 'Undo', onClick: () => wishlist.toggle(product.id) } }
        : { kind: 'success', message: 'Saved to wishlist' },
    )
  }

  function addToCart(product: Product) {
    if (cart.add(product) === 'limit') {
      toast.show({
        kind: 'info',
        message: `All ${product.stock} in stock of ${product.name} are already in your cart, so no more can be added.`,
      })
      return
    }
    toast.show({
      kind: 'success',
      message: 'Added to cart',
      action: { label: 'Undo', onClick: () => cart.removeOne(product.id) },
    })
  }

  // Placeholder: there is no checkout yet, so Buy puts the piece in the cart and says so.
  function buy(product: Product) {
    if (cart.qtyOf(product.id) === 0) cart.add(product)
    toast.show({ kind: 'info', message: 'Checkout arrives with the store connection. This piece is in your cart.' })
  }

  const noSaved = savedOnly && savedIds?.length === 0
  const from = result ? (result.page - 1) * perPage + 1 : 0
  const to = result ? from + result.items.length - 1 : 0

  return (
    <MotionConfig reducedMotion="user">
      <ShopHeader
        ref={headingRef}
        title={shopTitle(params)}
        summary={
          result && products.status === 'success' ? (
            <ShopSummary total={result.total} savedCount={savedIds?.length ?? 0} syncedAt={products.data.syncedAt} />
          ) : products.status === 'loading' ? (
            <SummarySkeleton />
          ) : undefined
        }
      />

      <div className="mx-auto max-w-6xl px-6 pb-24">
        {products.status === 'loading' && <ProductGridSkeleton view={view} perPage={perPage} />}

        {products.status === 'error' && (
          <div role="alert" className="glass-card rounded-2xl p-6 sm:p-8">
            <h2 className="display text-2xl text-fg">The catalogue did not load</h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
              The request for stock and prices failed, most likely because the connection dropped or the service is
              briefly unavailable. Your filters are kept. Check your connection, then try again.
            </p>
            <button type="button" onClick={products.retry} className={`${PRIMARY_BUTTON} mt-6`}>
              Try again
            </button>
          </div>
        )}

        {products.status === 'success' && result && (
          <>
            <CategoryPills
              value={category}
              counts={categoryCounts(products.data.products)}
              onChange={(next) => update({ category: next })}
            />
            <ShopToolbar
              sort={sort}
              onSort={(next) => update({ sort: next })}
              perPage={perPage}
              onPerPage={(next) => update({ perPage: String(next) })}
              view={view}
              onView={(next) => update({ view: next, page: params.get('page') ?? undefined })}
              activeFilters={activeFilters}
              onOpenFilters={() => setFiltersOpen(true)}
            />
            <FilterPanel
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              products={products.data.products}
              filters={filters}
              onApply={(next) =>
                update({
                  min: next.minPrice?.toString(),
                  max: next.maxPrice?.toString(),
                  colors: next.colors?.join(','),
                  avail: next.availability?.join(','),
                  ar: next.arReady ? '1' : undefined,
                })
              }
            />

            {result.total === 0 ? (
              <div className="glass-card mt-6 rounded-2xl p-6 sm:p-8">
                <h3 className="display text-xl text-fg">
                  {noSaved
                    ? 'No saved pieces yet'
                    : !q
                      ? 'No pieces match your filters'
                      : activeFilters > 0 || category !== 'all' || savedOnly
                        ? `No pieces match "${q}" with your filters`
                        : `No pieces match "${q}"`}
                </h3>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
                  {noSaved
                    ? 'Tap the heart on any piece to save it here.'
                    : 'Check the spelling or try a shorter word, a colour or a category. Clearing the search and filters brings back the full catalogue.'}
                </p>
                <button type="button" onClick={noSaved ? clearSavedOnly : clearAll} className={`${PRIMARY_BUTTON} mt-6`}>
                  {noSaved ? 'Browse all pieces' : 'Clear search and filters'}
                </button>
              </div>
            ) : (
              <>
                <ul
                  ref={listRef}
                  className={`mt-6 grid gap-x-4 gap-y-10 ${
                    view === 'list' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                  }`}
                >
                  {result.items.map((product, index) => (
                    <li key={product.id} className="min-w-0">
                      <ProductCard
                        product={product}
                        index={index}
                        list={view === 'list'}
                        saved={wishlist.has(product.id)}
                        onToggleSaved={toggleSaved}
                        onAddToCart={addToCart}
                        onBuy={buy}
                      />
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={result.page}
                  pageCount={result.pageCount}
                  from={from}
                  to={to}
                  total={result.total}
                  onPage={goToPage}
                />
                <TryOnPromo />
              </>
            )}
          </>
        )}
      </div>
    </MotionConfig>
  )
}
