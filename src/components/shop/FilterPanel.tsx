import { useState } from 'react'
import type { Product } from '../../data/products'
import { AVAILABILITY, colorOptions, type Availability, type ProductFilters } from '../../utils/productQuery'
import { Modal } from '../ui/Modal'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'

interface FilterPanelProps {
  open: boolean
  onClose: () => void
  products: Product[]
  filters: ProductFilters
  onApply: (filters: ProductFilters) => void
}

interface Draft {
  min: string
  max: string
  colors: string[]
  availability: Availability[]
  arReady: boolean
}

const EMPTY: Draft = { min: '', max: '', colors: [], availability: [], arReady: false }

const toDraft = (f: ProductFilters): Draft => ({
  min: f.minPrice?.toString() ?? '',
  max: f.maxPrice?.toString() ?? '',
  colors: f.colors ?? [],
  availability: f.availability ?? [],
  arReady: f.arReady ?? false,
})

const toggled = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

const CHECK_ROW = 'flex min-h-11 cursor-pointer items-center gap-3 text-base text-fg'
const PRICE_INPUT =
  'font-ui mt-1 min-h-11 w-full rounded-xl border border-line-strong bg-canvas px-3 text-base text-fg tabular-nums'

export function FilterPanel({ open, onClose, products, filters, onApply }: FilterPanelProps) {
  const [draft, setDraft] = useState(() => toDraft(filters))
  const [wasOpen, setWasOpen] = useState(open)
  // Each opening starts from what is currently applied.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(toDraft(filters))
  }

  const invalidRange = draft.min !== '' && draft.max !== '' && Number(draft.min) > Number(draft.max)
  const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6)

  function apply() {
    onApply({
      minPrice: draft.min === '' ? undefined : Number(draft.min),
      maxPrice: draft.max === '' ? undefined : Number(draft.max),
      colors: draft.colors,
      availability: draft.availability,
      arReady: draft.arReady,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filters"
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={() => setDraft(EMPTY)} className={`${SECONDARY_BUTTON} flex-1`}>
            Reset
          </button>
          <button type="button" onClick={apply} disabled={invalidRange} className={`${PRIMARY_BUTTON} flex-1`}>
            Apply
          </button>
        </div>
      }
    >
      <div className="space-y-6 pb-6">
        <fieldset>
          <legend className="font-ui text-sm font-semibold text-fg">Price (PHP)</legend>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <label className="font-ui text-xs text-fg-muted">
              Minimum
              <input
                inputMode="numeric"
                value={draft.min}
                onChange={(e) => setDraft({ ...draft, min: digits(e.target.value) })}
                placeholder="0"
                aria-invalid={invalidRange}
                aria-describedby={invalidRange ? 'price-range-error' : undefined}
                className={PRICE_INPUT}
              />
            </label>
            <label className="font-ui text-xs text-fg-muted">
              Maximum
              <input
                inputMode="numeric"
                value={draft.max}
                onChange={(e) => setDraft({ ...draft, max: digits(e.target.value) })}
                placeholder="Any"
                aria-invalid={invalidRange}
                aria-describedby={invalidRange ? 'price-range-error' : undefined}
                className={PRICE_INPUT}
              />
            </label>
          </div>
          {invalidRange && (
            <p id="price-range-error" role="alert" className="mt-2 text-sm text-danger">
              The minimum is higher than the maximum. Lower the minimum or raise the maximum.
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="font-ui text-sm font-semibold text-fg">Colour</legend>
          {colorOptions(products).map((color) => (
            <label key={color.name} className={CHECK_ROW}>
              <input
                type="checkbox"
                checked={draft.colors.includes(color.name)}
                onChange={() => setDraft({ ...draft, colors: toggled(draft.colors, color.name) })}
                className="size-5 accent-fg"
              />
              <span aria-hidden="true" className="size-4 rounded-full border border-fg-muted" style={{ backgroundColor: color.hex }} />
              {color.name}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend className="font-ui text-sm font-semibold text-fg">Availability</legend>
          {AVAILABILITY.map((option) => (
            <label key={option.value} className={CHECK_ROW}>
              <input
                type="checkbox"
                checked={draft.availability.includes(option.value)}
                onChange={() => setDraft({ ...draft, availability: toggled(draft.availability, option.value) })}
                className="size-5 accent-fg"
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend className="font-ui text-sm font-semibold text-fg">Try-on</legend>
          <label className={CHECK_ROW}>
            <input
              type="checkbox"
              checked={draft.arReady}
              onChange={() => setDraft({ ...draft, arReady: !draft.arReady })}
              className="size-5 accent-fg"
            />
            AR-ready pieces only
          </label>
        </fieldset>
      </div>
    </Modal>
  )
}
