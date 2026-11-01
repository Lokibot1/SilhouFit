import { useEffect, useState } from 'react'
import { fetchProductById, fetchProductList, ProductListError, UUID, type ProductListErrorKind, type ProductListItem } from '../../service/fetchProductList'
import { SearchIcon, XIcon } from '../form/icons'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { ProductRow } from './ProductRow'
import { errorKind, SectionError, StaffSection } from './StaffSection'
import { ProductRowsSkeleton } from './StaffSkeleton'

const MIN_CHARS = 2
const LIMIT = 10

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; kind: ProductListErrorKind }
  | { status: 'success'; items: ProductListItem[]; total: number }

export function ProductLookup() {
  const [text, setText] = useState('')
  const [state, setState] = useState<State>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const term = useDebouncedValue(text.trim(), 300)
  const searching = term.length >= MIN_CHARS
  // Clearing the box drops the results at once; the old state is replaced when a new search starts.
  const view: State = searching ? state : { status: 'idle' }

  useEffect(() => {
    if (!searching) return
    const controller = new AbortController()
    const options = { signal: controller.signal }
    setState({ status: 'loading' })
    const found = UUID.test(term)
      ? fetchProductById(term, options).then(
          (product) => ({ items: [product], total: 1 }),
          // No product has that ID: the same empty state as a name with no matches.
          (error: unknown) => {
            if (error instanceof ProductListError && error.kind === 'not-found') return { items: [], total: 0 }
            throw error
          },
        )
      : fetchProductList({ search: term, limit: LIMIT }, options).then((page) => ({ items: page.data, total: page.meta.total }))
    found.then(
      (result) => setState({ status: 'success', ...result }),
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', kind: errorKind(error) })
      },
    )
    return () => controller.abort()
  }, [term, searching, attempt])

  function clear() {
    setText('')
    document.getElementById('product-lookup-input')?.focus()
  }

  return (
    <StaffSection id="product-lookup" title="Find a product">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
        <input
          id="product-lookup-input"
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search by product name or full ID"
          aria-label="Search products by name or full ID"
          aria-describedby="product-lookup-hint"
          autoComplete="off"
          spellCheck={false}
          className="font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas pr-11 pl-10 text-base text-fg placeholder:text-fg-muted"
        />
        {text && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-xl text-fg-muted hover:text-fg"
          >
            <XIcon />
          </button>
        )}
      </div>
      <p id="product-lookup-hint" className="mt-2 text-xs text-fg-muted">
        Type at least {MIN_CHARS} characters. Paste a full product ID to open that product.
      </p>

      <div className="mt-4" aria-live="polite">
        {view.status === 'loading' && <ProductRowsSkeleton count={3} label="Searching products" />}
        {view.status === 'error' && <SectionError what="the search results" kind={view.kind} onRetry={() => setAttempt((n) => n + 1)} />}
        {view.status === 'success' &&
          (view.items.length === 0 ? (
            <div>
              <p className="text-base text-fg-muted">No products match &quot;{term}&quot;. Check the spelling or clear the search.</p>
              <button type="button" onClick={clear} className="font-ui mt-3 min-h-11 cursor-pointer rounded-xl px-3 text-base font-semibold text-fg underline underline-offset-4 hover:text-chrome-strong">
                Clear search
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-fg-muted">
                {view.total > view.items.length
                  ? `Showing the first ${view.items.length} of ${view.total} products. Add more of the name to narrow it down.`
                  : `${view.total} ${view.total === 1 ? 'product' : 'products'} found`}
              </p>
              <ul className="divide-y divide-line">
                {view.items.map((product) => (
                  <ProductRow key={product.id} product={product} />
                ))}
              </ul>
            </>
          ))}
      </div>
    </StaffSection>
  )
}
