import { useRef, useState, type KeyboardEvent } from 'react'
import { PICKER_PAGE, useProductCategories, useProductSearch } from '../../../hooks/usePromotionTargets'
import type { PromoAppliesTo, PromoProduct } from '../../../service/promotions'
import { PROMO_LIMITS } from '../../../utils/promotionValidation'
import { CheckIcon, XIcon } from '../../form/icons'
import { FIELD_INPUT } from '../../staff/inventory/FormField'
import { SectionError } from '../../staff/StaffSection'
import { Avatar } from '../../ui/Avatar'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Select } from '../../ui/Select'

const SCOPES: { value: PromoAppliesTo['scope']; label: string }[] = [
  { value: 'all', label: 'All products' },
  { value: 'category', label: 'A category' },
  { value: 'products', label: 'Specific products' },
]
const NO_CATEGORY = ''
/** A result row and its placeholder share this height, so the list does not jump when the answer arrives. */
const ROW = 'h-14'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

function CategoryPicker({ category, onChange }: { category: string; onChange: (category: string) => void }) {
  const { state, retry } = useProductCategories()
  if (state.status === 'loading') {
    return (
      <div role="status" aria-label="Loading categories" className="animate-pulse">
        <Bar className="h-11 w-full" />
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="grid gap-2 rounded-xl border border-line p-3">
        <SectionError what="the categories" kind={state.kind} onRetry={retry} />
        <p className="text-sm text-fg-muted">{category ? `Still selected: ${category}. ` : ''}You can still choose All products.</p>
      </div>
    )
  }
  // A category that is no longer in the catalog stays selectable, so editing an older promotion keeps it.
  const names = category && !state.data.includes(category) ? [...state.data, category] : state.data
  if (names.length === 0) return <p className="text-sm text-fg-muted">No categories yet. Add products in Inventory first, or choose All products.</p>
  return <Select label="Category" value={category} options={[{ value: NO_CATEGORY, label: 'Choose a category' }, ...names.map((name) => ({ value: name, label: name }))]} onChange={onChange} />
}

function ProductPicker({ products, onChange, disabled }: { products: PromoProduct[]; onChange: (products: PromoProduct[]) => void; disabled: boolean }) {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const { state, retry, waiting, search } = useProductSearch(text)
  const { productsMax } = PROMO_LIMITS
  const full = products.length >= productsMax
  const chosen = new Set(products.map((p) => p.id))

  const toggle = ({ id, name }: PromoProduct) => onChange(chosen.has(id) ? products.filter((p) => p.id !== id) : [...products, { id, name }])

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter must not submit the sheet from here.
    if (event.key === 'Enter') event.preventDefault()
    // Escape clears the search first and only then closes the sheet.
    if (event.key === 'Escape' && text) {
      event.stopPropagation()
      setText('')
    }
  }

  const loading = state.status === 'loading' || waiting
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-fg-muted">Search the catalog, then tick the products to put on sale.</p>
        <p aria-live="polite" className="shrink-0 text-xs text-fg-muted tabular-nums">
          {products.length} of {productsMax}
        </p>
      </div>
      {products.length > 0 && (
        <ul aria-label="Selected products" className="flex flex-wrap gap-2">
          {products.map((product) => (
            <li key={product.id} className="font-ui flex max-w-full min-w-0 items-center rounded-xl border border-line-strong pl-3 text-sm text-fg">
              <span className="truncate">{product.name}</span>
              <button
                type="button"
                aria-label={`Remove ${product.name}`}
                disabled={disabled}
                onClick={() => {
                  toggle(product)
                  input.current?.focus()
                }}
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:text-fg"
              >
                <XIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="text"
        role="searchbox"
        aria-label="Search products"
        value={text}
        readOnly={disabled}
        maxLength={60}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search by product name"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className={FIELD_INPUT}
      />
      <div aria-busy={loading}>
        {loading ? (
          <div role="status" aria-label="Loading products" className="animate-pulse divide-y divide-line border-y border-line">
            {Array.from({ length: 5 }, (_, n) => (
              <div key={n} className={`${ROW} flex items-center gap-3`}>
                <div className="size-6 shrink-0 rounded-md bg-line" />
                <div className="size-8 shrink-0 rounded-full bg-line" />
                <Bar className="h-5 w-2/3" />
              </div>
            ))}
          </div>
        ) : state.status === 'error' ? (
          <SectionError what="the products" kind={state.kind} onRetry={retry} />
        ) : state.data.products.length === 0 ? (
          <div>
            <p className="text-base font-semibold text-fg">{search ? `No products match "${search}"` : 'No products yet'}</p>
            <p className="mt-1 text-sm text-fg-muted">{search ? 'Check the spelling, or clear the search and try again.' : 'Add products in Inventory, then pick them here.'}</p>
            {search && (
              <button type="button" onClick={() => setText('')} className={`${SECONDARY_BUTTON} mt-3`}>
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            <ul aria-label="Products" className="max-h-72 divide-y divide-line overflow-y-auto border-y border-line">
              {state.data.products.map((product) => {
                const on = chosen.has(product.id)
                const blocked = disabled || (full && !on)
                return (
                  <li key={product.id}>
                    <label className={`${ROW} flex items-center gap-3 px-1 ${blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-line/40'}`}>
                      <input type="checkbox" checked={on} disabled={blocked} onChange={() => toggle(product)} aria-label={`${product.name}, ${product.category}`} className="peer sr-only" />
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-fg bg-canvas peer-checked:bg-fg peer-checked:text-canvas peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-chrome-strong">
                        {on && <CheckIcon size={16} />}
                      </span>
                      <Avatar name={product.name} src={product.image || undefined} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-fg">{product.name}</span>
                        <span className="block truncate text-sm text-fg-muted">{product.category}</span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-sm text-fg-muted">
              {full
                ? `You can choose up to ${productsMax} products. Remove one to add another.`
                : state.data.total > PICKER_PAGE
                  ? `Showing ${state.data.products.length} of ${state.data.total} products. Type a name to narrow the list.`
                  : ''}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

interface PromotionAppliesToProps {
  id: string
  value: PromoAppliesTo
  onChange: (next: PromoAppliesTo) => void
  error?: string
  disabled: boolean
}

/** The "Applies to" field: all products, one real category, or up to 20 chosen products. */
export function PromotionAppliesTo({ id, value, onChange, error, disabled }: PromotionAppliesToProps) {
  const setScope = (scope: PromoAppliesTo['scope']) => {
    if (scope !== value.scope) onChange(scope === 'all' ? { scope } : scope === 'category' ? { scope, category: NO_CATEGORY } : { scope, products: [] })
  }
  return (
    <div id={id} tabIndex={-1} role="group" aria-label="Applies to" aria-describedby={error ? `${id}-error` : undefined} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 outline-none">
      <p className="text-sm font-semibold text-fg">Applies to</p>
      <Select label="Applies to" value={value.scope} options={SCOPES} onChange={setScope} />
      {value.scope === 'category' && <CategoryPicker category={value.category} onChange={(category) => onChange({ scope: 'category', category })} />}
      {value.scope === 'products' && <ProductPicker products={value.products} onChange={(products) => onChange({ scope: 'products', products })} disabled={disabled} />}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
