import { useState, type ReactNode } from 'react'
import { CATEGORIES } from '../../../data/products'
import {
  activeFilterCount,
  MAX_SEARCH,
  PER_PAGE_OPTIONS,
  type InventoryDir,
  type InventoryQuery,
  type InventorySort,
} from '../../../utils/inventoryQuery'
import { focusFiltersTrigger, focusNeighbourChip } from '../../../utils/chipFocus'
import { ChevronDownIcon, FilterIcon, SearchIcon, XIcon } from '../../form/icons'
import { SECONDARY_BUTTON, SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { Select } from '../../ui/Select'
import { AR_OPTIONS, filterChips, GENDER_OPTIONS, STOCK_OPTIONS } from './filterChips'
import { InventoryFilterPanel } from './InventoryFilterPanel'

const CATEGORY_OPTIONS = [{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c as string, label: c }))]
const PER_PAGE_CHOICES = PER_PAGE_OPTIONS.map((n) => ({ value: n, label: `${n} per page` }))
const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'name-asc', label: 'Name: A to Z' },
  { value: 'name-desc', label: 'Name: Z to A' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
]

interface InventoryToolbarProps {
  text: string
  onText: (text: string) => void
  query: InventoryQuery
  onFilter: (changes: Record<string, string>) => void
  onSort: (sort: InventorySort, dir: InventoryDir) => void
  onPer: (per: number) => void
  onClear: () => void
  /** The Active | Archived switch, at the right end of the filters row. */
  tabs: ReactNode
}

export function InventoryToolbar({ text, onText, query, onFilter, onSort, onPer, onClear, tabs }: InventoryToolbarProps) {
  const active = activeFilterCount(query)
  const chips = filterChips(query)
  const [panelOpen, setPanelOpen] = useState(false)
  const panelActive = Number(query.brand !== '') + Number(query.size !== '') + Number(query.color !== '') + Number(query.minPrice !== undefined || query.maxPrice !== undefined)
  return (
    <div className="mb-3 grid gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
        <input
          type="text"
          value={text}
          onChange={(event) => onText(event.target.value)}
          maxLength={MAX_SEARCH}
          placeholder="Name, brand or ID"
          aria-label="Search products by name, brand or full product ID"
          autoComplete="off"
          spellCheck={false}
          className="font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas pr-11 pl-10 text-base text-fg placeholder:text-fg-muted"
        />
        {text && (
          <button
            type="button"
            onClick={() => onText('')}
            aria-label="Clear search"
            className="absolute top-0 right-0 flex size-11 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:text-fg"
          >
            <XIcon />
          </button>
        )}
      </div>
      <div className="@4xl:hidden">
        <Select
          label="Sort by"
          triggerPrefix="Sort by: "
          value={`${query.sort}-${query.dir}`}
          options={SORT_OPTIONS}
          onChange={(value) => onSort(...(value.split('-') as [InventorySort, InventoryDir]))}
        />
      </div>
      {/* Below the card's @4xl the filters fold away under the summary; from there the summary is hidden and they always show. */}
      <details className="group [&::details-content]:@4xl:[content-visibility:visible]">
        <summary data-filters-summary className="font-ui flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-line-strong px-3 text-base font-semibold text-fg @4xl:hidden [&::-webkit-details-marker]:hidden">
          Filters ({active})
          <ChevronDownIcon className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 flex flex-wrap items-center gap-3 @4xl:mt-0">
          <div className="w-full @sm:w-48 @4xl:w-40">
            <Select label="Category" value={query.category} options={CATEGORY_OPTIONS} onChange={(category) => onFilter({ category })} />
          </div>
          <div className="w-full @sm:w-48 @4xl:w-40">
            <Select label="Gender" value={query.gender} options={GENDER_OPTIONS} onChange={(gender) => onFilter({ gender })} />
          </div>
          <div className="w-full @sm:w-48 @4xl:w-40">
            <Select label="Stock" value={query.stock} options={STOCK_OPTIONS} onChange={(stock) => onFilter({ stock })} />
          </div>
          <div className="w-full @sm:w-48 @4xl:w-40">
            <Select label="AR Fitting" value={query.ar} options={AR_OPTIONS} onChange={(ar) => onFilter({ ar })} />
          </div>
          <div className="w-full @sm:w-44 @4xl:w-36">
            <Select label="Rows per page" value={query.per} options={PER_PAGE_CHOICES} onChange={onPer} />
          </div>
          <button type="button" data-testid="inventory-more-filters" data-filters-trigger onClick={() => setPanelOpen(true)} className={`${SECONDARY_BUTTON_SM} w-full @sm:w-auto`}>
            <FilterIcon size={16} />
            More filters
            {panelActive > 0 && <span className="rounded-full bg-fg px-2 text-xs text-canvas tabular-nums">{panelActive}</span>}
          </button>
          <div className="@sm:ml-auto">{tabs}</div>
        </div>
      </details>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <ul aria-label="Active filters" className="contents">
            {chips.map((chip) => (
              <li
                key={chip.kind}
                className="flex min-h-9 max-w-full items-center gap-1 rounded-full border border-line-strong bg-canvas-sub pl-3 text-sm text-fg pointer-coarse:min-h-11"
              >
                <span title={chip.text} className="min-w-0 truncate tabular-nums">
                  {chip.text}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    if (!focusNeighbourChip(event.currentTarget)) focusFiltersTrigger()
                    onFilter(chip.changes)
                  }}
                  aria-label={`Remove ${chip.kind} ${chip.text}`}
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted hover:text-fg pointer-coarse:size-11"
                >
                  <XIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onClear} className={`${SECONDARY_BUTTON} min-h-10 text-sm pointer-coarse:min-h-11`}>
            Clear all
          </button>
        </div>
      )}
      <InventoryFilterPanel open={panelOpen} onClose={() => setPanelOpen(false)} query={query} onApply={onFilter} />
    </div>
  )
}
