import type { CSSProperties } from 'react'
import type { ProductListItem } from '../../../service/fetchProductList'
import { isArchived } from '../../../utils/inventoryQuery'
import { InventoryCardSkeletonRows } from '../InventorySkeleton'
import { ArchivedBadge, ArBadge, openRow, PriceRange, ProductAction, rowTint, ProductThumb, StockAlerts, StockCount, stockLevel, type RowActions } from './InventoryParts'
import { CARD_ROW } from './layout'

interface InventoryCardsProps {
  rows: ProductListItem[] | null
  skeletonRows: number
  stale: boolean
  onOpen: (product: ProductListItem) => void
  actions: RowActions
}

/** The list shown where the card is too narrow for the table. Sorting is the toolbar's Sort by select. */
export function InventoryCards({ rows, skeletonRows, stale, onOpen, actions }: InventoryCardsProps) {
  return (
    <ul
      aria-busy={rows === null || stale}
      aria-label="Products"
      className={`divide-y divide-line border-y border-line @4xl:hidden transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}
    >
      {rows === null ? (
        <InventoryCardSkeletonRows count={skeletonRows} />
      ) : (
        rows.map((product, index) => {
          const archived = isArchived(product)
          return (
            <li
              key={product.id}
              data-product={product.id}
              data-stock={stockLevel(product.totalStock)}
              onClick={(event) => openRow(event, () => onOpen(product))}
              style={{ '--i': index } as CSSProperties}
              className={`${CARD_ROW} enter-row flex cursor-pointer items-center gap-3 hover:bg-line/40 ${rowTint(product)}`}
            >
              <ProductThumb product={product} className={`size-16 shrink-0 rounded-xl ${archived ? 'opacity-60 grayscale' : ''}`} />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  className="block min-h-11 w-full min-w-0 cursor-pointer rounded-xl text-left hover:text-chrome-strong"
                >
                  <span className={`block truncate text-base font-semibold ${archived ? 'text-fg-muted' : 'text-fg'}`}>{product.name}</span>
                  <span className="flex h-5 items-center gap-2 text-sm text-fg-muted">
                    <span className="truncate">{[product.category, product.brand].filter(Boolean).join(', ')}</span>
                    {product.arReady !== undefined && <ArBadge ready={product.arReady} compact />}
                  </span>
                </button>
                <p className="min-w-0 truncate text-sm text-fg tabular-nums">
                  <PriceRange product={product} />
                </p>
                <div className="flex items-center gap-2">
                  {archived && <ArchivedBadge />}
                  <span className="text-sm text-fg tabular-nums">
                    <StockCount product={product} />
                  </span>
                  <StockAlerts product={product} />
                </div>
              </div>
              <ProductAction product={product} actions={actions} />
            </li>
          )
        })
      )}
    </ul>
  )
}
