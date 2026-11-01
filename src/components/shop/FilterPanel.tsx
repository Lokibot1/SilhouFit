import { useState } from 'react'
import type { Category, ProductGender } from '../../data/products'
import { sameColour, useShopColours, useShopFacets, validColour } from '../../hooks/useShopColours'
import { filterPriceInput, parseFilterPrice, withCommas } from '../../utils/format'
import { COMMON_SIZES, GENDER_OPTIONS, orderSizes, type ProductFilters } from '../../utils/productQuery'
import { categoryCount } from '../../utils/categoryCount'
import { CategoryLabel } from './CategoryLabel'
import { Modal } from '../ui/Modal'
import { SHOP_PRIMARY, SHOP_SECONDARY } from './shopControls'

interface FilterPanelProps {
  open: boolean
  onClose: () => void
  filters: ProductFilters
  category: Category | 'all'
  /** Every category to choose from on phones (from sm the pills above the grid do that). */
  categories: readonly string[]
  onApply: (filters: ProductFilters, category: Category | 'all') => void
}

interface Draft {
  category: Category | 'all'
  brand: string
  gender: ProductGender | ''
  sizes: string[]
  min: string
  max: string
  colors: string[]
  arReady: boolean
}

const EMPTY: Draft = { category: 'all', brand: '', gender: '', sizes: [], min: '', max: '', colors: [], arReady: false }

const toDraft = (f: ProductFilters, category: Category | 'all'): Draft => ({
  category,
  brand: f.brand ?? '',
  gender: f.gender ?? '',
  sizes: f.sizes ?? [],
  min: f.minPrice?.toString() ?? '',
  max: f.maxPrice?.toString() ?? '',
  colors: f.colors ?? [],
  arReady: f.arReady ?? false,
})

const LEGEND = 'font-ui text-sm font-semibold text-fg max-sm:text-xs'
const CHECK_ROW = 'flex min-h-11 cursor-pointer items-center gap-3 max-sm:gap-2 text-base max-sm:text-sm text-fg'
const PRICE_INPUT =
  'skeuo-well font-ui mt-1 min-h-11 w-full rounded-xl border border-line-strong bg-canvas px-3 text-base max-sm:text-sm text-fg tabular-nums'

const TEXT_INPUT = PRICE_INPUT.replace(' tabular-nums', '')
const PRICE_FIELD = `${PRICE_INPUT} text-right placeholder:text-fg-muted`

export function FilterPanel({ open, onClose, filters, category, categories, onApply }: FilterPanelProps) {
  const [draft, setDraft] = useState(() => toDraft(filters, category))
  const [wasOpen, setWasOpen] = useState(open)
  // Each opening starts from what is currently applied.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(toDraft(filters, category))
  }

  const colours = useShopColours(open)
  const facets = useShopFacets(open)
  // The sizes the products really have; the usual ones until they are known.
  const sizes = facets?.sizes.length ? orderSizes(facets.sizes) : COMMON_SIZES
  const pricesKnown = facets !== null && facets.maxPrice > 0
  const invalidRange = draft.min !== '' && draft.max !== '' && Number(draft.min) > Number(draft.max)

  function apply() {
    onApply(
      {
        minPrice: parseFilterPrice(draft.min),
        maxPrice: parseFilterPrice(draft.max),
        // Once the colours are known, a colour no product has is dropped.
        colors: (colours.status === 'ready' ? draft.colors.flatMap((c) => validColour(c, colours.colours) ?? []) : draft.colors).filter((c, i, all) => all.indexOf(c) === i),
        arReady: draft.arReady || undefined,
        brand: draft.brand.trim().slice(0, 50) || undefined,
        gender: draft.gender || undefined,
        sizes: draft.sizes,
      },
      draft.category,
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filters"
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={() => setDraft(EMPTY)} className={`${SHOP_SECONDARY} flex-1`}>
            Reset
          </button>
          <button type="button" onClick={apply} disabled={invalidRange} className={`${SHOP_PRIMARY} flex-1`}>
            Apply
          </button>
        </div>
      }
    >
      <div className="space-y-6 pb-6 max-sm:space-y-4 max-sm:pb-4">
        {/* Phones only: from sm the categories are the pills above the grid. */}
        <fieldset className="sm:hidden">
          <legend className={LEGEND}>Category</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {['all', ...categories].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={draft.category === c}
                onClick={() => setDraft({ ...draft, category: c })}
                className={`${SHOP_SECONDARY} skeuo-gloss rounded-full! min-w-11 gap-1.5 px-3 text-xs`}
              >
                <CategoryLabel name={c === 'all' ? 'All' : c} count={categoryCount(facets?.categories ?? null, c)} />
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block font-ui text-sm font-semibold text-fg max-sm:text-xs">
          Brand
          <input
            value={draft.brand}
            onChange={(e) => setDraft({ ...draft, brand: e.target.value.trimStart().slice(0, 50) })}
            autoComplete="off"
            list="shop-brand-options"
            className={TEXT_INPUT}
          />
          <datalist id="shop-brand-options">
            {facets?.brands.map((brand) => (
              <option key={brand} value={brand} />
            ))}
          </datalist>
        </label>

        <fieldset>
          <legend className={LEGEND}>Gender</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {GENDER_OPTIONS.map((g) => (
              <button
                key={g.value}
                type="button"
                aria-pressed={draft.gender === g.value}
                onClick={() => setDraft({ ...draft, gender: draft.gender === g.value ? '' : g.value })}
                className={`${SHOP_SECONDARY} skeuo-gloss rounded-full! px-3 text-xs`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={LEGEND}>Size</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={draft.sizes.includes(s)}
                onClick={() => setDraft({ ...draft, sizes: draft.sizes.includes(s) ? draft.sizes.filter((x) => x !== s) : [...draft.sizes, s] })}
                className={`${SHOP_SECONDARY} skeuo-gloss rounded-full! min-w-11 px-3 text-xs`}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={LEGEND}>Price (PHP)</legend>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <label className="font-ui text-xs text-fg-muted">
              Minimum
              <input
                inputMode="decimal"
                value={withCommas(draft.min)}
                onChange={(e) => setDraft({ ...draft, min: filterPriceInput(e.target.value) ?? draft.min })}
                placeholder={pricesKnown ? String(facets.minPrice) : '0'}
                aria-invalid={invalidRange}
                aria-describedby={invalidRange ? 'price-range-error' : undefined}
                className={PRICE_FIELD}
              />
            </label>
            <label className="font-ui text-xs text-fg-muted">
              Maximum
              <input
                inputMode="decimal"
                value={withCommas(draft.max)}
                onChange={(e) => setDraft({ ...draft, max: filterPriceInput(e.target.value) ?? draft.max })}
                placeholder={pricesKnown ? String(facets.maxPrice) : 'Any'}
                aria-invalid={invalidRange}
                aria-describedby={invalidRange ? 'price-range-error' : undefined}
                className={PRICE_FIELD}
              />
            </label>
          </div>
          {invalidRange && (
            <p id="price-range-error" role="alert" className="mt-2 text-sm text-danger">
              The minimum is higher than the maximum. Lower the minimum or raise the maximum.
            </p>
          )}
        </fieldset>

        {colours.status === 'loading' && (
          <div aria-hidden="true" data-testid="colour-skeleton">
            <div className="h-5 w-16 animate-pulse rounded-xl bg-line" />
            <div className="mt-2 flex flex-wrap gap-2">
              {[24, 20, 28].map((width) => (
                <div key={width} className="h-9 animate-pulse rounded-full bg-line pointer-coarse:h-11" style={{ width: `${width * 4}px` }} />
              ))}
            </div>
          </div>
        )}
        {/* The colours of the products on sale; the section is left out when there are none or they could not be read. */}
        {colours.status === 'ready' && colours.colours.length > 0 && (
          <fieldset>
            <legend className={LEGEND}>Colour</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {colours.colours.map((c) => {
                const selected = draft.colors.some((x) => sameColour(x, c.name))
                return (
                  <button
                    key={c.name}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDraft({ ...draft, colors: selected ? draft.colors.filter((x) => !sameColour(x, c.name)) : [...draft.colors, c.name] })}
                    className={`${SHOP_SECONDARY} skeuo-gloss rounded-full! gap-2 px-3 text-xs`}
                  >
                    <span aria-hidden="true" className="size-4 rounded-full border border-fg-muted" style={c.hex ? { backgroundColor: c.hex } : undefined} />
                    {c.name}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}

        <fieldset>
          <legend className={LEGEND}>Try-on</legend>
          <label className={CHECK_ROW}>
            <input
              type="checkbox"
              checked={draft.arReady}
              onChange={() => setDraft({ ...draft, arReady: !draft.arReady })}
              className="skeuo-check size-5"
            />
            AR-ready pieces only
          </label>
        </fieldset>
      </div>
    </Modal>
  )
}
