import { animate, MotionConfig, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CategoryPills } from '../../components/shop/CategoryPills'
import { FilterPanel } from '../../components/shop/FilterPanel'
import { Pagination } from '../../components/shop/Pagination'
import { ProductCard } from '../../components/shop/ProductCard'
import { SpecSheet, type Choice } from '../../components/shop/SpecSheet'
import { ShopHeader } from '../../components/shop/ShopHeader'
import { ProductGridSkeleton, SummarySkeleton } from '../../components/shop/ShopSkeleton'
import { ShopSummary, ShopToolbar } from '../../components/shop/ShopToolbar'
import { TryOnPromo } from '../../components/shop/TryOnPromo'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON } from '../../components/ui/buttonStyles'
import { CATEGORIES, type Product } from '../../data/products'
import { DURATION } from '../../motion/tokens'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useProducts } from '../../hooks/useProducts'
import { lineKey, useCart } from '../../hooks/useCart'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useSavedIds, useWishlist } from '../../hooks/useWishlist'
import {
  AVAILABILITY,
  categoryCounts,
  PER_PAGE_OPTIONS,
  queryProducts,
  shopTitle,
  SORT_OPTIONS,
  type Availability,
  type ProductFilters,
} from '../../utils/productQuery'
import { playAddToCart } from '../../utils/sound'

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
  const savedIds = useSavedIds()
  const cart = useCart()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState<{ product: Product; action: 'cart' | 'buy' } | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
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

  function toggleSaved(product: Product) {
    const wasSaved = wishlist.has(product.id)
    wishlist.toggle(product.id)
    toast.show(
      wasSaved
        ? { kind: 'info', message: 'Removed from wishlist', action: { label: 'Undo', onClick: () => wishlist.toggle(product.id) } }
        : { kind: 'success', message: 'Saved to wishlist' },
    )
  }

  // Everyone can add to the cart or start a purchase; signing in is asked for at checkout.
  function openSheet(product: Product, action: 'cart' | 'buy') {
    setSheet({ product, action })
    setSheetOpen(true)
  }

  // A link (the checkout's Change link, or a shared one) arrives with ?item=&action=. Read it once, drop it from the
  // URL so Back is not trapped, then open that piece's sheet if the piece exists.
  const deepLink = useRef(
    params.get('item') ? { id: params.get('item')!, action: params.get('action') === 'buy' ? ('buy' as const) : ('cart' as const) } : null,
  )
  useEffect(() => {
    if (!params.has('item')) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('item')
        next.delete('action')
        return next
      },
      { replace: true },
    )
    // Only the first arrival carries the link.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const catalogue = products.status === 'success' ? products.data.products : null
  useEffect(() => {
    const link = deepLink.current
    if (!link || !catalogue) return
    deepLink.current = null
    const product = catalogue.find((p) => p.id === link.id)
    if (!product) toast.show({ kind: 'info', message: 'That piece is no longer in the catalogue.' })
    else if (product.stock === 0) toast.show({ kind: 'info', message: `${product.name} is sold out.` })
    else openSheet(product, link.action)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogue])

  function confirmChoice({ size, color, qty }: Choice) {
    if (!sheet) return
    const { product, action } = sheet
    if (action === 'buy') {
      setSheetOpen(false)
      navigate(`/checkout?${new URLSearchParams({ item: product.id, size, color, qty: String(qty) })}`)
      return
    }
    if (cart.add({ product, size, color, qty }) === 'limit') {
      toast.show({ kind: 'info', message: `All ${product.stock} in stock of ${product.name} are already in your cart.` })
      return
    }
    setSheetOpen(false)
    playAddToCart()
    toast.show({
      kind: 'success',
      message: `Added to cart: ${product.name}, ${size}, ${color} × ${qty}`,
      action: { label: 'Undo', onClick: () => cart.remove(lineKey({ id: product.id, size, color }), qty) },
    })
  }

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

      <div className="mx-auto max-w-6xl px-6 pb-24 2xl:max-w-[88rem]">
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
            {/* On phones the categories live in the Filters modal instead. */}
            <div data-tour="shop-categories" className="hidden sm:block">
              <CategoryPills
                value={category}
                counts={categoryCounts(products.data.products)}
                onChange={(next) => update({ category: next })}
              />
            </div>
            <ShopToolbar
              sort={sort}
              onSort={(next) => update({ sort: next })}
              perPage={perPage}
              onPerPage={(next) => update({ perPage: String(next) })}
              view={view}
              onView={(next) => update({ view: next, page: params.get('page') ?? undefined })}
              activeFilters={activeFilters}
              categoryActive={category !== 'all'}
              onOpenFilters={() => setFiltersOpen(true)}
            />
            {sheet && (
              <SpecSheet
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                product={sheet.product}
                action={sheet.action}
                inCart={cart.qtyOfProduct(sheet.product.id)}
                onConfirm={confirmChoice}
                guest={!user}
              />
            )}
            <FilterPanel
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              products={products.data.products}
              filters={filters}
              category={category}
              counts={categoryCounts(products.data.products)}
              onApply={(next, nextCategory) =>
                update({
                  category: nextCategory,
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
                  {!q
                    ? 'No pieces match your filters'
                    : activeFilters > 0 || category !== 'all'
                      ? `No pieces match "${q}" with your filters`
                      : `No pieces match "${q}"`}
                </h3>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
                  Check the spelling or try a shorter word, a colour or a category. Clearing the search and filters brings back the full catalogue.
                </p>
                <button type="button" onClick={clearAll} className={`${PRIMARY_BUTTON} mt-6`}>
                  Clear search and filters
                </button>
              </div>
            ) : (
              <>
                <ul
                  ref={listRef}
                  className={`mt-6 grid gap-x-3 gap-y-8 sm:gap-x-4 sm:gap-y-10 ${
                    view === 'list' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'
                  }`}
                >
                  {result.items.map((product, index) => (
                    <li key={product.id} data-tour={index === 0 ? 'product-card' : undefined} className="min-w-0">
                      <ProductCard
                        product={product}
                        index={index}
                        list={view === 'list'}
                        saved={wishlist.has(product.id)}
                        onToggleSaved={toggleSaved}
                        onAddToCart={(p) => openSheet(p, 'cart')}
                        onBuy={(p) => openSheet(p, 'buy')}
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
