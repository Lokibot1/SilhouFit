import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { SORT_OPTIONS, PER_PAGE_OPTIONS, type SortKey } from '../../utils/productQuery'
import { FilterIcon, GridIcon, ListIcon } from '../form/icons'
import { Select } from '../ui/Select'
import { Tooltip } from '../ui/Tooltip'
import { SHOP_SECONDARY, SHOP_TOGGLE } from './shopControls'

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

// The search box lives in the navbar (ShopNavbar), so this row is controls only.
export function ShopToolbar(props: ShopToolbarProps) {
  const { view, onView } = props
  const viewButton = (value: 'grid' | 'list', label: string, icon: ReactNode) => (
    <Tooltip label={label}>
      <button
        type="button"
        aria-pressed={view === value}
        aria-label={label}
        onClick={() => onView(value)}
        className={`${SHOP_TOGGLE} relative size-9 pointer-coarse:size-11 px-0`}
      >
        {view === value && (
          <motion.span
            layoutId="view-indicator"
            aria-hidden="true"
            className="skeuo-ink-face absolute inset-0 rounded-xl"
            transition={{ duration: DURATION.state, ease: EASE_OUT }}
          />
        )}
        <span className="relative">{icon}</span>
      </button>
    </Tooltip>
  )

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-3">
      <div className="flex items-center gap-3">
        <button type="button" data-tour="shop-filters" onClick={props.onOpenFilters} className={SHOP_SECONDARY}>
          <FilterIcon />
          Filters
          {props.activeFilters + Number(props.categoryActive) > 0 && (
            <>
              {/* From sm the category pills are on the page, so only the modal's filters count. */}
              <span
                aria-hidden="true"
                className={`rounded-full bg-fg px-2 text-sm text-canvas tabular-nums ${props.activeFilters > 0 ? '' : 'sm:hidden'}`}
              >
                <span className="sm:hidden">{props.activeFilters + Number(props.categoryActive)}</span>
                <span className="max-sm:hidden">{props.activeFilters}</span>
              </span>
              <span className="sr-only">, {props.activeFilters} active</span>
            </>
          )}
        </button>
        <div role="group" aria-label="Layout" className="flex gap-1 rounded-xl">
          {viewButton('grid', 'Grid view', <GridIcon />)}
          {viewButton('list', 'List view', <ListIcon />)}
        </div>
      </div>
      {/* Side by side from 360px; below that the two stack so the sort value is never cut off. */}
      <div className="flex w-full gap-2 max-[359px]:flex-col sm:w-auto sm:gap-3">
        <div className="min-w-0 flex-1 sm:w-60 sm:flex-none">
          <Select
            label="Sort by"
            value={props.sort}
            options={SORT_OPTIONS}
            triggerPrefix="Sort: "
            onChange={props.onSort}
          />
        </div>
        <div className="w-33 max-[359px]:w-full sm:w-36">
          <Select
            label="Pieces per page"
            value={props.perPage}
            options={PER_PAGE_OPTIONS.map((n) => ({ value: n, label: `${n} per page` }))}
            onChange={props.onPerPage}
          />
        </div>
      </div>
    </div>
  )
}

/** The count, saved count and sync time, set beside the page heading. */
export function ShopSummary({ total, savedCount, syncedAt }: { total: number; savedCount: number; syncedAt: string }) {
  return (
    <p className="font-ui flex flex-wrap gap-x-4 text-sm text-fg-muted tabular-nums">
      <span aria-live="polite">
        {total} {total === 1 ? 'piece' : 'pieces'}
      </span>
      <span>Saved {savedCount}</span>
      <span>Stock synced {TIME.format(new Date(syncedAt))}</span>
    </p>
  )
}
