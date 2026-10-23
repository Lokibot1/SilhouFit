import { useEffect, type CSSProperties } from 'react'
import type { ProductListItem } from '../../../service/fetchProductList'
import { isArchived, type InventoryDir, type InventorySort } from '../../../utils/inventoryQuery'
import { InventoryTableSkeletonRows } from '../InventorySkeleton'
import { AddedDate, ArchivedBadge, ArBadge, needsAlert, openRow, PriceRange, rowTint, stockLevel, ProductAction, ProductThumb, StockAlerts, StockCount, type RowActions } from './InventoryParts'
import { InventoryColgroup, rememberedShowAlerts, rememberShowAlerts, TABLE_ROW, TD, TH } from './layout'
import { SortHeader } from './SortHeader'

interface InventoryTableProps {
  sorted: { sort: InventorySort; dir: InventoryDir }
  onSort: (column: InventorySort) => void
  /** Null while the first page loads: the body is then skeleton rows. */
  rows: ProductListItem[] | null
  skeletonRows: number
  /** The rows shown are from the previous request. */
  stale: boolean
  onOpen: (product: ProductListItem) => void
  actions: RowActions
}

export function InventoryTable({ sorted, onSort, rows, skeletonRows, stale, onOpen, actions }: InventoryTableProps) {
  // One flag drives the header, cells, colgroup and skeleton. With no rows yet the skeleton uses the layout the table last had.
  const showAlerts = rows ? rows.some(needsAlert) : rememberedShowAlerts()
  useEffect(() => {
    if (rows && rows.length > 0) rememberShowAlerts(showAlerts)
  }, [rows, showAlerts])
  return (
    <table aria-busy={rows === null || stale} className="hidden w-full table-fixed border-separate border-spacing-0 @4xl:table">
      <caption className="sr-only">Products with category, AR Fitting, price, date added, stock and stock alerts</caption>
      <InventoryColgroup showAlerts={showAlerts} />
      <thead>
        <tr>
          <SortHeader label="Product" column="name" active={sorted} onSort={onSort} />
          <th scope="col" className={TH}>
            Category
          </th>
          <th scope="col" className={TH}>
            AR Fitting
          </th>
          <SortHeader label="Price" column="price" active={sorted} onSort={onSort} />
          <SortHeader label="Added" column="date" active={sorted} onSort={onSort} />
          <th scope="col" className={`${TH} text-center!`}>
            Stock
          </th>
          {showAlerts && (
            <th scope="col" className={`${TH} text-center!`}>
              Stock alert
            </th>
          )}
          <th scope="col" className={TH}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className={`transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
        {rows === null ? (
          <InventoryTableSkeletonRows count={skeletonRows} showAlerts={showAlerts} />
        ) : (
          rows.map((product, index) => {
            const archived = isArchived(product)
            return (
              <tr
                key={product.id}
                data-product={product.id}
                data-stock={stockLevel(product.totalStock)}
                onClick={(event) => openRow(event, () => onOpen(product))}
                style={{ '--i': index } as CSSProperties}
                className={`${TABLE_ROW} enter-row cursor-pointer hover:bg-line/40 ${rowTint(product)}`}
              >
                <td className={TD}>
                  <div className="flex min-w-0 items-center gap-2.5 @6xl:gap-3">
                    <ProductThumb product={product} className={`size-10 shrink-0 rounded-xl ${archived ? 'opacity-60 grayscale' : ''}`} />
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      className="flex min-h-11 min-w-0 cursor-pointer flex-col justify-center rounded-xl text-left hover:text-chrome-strong"
                    >
                      <span className={`block truncate text-base font-semibold ${archived ? 'text-fg-muted' : 'text-fg'}`}>{product.name}</span>
                      {(product.brand || archived) && (
                        <span className="flex items-center gap-2">
                          {product.brand && <span className="truncate text-sm text-fg-muted">{product.brand}</span>}
                          {archived && <ArchivedBadge />}
                        </span>
                      )}
                    </button>
                  </div>
                </td>
                <td className={`${TD} text-sm text-fg`}>
                  <span className="block truncate">{product.category}</span>
                </td>
                <td className={TD}>
                  {product.arReady === undefined ? (
                    <>
                      <span aria-hidden="true" className="text-sm text-fg-muted">
                        —
                      </span>
                      <span className="sr-only">Not specified</span>
                    </>
                  ) : (
                    <ArBadge ready={product.arReady} compact />
                  )}
                </td>
                <td className={`${TD} text-sm text-fg tabular-nums`}>
                  <PriceRange product={product} />
                </td>
                <td className={`${TD} text-sm whitespace-nowrap text-fg-muted`}>
                  <AddedDate iso={product.createdAt} />
                </td>
                <td className={`${TD} text-center text-sm text-fg tabular-nums`}>
                  <StockCount product={product} />
                </td>
                {showAlerts && (
                  <td className={TD}>
                    <div className="flex flex-col items-center gap-0.5">
                      <StockAlerts product={product} />
                    </div>
                  </td>
                )}
                <td className="border-b border-line px-1">
                  <div className="flex justify-center">
                    <ProductAction product={product} actions={actions} />
                  </div>
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
