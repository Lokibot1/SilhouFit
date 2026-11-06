import { animate, MotionConfig, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CategoryPills } from '../../components/shop/CategoryPills'
import { FilterChips } from '../../components/shop/FilterChips'
import { FilterPanel } from '../../components/shop/FilterPanel'
import { Pagination } from '../../components/shop/Pagination'
import { ProductCard } from '../../components/shop/ProductCard'
import { SpecSheet, type Choice } from '../../components/shop/SpecSheet'
import { ShopHeader } from '../../components/shop/ShopHeader'
import { ProductGridSkeleton, SummarySkeleton } from '../../components/shop/ShopSkeleton'
import { ShopSummary, ShopToolbar } from '../../components/shop/ShopToolbar'
import { TryOnPromo } from '../../components/shop/TryOnPromo'
import { useToast } from '../../components/toast/useToast'
import { SHOP_SECONDARY } from '../../components/shop/shopControls'
import { PRIMARY_BUTTON } from '../../components/ui/buttonStyles'
import { CATEGORIES, choiceOf, type Product } from '../../data/products'
import { DURATION } from '../../motion/tokens'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { loadProduct } from '../../hooks/useProducts'
import { useShopFacets } from '../../hooks/useShopColours'
import { useShopCatalogue } from '../../hooks/useShopCatalogue'
import { useCart } from '../../hooks/useCart'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { useSavedIds, useWishlist } from '../../hooks/useWishlist'
import { GENDER_OPTIONS, PER_PAGE_OPTIONS, shopTitle, SORT_OPTIONS, type ProductFilters } from '../../utils/productQuery'
import { focusFiltersTrigger } from '../../utils/chipFocus'
import { formatPeso, parseFilterPrice } from '../../utils/format'
import { playAddToCart } from '../../utils/sound'

const DESCRIPTION =
  'Browse the SilhouFit catalogue: filter by category, check stock, and preview how each piece fits with browser-based AR before you buy it.'

// Params holding their default are dropped from the URL. The API has no featured order, so Featured asks for newest first.
const DEFAULT_SORT = SORT_OPTIONS[0].value
const DEFAULTS: Record<string, string> = { category: 'all', sort: DEFAULT_SORT, perPage: '12', view: 'grid', page: '1' }
const FILTER_KEYS = ['category', 'q', 'min', 'max', 'color', 'ar', 'brand', 'gender', 'size', 'page']

export function ShopPage() {
  useDocumentTitle('Shop the catalogue — SilhouFit')
  useMetaDescription(DESCRIPTION)

  const wishlist = useWishlist()
  const savedIds = useSavedIds()
  const cart = useCart()
  const user = useCurrentUser()
  const requireSignIn = useRequireSignIn()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState<{ product: Product; action: 'cart' | 'buy' } | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Piece counts for the category pills; none are shown until the filter options load.
  const counts = useShopFacets(true)?.categories ?? null
  const headingRef = useRef<HTMLHeadingElement>(null)
  const scrollOnPage = useRef(false)
  const listRef = useRef<HTMLUListElement>(null)
  const reduced = useReducedMotion()
  const urlState = params.toString()
  const shownUrlState = useRef(urlState)

  const category = params.get('category')?.trim().slice(0, 50) || 'all'
  const q = params.get('q') ?? ''
  const sort = SORT_OPTIONS.find((o) => o.value === params.get('sort'))?.value ?? DEFAULT_SORT
  const perPage = PER_PAGE_OPTIONS.find((n) => String(n) === params.get('perPage')) ?? 12
  const view = params.get('view') === 'list' ? 'list' : 'grid'
  // A filter may repeat its key (`size=M&size=L`); a single-value URL reads as one value.
  const valuesOf = (key: string) => {
    const values = [...new Set(params.getAll(key).map((v) => v.trim().slice(0, 50)).filter(Boolean))].slice(0, 20)
    return values.length ? values : undefined
  }
  const filters: ProductFilters = {
    minPrice: parseFilterPrice(params.get('min')),
    maxPrice: parseFilterPrice(params.get('max')),
    colors: valuesOf('color'),
    arReady: params.get('ar') === '1' || undefined,
    brand: params.get('brand')?.trim().slice(0, 50) || undefined,
    gender: GENDER_OPTIONS.find((g) => g.value === params.get('gender'))?.value,
    sizes: valuesOf('size'),
  }
  const badRange = filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice
  const activeFilters =
    Number(filters.minPrice !== undefined || filters.maxPrice !== undefined) +
    (filters.colors?.length ?? 0) +
    Number(!!filters.arReady) +
    Number(!!filters.brand) +
    Number(!!filters.gender) +
    (filters.sizes?.length ?? 0)

  // Every change resets to page 1 unless it sets the page itself.
  function update(changes: Record<string, string | string[] | undefined>, replace = false) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (!('page' in changes)) next.delete('page')
        for (const [key, value] of Object.entries(changes)) {
          next.delete(key)
          if (Array.isArray(value)) value.forEach((v) => next.append(key, v))
          else if (value && value !== DEFAULTS[key]) next.set(key, value)
        }
        return next
      },
      { replace },
    )
  }

  const products = useShopCatalogue({
    ...filters,
    category,
    q,
    sort,
    perPage,
    page: Number(params.get('page')),
  })
  const { result } = products
  const noPiecesYet = result?.total === 0 && !q && category === 'all' && activeFilters === 0

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

  async function toggleSaved(product: Product) {
    if (requireSignIn('save to your wishlist')) return
    const wasSaved = wishlist.has(product.id)
    // The heart flips at once; the toast waits for the server (a failure shows its own error).
    if (!(await wishlist.toggle(product.id))) return
    toast.show(
      wasSaved
        ? { kind: 'info', message: 'Removed from wishlist', action: { label: 'Undo', onClick: () => wishlist.toggle(product.id) } }
        : { kind: 'success', message: 'Saved to wishlist' },
    )
  }

  // Adding to the cart needs an account; a guest starting a purchase signs in at checkout.
  // The sheet needs the piece's sizes and colours, which only its detail has, so that loads first.
  function openSheet(piece: Pick<Product, 'id' | 'name'>, action: 'cart' | 'buy') {
    if (action === 'cart' && requireSignIn('add to your cart')) return
    loadProduct(piece.id).then(
      (product) => {
        if (product.stock === 0) {
          toast.show({ kind: 'info', message: `${product.name} is sold out.` })
          return
        }
        setSheet({ product, action })
        setSheetOpen(true)
      },
      (error: unknown) =>
        toast.show(
          (error as { kind?: string }).kind === 'not-found'
            ? { kind: 'info', message: 'That piece is no longer in the catalogue.' }
            : {
                kind: 'error',
                message: `Couldn't load ${piece.name}. Check your connection, then try again.`,
                action: { label: 'Try again', onClick: () => openSheet(piece, action) },
              },
        ),
    )
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
  useEffect(() => {
    const link = deepLink.current
    if (!link) return
    deepLink.current = null
    openSheet({ id: link.id, name: 'that piece' }, link.action)
    // Only the first arrival carries the link.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function confirmChoice({ size, color, qty, variantId }: Choice) {
    if (!sheet) return
    const { product, action } = sheet
    if (action === 'buy') {
      setSheetOpen(false)
      navigate(`/checkout?${new URLSearchParams({ item: product.id, variant: variantId, qty: String(qty) })}`)
      return
    }
    const outcome = await cart.add({ product, variantId, qty })
    if (outcome === 'failed') return
    if (outcome === 'limit') {
      toast.show({ kind: 'info', message: `All ${choiceOf(product, size, color).stock} in stock of ${product.name} in that size and colour are already in your cart.` })
      return
    }
    setSheetOpen(false)
    playAddToCart()
    toast.show({
      kind: 'success',
      message: `Added to cart: ${[product.name, size, color].filter(Boolean).join(', ')} × ${qty}`,
      action: { label: 'Undo', onClick: () => void cart.remove(variantId, qty) },
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
            <ShopSummary total={result.total} savedCount={savedIds?.length ?? 0} syncedAt={products.syncedAt} />
          ) : products.status === 'loading' ? (
            <SummarySkeleton />
          ) : undefined
        }
      />

      <div className="mx-auto max-w-6xl px-6 pb-24 2xl:max-w-[88rem]">
        {products.status === 'loading' && <ProductGridSkeleton view={view} perPage={perPage} />}

        {products.status === 'error' && (
          <div role="alert" className="glass-card rounded-xl p-6 sm:p-8">
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

        {products.status === 'success' && noPiecesYet && (
          <div className="glass-card rounded-xl p-6 sm:p-8">
            <h2 className="display text-2xl text-fg">No pieces yet</h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
              The shop has nothing on sale right now. New pieces appear here as soon as they are added, so check back soon.
            </p>
            <Link to="/" className={`${PRIMARY_BUTTON} mt-6 w-fit`}>
              Back to home
            </Link>
          </div>
        )}

        {products.status === 'success' && result && !noPiecesYet && (
          <>
            {/* On phones the categories live in the Filters modal instead. */}
            <div data-tour="shop-categories" className="hidden sm:block">
              <CategoryPills
                value={category}
                categories={CATEGORIES}
                counts={counts}
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
            <FilterChips filters={filters} onClear={(clears) => update(clears)} onClearAll={clearAll} />
            {badRange && (
              <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-danger p-3 text-sm text-danger">
                <p className="min-w-0">
                  The minimum price ({formatPeso(filters.minPrice!)}) is higher than the maximum ({formatPeso(filters.maxPrice!)}), so nothing can match.
                  Lower the minimum or raise the maximum.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    focusFiltersTrigger()
                    update({ min: undefined, max: undefined })
                  }}
                  className={`${SHOP_SECONDARY} text-sm`}
                >
                  Clear price range
                </button>
              </div>
            )}
            {sheet && (
              <SpecSheet
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                product={sheet.product}
                action={sheet.action}
                inCart={cart.qtyOfVariant}
                onConfirm={confirmChoice}
                guest={!user}
              />
            )}
            <FilterPanel
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              filters={filters}
              category={category}
              categories={CATEGORIES}
              onApply={(next, nextCategory) =>
                update({
                  category: nextCategory,
                  min: next.minPrice?.toString(),
                  max: next.maxPrice?.toString(),
                  color: next.colors,
                  ar: next.arReady ? '1' : undefined,
                  brand: next.brand,
                  gender: next.gender,
                  size: next.sizes,
                })
              }
            />

            {badRange ? null : result.total === 0 ? (
              <div className="glass-card mt-6 rounded-xl p-6 sm:p-8">
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
                    <li key={product.id} data-tour={index === 0 ? 'product-card' : undefined} className="scroll-settle min-w-0">
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
