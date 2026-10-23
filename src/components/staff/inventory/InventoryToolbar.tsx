import type { ReactNode } from 'react'
import { INVENTORY_SAMPLE_DATA } from '../../../service/sampleInventory'
import { CATEGORIES } from '../../../data/products'
import { GENDERS, MAX_SEARCH, PER_PAGE_OPTIONS, type InventoryDir, type InventoryQuery, type InventorySort } from '../../../utils/inventoryQuery'
import { ChevronDownIcon, SearchIcon, XIcon } from '../../form/icons'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Select } from '../../ui/Select'

const CATEGORY_OPTIONS = [{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c as string, label: c }))]
const GENDER_OPTIONS = [{ value: '', label: 'All genders' }, ...GENDERS]
const STOCK_OPTIONS = [
  { value: '', label: 'All stock levels' },
  { value: 'in', label: 'In stock' },
]
// The API has no sold-out or sold-out-sizes filter yet, so these options only exist on the sample catalogue.
const SAMPLE_STOCK_OPTIONS = [
  { value: 'out', label: 'Out of stock' },
  { value: 'sizes', label: 'Has out-of-stock sizes' },
]
// The API has no arReady filter yet, so this only exists on the sample catalogue.
const AR_OPTIONS = [
  { value: '', label: 'All products' },
  { value: 'yes', label: 'AR Fitting ready' },
  { value: 'no', label: 'Not AR ready' },
]
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
  onFilter: (changes: { category?: string; gender?: string; stock?: string; ar?: string }) => void
  onSort: (sort: InventorySort, dir: InventoryDir) => void
  onPer: (per: number) => void
  onClear: () => void
  /** The Active | Archived switch, at the right end of the filters row. */
  tabs: ReactNode
}

export function InventoryToolbar({ text, onText, query, onFilter, onSort, onPer, onClear, tabs }: InventoryToolbarProps) {
  const active = Number(query.category !== '') + Number(query.gender !== '') + Number(query.stock !== '') + Number(query.ar !== '')
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
        <summary className="font-ui flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-line-strong px-3 text-base font-semibold text-fg @4xl:hidden [&::-webkit-details-marker]:hidden">
          Filters ({active})
          <ChevronDownIcon className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 flex flex-wrap items-center gap-3 @4xl:mt-0">
          <div className="w-full @sm:w-48 @4xl:w-40">
            <Select label="Category" value={query.category} options={CATEGORY_OPTIONS} onChange={(category) => onFilter({ category })} />
          </div>
          {/* The sample catalogue has no gender. */}
          {!INVENTORY_SAMPLE_DATA && (
            <div className="w-full @sm:w-48 @4xl:w-40">
              <Select label="Gender" value={query.gender} options={GENDER_OPTIONS} onChange={(gender) => onFilter({ gender })} />
            </div>
          )}
          <div className="w-full @sm:w-48 @4xl:w-40">
            <Select
              label="Stock"
              value={query.stock}
              options={INVENTORY_SAMPLE_DATA ? [...STOCK_OPTIONS, ...SAMPLE_STOCK_OPTIONS] : STOCK_OPTIONS}
              onChange={(stock) => onFilter({ stock })}
            />
          </div>
          {INVENTORY_SAMPLE_DATA && (
            <div className="w-full @sm:w-48 @4xl:w-40">
              <Select label="AR Fitting" value={query.ar} options={AR_OPTIONS} onChange={(ar) => onFilter({ ar })} />
            </div>
          )}
          <div className="w-full @sm:w-44 @4xl:w-36">
            <Select label="Rows per page" value={query.per} options={PER_PAGE_CHOICES} onChange={onPer} />
          </div>
          {active > 0 && (
            <button type="button" onClick={onClear} className={`${SECONDARY_BUTTON} text-sm`}>
              Clear filters
            </button>
          )}
          <div className="@sm:ml-auto">{tabs}</div>
        </div>
      </details>
    </div>
  )
}
