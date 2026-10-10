import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CategoryPills } from '../components/shop/CategoryPills'
import { FilterPanel } from '../components/shop/FilterPanel'
import { Pagination } from '../components/shop/Pagination'
import { ProductCard } from '../components/shop/ProductCard'
import { ShopHeader } from '../components/shop/ShopHeader'
import { ProductGridSkeleton } from '../components/shop/ShopSkeleton'
import { ShopToolbar } from '../components/shop/ShopToolbar'
import { TryOnPromo } from '../components/shop/TryOnPromo'
import { useToast } from '../components/toast/useToast'
import { PRIMARY_BUTTON } from '../components/ui/buttonStyles'
import { CATEGORIES, type Product } from '../data/products'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useMetaDescription } from '../hooks/useMetaDescription'
import { useProducts } from '../hooks/useProducts'
import { useWishlist } from '../hooks/useWishlist'
import {
  AVAILABILITY,
  categoryCounts,
  PER_PAGE_OPTIONS,
  queryProducts,
  SORT_OPTIONS,
  type Availability,
  type ProductFilters,
} from '../utils/productQuery'

const DESCRIPTION =
  'Browse the SilhouFit catalogue: filter by category, check online and in-store stock, and preview how each piece fits with browser-based AR before you buy it.'

// Params holding their default are dropped from the URL.
const DEFAULTS: Record<string, string> = { category: 'all', sort: 'featured', perPage: '12', view: 'grid', page: '1' }
const FILTER_KEYS = ['category', 'q', 'min', 'max', 'colors', 'avail', 'ar', 'page']

const price = (value: string | null) => (value !== null && /^\d+$/.test(value) ? Number(value) : undefined)

export function ShopPage() {
  useDocumentTitle('Shop the catalogue — SilhouFit')
  useMetaDescription(DESCRIPTION)

  const products = useProducts()
  const wishlist = useWishlist()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const scrollOnPage = useRef(false)

  const category = CATEGORIES.find((c) => c === params.get('category')) ?? 'all'
  const q = params.get('q') ?? ''
  const sort = SORT_OPTIONS.find((o) => o.value === params.get('sort'))?.value ?? 'featured'
  const perPage = PER_PAGE_OPTIONS.find((n) => String(n) === params.get('perPage')) ?? 12
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

  // The input is local so typing stays instant; the debounced text lands in the URL.
  const [search, setSearch] = useState(q)
  const debounced = useDebouncedValue(search)
  // The last q this page wrote or adopted; any other change came from Back/Forward or a clear.
  const knownQ = useRef(q)
  const writeQuery = useEffectEvent((text: string) => {
    if (text === q) return
    knownQ.current = text
    update({ q: text }, true)
  })
  useEffect(() => writeQuery(debounced.trim()), [debounced])
  useEffect(() => {
    if (q === knownQ.current) return
    knownQ.current = q
    setSearch(q)
  }, [q])

  const result =
    products.status === 'success'
      ? queryProducts(products.data.products, { ...filters, category, q, sort, perPage, page: Number(params.get('page')) })
      : null

  useEffect(() => {
    if (!scrollOnPage.current) return
    scrollOnPage.current = false
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    headingRef.current?.focus({ preventScroll: true })
  }, [result?.page])

  function goToPage(page: number) {
    scrollOnPage.current = true
    update({ page: String(page) })
  }

  function clearAll() {
    // The search box follows the URL (see the q effect above), so it empties with it.
    update(Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])))
    // The button unmounts with the empty state, so hand focus to the results heading.
    headingRef.current?.focus()
  }

  function toggleSaved(product: Product) {
    const wasSaved = wishlist.has(product.id)
    wishlist.toggle(product.id)
    toast.show(
      wasSaved
        ? { kind: 'info', message: 'Removed from wishlist', action: { label: 'Undo', onClick: () => wishlist.toggle(product.id) } }
        : { kind: 'success', message: 'Saved to wishlist' },
    )
  }

  const from = result ? (result.page - 1) * perPage + 1 : 0
  const to = result ? from + result.items.length - 1 : 0

  return (
    <>
      <ShopHeader />

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
              search={search}
              onSearch={setSearch}
              sort={sort}
              onSort={(next) => update({ sort: next })}
              perPage={perPage}
              onPerPage={(next) => update({ perPage: String(next) })}
              view={view}
              onView={(next) => update({ view: next, page: params.get('page') ?? undefined })}
              activeFilters={activeFilters}
              onOpenFilters={() => setFiltersOpen(true)}
              savedCount={wishlist.ids.filter((id) => products.data.products.some((p) => p.id === id)).length}
              total={result.total}
              syncedAt={products.data.syncedAt}
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

            <h2 ref={headingRef} tabIndex={-1} className="display mt-10 scroll-mt-28 text-2xl text-fg sm:text-3xl">
              {category === 'all' ? 'All pieces' : category}
            </h2>

            {result.total === 0 ? (
              <div className="glass-card mt-6 rounded-2xl p-6 sm:p-8">
                <h3 className="display text-xl text-fg">
                  {!q
                    ? 'No pieces match your filters'
                    : activeFilters > 0 || category !== 'all'
                      ? `No pieces match "${q}" with your filters`
                      : `No pieces match "${q}"`}
                </h3>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
                  Check the spelling or try a shorter word, a colour or a category. Clearing the search and filters
                  brings back the full catalogue.
                </p>
                <button type="button" onClick={clearAll} className={`${PRIMARY_BUTTON} mt-6`}>
                  Clear search and filters
                </button>
              </div>
            ) : (
              <>
                <ul
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
    </>
  )
}
