import type { ReactNode } from 'react'
import { SORT_OPTIONS, PER_PAGE_OPTIONS, type SortKey } from '../../utils/productQuery'
import { FilterIcon, GridIcon, HeartIcon, ListIcon } from '../form/icons'
import { SECONDARY_BUTTON } from '../ui/buttonStyles'

const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

interface ShopToolbarProps {
  search: string
  onSearch: (value: string) => void
  sort: SortKey
  onSort: (value: SortKey) => void
  perPage: number
  onPerPage: (value: number) => void
  view: 'grid' | 'list'
  onView: (value: 'grid' | 'list') => void
  activeFilters: number
  onOpenFilters: () => void
  savedCount: number
  total: number
  syncedAt: string
}

const SELECT =
  'font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas px-3 text-base text-fg'

export function ShopToolbar(props: ShopToolbarProps) {
  const { view, onView, total } = props
  const viewButton = (value: 'grid' | 'list', label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-pressed={view === value}
      aria-label={label}
      onClick={() => onView(value)}
      className={`flex size-11 cursor-pointer items-center justify-center rounded-xl ${
        view === value ? 'bg-fg text-canvas' : 'text-fg hover:bg-fg/10'
      }`}
    >
      {icon}
    </button>
  )

  return (
    <div className="mt-6 space-y-4">
      <div>
        <label htmlFor="shop-search" className="sr-only">
          Search the catalogue
        </label>
        <input
          id="shop-search"
          type="search"
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          placeholder="Search by name, colour or boutique"
          autoComplete="off"
          className="font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas px-4 text-base text-fg placeholder:text-fg-muted"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={props.onOpenFilters} className={SECONDARY_BUTTON}>
          <FilterIcon />
          Filters
          {props.activeFilters > 0 && (
            <>
              <span aria-hidden="true" className="rounded-full bg-fg px-2 text-sm text-canvas tabular-nums">
                {props.activeFilters}
              </span>
              <span className="sr-only">, {props.activeFilters} active</span>
            </>
          )}
        </button>
        <div role="group" aria-label="Layout" className="glass-btn flex rounded-xl">
          {viewButton('grid', 'Grid view', <GridIcon />)}
          {viewButton('list', 'List view', <ListIcon />)}
        </div>
        <p className="font-ui ml-auto flex items-center gap-1.5 text-sm text-fg-muted tabular-nums">
          <HeartIcon size={16} />
          Saved {props.savedCount}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <label className="font-ui text-xs text-fg-muted">
          Sort by
          <select
            value={props.sort}
            onChange={(event) => props.onSort(event.target.value as SortKey)}
            className={`${SELECT} mt-1`}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="font-ui text-xs text-fg-muted">
          Pieces per page
          <select
            value={props.perPage}
            onChange={(event) => props.onPerPage(Number(event.target.value))}
            className={`${SELECT} mt-1`}
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="font-ui flex flex-col gap-1 text-sm text-fg-muted sm:flex-row sm:justify-between">
        <p aria-live="polite" className="tabular-nums">
          {total} {total === 1 ? 'piece' : 'pieces'}
        </p>
        <p className="tabular-nums">Stock synced {TIME.format(new Date(props.syncedAt))}</p>
      </div>
    </div>
  )
}
