import { useState } from 'react'
import { filterPriceInput } from '../../../utils/format'
import { useShopFacets } from '../../../hooks/useShopColours'
import { COMMON_SIZES, orderSizes } from '../../../utils/productQuery'
import { cleanFilterText, MAX_FILTER_TEXT, parsePrice, priceRangeInvalid, type InventoryQuery } from '../../../utils/inventoryQuery'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { Field, FIELD_INPUT } from './FormField'

/** The URL changes the panel's Apply makes; an empty value removes its key. */
export type PanelChanges = Record<'brand' | 'size' | 'color' | 'minPrice' | 'maxPrice', string>

interface Draft {
  brand: string
  size: string
  color: string
  min: string
  max: string
}

const toDraft = (q: InventoryQuery): Draft => ({
  brand: q.brand,
  size: q.size,
  color: q.color,
  min: q.minPrice?.toString() ?? '',
  max: q.maxPrice?.toString() ?? '',
})
const EMPTY: Draft = { brand: '', size: '', color: '', min: '', max: '' }

const HINT = 'text-xs text-fg-muted'

/** Brand, size, colour and price filters, in a right-hand panel (a bottom sheet on phones). Nothing changes the list until Apply. */
export function InventoryFilterPanel({ open, onClose, query, onApply }: { open: boolean; onClose: () => void; query: InventoryQuery; onApply: (changes: PanelChanges) => void }) {
  const [draft, setDraft] = useState(() => toDraft(query))
  const [wasOpen, setWasOpen] = useState(open)
  // Each opening starts from what is currently applied.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(toDraft(query))
  }

  const facets = useShopFacets(open)
  const sizes = facets?.sizes.length ? orderSizes(facets.sizes) : COMMON_SIZES
  const min = parsePrice(draft.min)
  const max = parsePrice(draft.max)
  const invalidRange = priceRangeInvalid({ minPrice: min, maxPrice: max })
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })

  function apply() {
    onApply({
      brand: cleanFilterText(draft.brand).slice(0, MAX_FILTER_TEXT),
      size: cleanFilterText(draft.size).slice(0, MAX_FILTER_TEXT),
      color: cleanFilterText(draft.color).slice(0, MAX_FILTER_TEXT),
      minPrice: min?.toString() ?? '',
      maxPrice: max?.toString() ?? '',
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      title="More filters"
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={() => setDraft(EMPTY)} className={`${SECONDARY_BUTTON} flex-1 whitespace-nowrap px-3`}>
            Reset
          </button>
          <button type="button" onClick={apply} disabled={invalidRange} className={`${PRIMARY_BUTTON} flex-[2] whitespace-nowrap px-3 disabled:cursor-not-allowed disabled:opacity-40!`}>
            Apply filters
          </button>
        </div>
      }
    >
      <div className="grid gap-5 pb-4">
        <Field id="filter-brand" label="Brand" optional count={{ value: draft.brand.length, max: MAX_FILTER_TEXT }}>
          <input
            id="filter-brand"
            value={draft.brand}
            onChange={(event) => set({ brand: event.target.value })}
            maxLength={MAX_FILTER_TEXT}
            autoComplete="off"
            list="filter-brand-options"
            aria-describedby="filter-brand-hint"
            className={FIELD_INPUT}
          />
          <datalist id="filter-brand-options">
            {facets?.brands.map((brand) => (
              <option key={brand} value={brand} />
            ))}
          </datalist>
          <p id="filter-brand-hint" className={HINT}>
            Matches the whole brand name, in any capitalisation.
          </p>
        </Field>

        <fieldset className="grid gap-1">
          <legend className="text-sm font-semibold text-fg">
            Size<span className="font-normal text-fg-muted"> (optional)</span>
          </legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {sizes.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={draft.size.toLowerCase() === size.toLowerCase()}
                onClick={() => set({ size: draft.size.toLowerCase() === size.toLowerCase() ? '' : size })}
                className={`${SECONDARY_BUTTON} min-w-11 px-3 text-sm aria-pressed:bg-fg aria-pressed:text-canvas`}
              >
                {size}
              </button>
            ))}
          </div>
          <label htmlFor="filter-size" className="mt-2 text-xs text-fg-muted">
            Another size
          </label>
          <input
            id="filter-size"
            value={draft.size}
            onChange={(event) => set({ size: event.target.value })}
            maxLength={MAX_FILTER_TEXT}
            autoComplete="off"
            aria-describedby="filter-variant-hint"
            className={FIELD_INPUT}
          />
        </fieldset>

        <Field id="filter-color" label="Colour" optional>
          <input
            id="filter-color"
            value={draft.color}
            onChange={(event) => set({ color: event.target.value })}
            maxLength={MAX_FILTER_TEXT}
            autoComplete="off"
            list="filter-color-options"
            aria-describedby="filter-variant-hint"
            className={FIELD_INPUT}
          />
          <datalist id="filter-color-options">
            {facets?.colors.map((colour) => (
              <option key={colour.name} value={colour.name} />
            ))}
          </datalist>
          <p id="filter-variant-hint" className={HINT}>
            One colour at a time. Size, colour and price must all match the same variant.
          </p>
        </Field>

        <fieldset className="grid gap-1">
          <legend className="text-sm font-semibold text-fg">Variant price (PHP)</legend>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <label className="font-ui text-xs text-fg-muted">
              Minimum
              <input
                inputMode="decimal"
                value={draft.min}
                onChange={(event) => set({ min: filterPriceInput(event.target.value) ?? draft.min })}
                placeholder="0"
                aria-invalid={invalidRange}
                aria-describedby={invalidRange ? 'filter-price-error' : undefined}
                className={`${FIELD_INPUT} mt-1 text-right tabular-nums`}
              />
            </label>
            <label className="font-ui text-xs text-fg-muted">
              Maximum
              <input
                inputMode="decimal"
                value={draft.max}
                onChange={(event) => set({ max: filterPriceInput(event.target.value) ?? draft.max })}
                placeholder="Any"
                aria-invalid={invalidRange}
                aria-describedby={invalidRange ? 'filter-price-error' : undefined}
                className={`${FIELD_INPUT} mt-1 text-right tabular-nums`}
              />
            </label>
          </div>
          {invalidRange && (
            <p id="filter-price-error" role="alert" className="text-sm text-danger">
              The minimum is higher than the maximum. Lower the minimum or raise the maximum.
            </p>
          )}
        </fieldset>
      </div>
    </Modal>
  )
}
