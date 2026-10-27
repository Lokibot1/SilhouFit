import { AVAILABILITY, GENDER_OPTIONS, type ProductFilters } from '../../utils/productQuery'
import { focusFiltersTrigger, focusNeighbourChip } from '../../utils/chipFocus'
import { formatPeso, formatPesoWhole } from '../../utils/format'
import { XIcon } from '../form/icons'
import { SHOP_SECONDARY } from './shopControls'

/** The URL keys a chip clears (an undefined value removes the key). */
type Clears = Record<string, undefined>

const peso = (amount: number) => (Number.isInteger(amount) ? formatPesoWhole(amount) : formatPeso(amount))

function chipsFor(filters: ProductFilters) {
  const { minPrice, maxPrice } = filters
  const price =
    minPrice !== undefined && maxPrice !== undefined
      ? `${peso(minPrice)} to ${peso(maxPrice)}`
      : minPrice !== undefined
        ? `From ${peso(minPrice)}`
        : maxPrice !== undefined
          ? `Up to ${peso(maxPrice)}`
          : ''
  const chips: { kind: string; text: string; clears: Clears }[] = [
    { kind: 'brand', text: filters.brand ?? '', clears: { brand: undefined } },
    { kind: 'gender', text: GENDER_OPTIONS.find((g) => g.value === filters.gender)?.label ?? '', clears: { gender: undefined } },
    { kind: 'size', text: filters.size ?? '', clears: { size: undefined } },
    { kind: 'colour', text: filters.color ?? '', clears: { color: undefined } },
    { kind: 'price', text: price, clears: { min: undefined, max: undefined } },
    {
      kind: 'availability',
      text: (filters.availability ?? []).map((a) => AVAILABILITY.find((o) => o.value === a)?.label.replace(/ \(.*\)$/, '') ?? a).join(', '),
      clears: { avail: undefined },
    },
    { kind: 'AR', text: filters.arReady ? 'AR-ready only' : '', clears: { ar: undefined } },
  ]
  return chips.filter((chip) => chip.text)
}

/** One removable chip for each filter that is set, and Clear all. Nothing shows without filters. */
export function FilterChips({ filters, onClear, onClearAll }: { filters: ProductFilters; onClear: (clears: Clears) => void; onClearAll: () => void }) {
  const chips = chipsFor(filters)
  if (chips.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <ul aria-label="Active filters" className="contents">
        {chips.map((chip) => (
          <li key={chip.kind} className="font-ui flex min-h-9 max-w-full items-center gap-1 rounded-full border border-line-strong bg-canvas-sub pl-3 text-sm text-fg pointer-coarse:min-h-11">
            <span title={chip.text} className="min-w-0 truncate tabular-nums">
              {chip.text}
            </span>
            <button
              type="button"
              onClick={(event) => {
                if (!focusNeighbourChip(event.currentTarget)) focusFiltersTrigger()
                onClear(chip.clears)
              }}
              aria-label={`Remove ${chip.kind} ${chip.text}`}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted hover:text-fg pointer-coarse:size-11"
            >
              <XIcon size={16} />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClearAll} className={`${SHOP_SECONDARY} text-sm`}>
        Clear all
      </button>
    </div>
  )
}
