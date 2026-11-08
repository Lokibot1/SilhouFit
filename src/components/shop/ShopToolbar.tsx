import type { ReactNode } from 'react'
import { SORT_OPTIONS, PER_PAGE_OPTIONS, type SortKey } from '../../utils/productQuery'
import { FilterIcon, GridIcon, ListIcon } from '../form/icons'
import { Select } from '../ui/Select'
import { Tooltip } from '../ui/Tooltip'
import { KRAL_CHIP, KRAL_SECONDARY } from './shopControls'

const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

interface ShopToolbarProps {
  sort: SortKey
  onSort: (value: SortKey) => void
  perPage: number
  onPerPage: (value: number) => void
  view: 'grid' | 'list'
  onView: (value: 'grid' | 'list') => void
  activeFilters: number
  /** A category other than All is chosen. Phones set it in the Filters modal, so it counts there. */
  categoryActive: boolean
  onOpenFilters: () => void
}

// The search box lives in the navbar (SiteHeader), so this row is controls only.
export function ShopToolbar(props: ShopToolbarProps) {
  const { view, onView } = props
  const viewButton = (value: 'grid' | 'list', label: string, icon: ReactNode) => (
    <Tooltip label={label} tone="kral">
      <button
        type="button"
        aria-pressed={view === value}
        aria-label={label}
        onClick={() => onView(value)}
        className={`${KRAL_CHIP} size-11 px-0`}
      >
        {icon}
      </button>
    </Tooltip>
  )

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-3">
      <div className="flex items-center gap-3">
        <button type="button" data-tour="shop-filters" data-filters-trigger onClick={props.onOpenFilters} className={KRAL_SECONDARY}>
          <FilterIcon />
          Filters
          {props.activeFilters + Number(props.categoryActive) > 0 && (
            <>
              {/* From sm the category pills are on the page, so only the modal's filters count. */}
              <span
                aria-hidden="true"
                className={`tabular-nums before:content-['('] after:content-[')'] ${props.activeFilters > 0 ? '' : 'sm:hidden'}`}
              >
                <span className="sm:hidden">{props.activeFilters + Number(props.categoryActive)}</span>
                <span className="max-sm:hidden">{props.activeFilters}</span>
              </span>
              <span className="sr-only">, {props.activeFilters} active</span>
            </>
          )}
        </button>
        <div role="group" aria-label="Layout" className="flex gap-2">
          {viewButton('grid', 'Grid view', <GridIcon />)}
          {viewButton('list', 'List view', <ListIcon />)}
        </div>
      </div>
      {/* Mono caps at 16px are wide: each gets a fixed compact width and they wrap onto their own rows only when the screen is too narrow for both. */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <div className="w-56 max-w-full">
          <Select
            label="Sort by"
            value={props.sort}
            options={SORT_OPTIONS}
            triggerPrefix="Sort: "
            onChange={props.onSort}
            tone="kral"
          />
        </div>
        <div className="w-44 max-w-full">
          <Select
            label="Pieces per page"
            value={props.perPage}
            options={PER_PAGE_OPTIONS.map((n) => ({ value: n, label: `${n} per page` }))}
            onChange={props.onPerPage}
            tone="kral"
          />
        </div>
      </div>
    </div>
  )
}

/** The count, saved count and sync time, set beside the page heading. */
export function ShopSummary({ total, savedCount, syncedAt }: { total: number; savedCount: number; syncedAt: string }) {
  return (
    <p className="font-kral-mono flex flex-wrap gap-x-2 text-sm text-kral-muted tabular-nums">
      <span aria-live="polite">
        {total} {total === 1 ? 'piece' : 'pieces'}
      </span>
      <span aria-hidden="true">//</span>
      <span>Saved {savedCount}</span>
      <span aria-hidden="true">//</span>
      <span>Stock synced {TIME.format(new Date(syncedAt))}</span>
    </p>
  )
}
