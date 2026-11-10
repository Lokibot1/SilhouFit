import { type MouseEvent, type ReactNode } from 'react'
import { LOW_STOCK } from '../../../data/products'
import type { ProductListItem, ProductVariant } from '../../../service/fetchProductList'
import { formatPeso } from '../../../utils/format'
import { isArchived, isSoldOut } from '../../../utils/inventoryQuery'
import { PlusIcon, RestoreIcon } from '../../form/icons'
import { PhotoImg } from '../../ui/PhotoImg'
import { Tooltip } from '../../ui/Tooltip'

const LEVELS = {
  out: { label: 'Out of stock', dot: 'bg-danger', border: 'border-danger! bg-danger/15 font-semibold' },
  low: { label: 'Low stock', dot: 'border-2 border-danger dark:border-warning', border: 'dark:border-warning' },
  in: { label: 'In stock', dot: 'bg-success', border: '' },
} as const

export const stockLevel = (stock: number): keyof typeof LEVELS => (stock <= 0 ? 'out' : stock <= LOW_STOCK ? 'low' : 'in')

/** The row's edge tint: Out of stock red, Low yellow. Archived rows and rows with stock overall (even with sizes out) stay plain. */
export const rowTint = (product: ProductListItem) => {
  if (isArchived(product)) return ''
  const level = stockLevel(product.totalStock)
  return level === 'out' ? 'row-out' : level === 'low' ? 'row-low' : ''
}

/** What to call a variant: "Navy M", or its name or SKU when it has neither colour nor size. */
export const variantLabel = (v: Pick<ProductVariant, 'color' | 'size' | 'name' | 'sku'>) => [v.color, v.size].filter(Boolean).join(' ') || v.name || v.sku

const ADDED_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const ADDED_FULL = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

/** The date added in a short form ("Oct 23, 2026"). Screen readers get the full date; a mouse gets it as a tooltip. */
export function AddedDate({ iso }: { iso: string }) {
  if (!iso || Number.isNaN(Date.parse(iso))) return <>—</>
  const date = new Date(iso)
  return (
    <Tooltip label={ADDED_FULL.format(date)}>
      <time dateTime={iso} className="whitespace-nowrap">
        <span aria-hidden="true">{ADDED_SHORT.format(date)}</span>
        <span className="sr-only">{ADDED_FULL.format(date)}</span>
      </time>
    </Tooltip>
  )
}

/**
 * Click handler for a whole row. The name button has no handler of its own: its click (mouse, touch or Enter) bubbles here, so a row opens once.
 * Focus goes to that button first, so the drawer hands focus back to it. Dragging out a text selection does not open the row.
 */
export function openRow(event: MouseEvent<HTMLElement>, open: () => void) {
  if (window.getSelection()?.toString()) return
  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
  open()
}

/** The level in words and a dot (filled, ringed or green), so it never rests on colour alone. */
/** `compact` is the drawer header's size; `mini` is for table cells, where room is tight. */
export function StockBadge({ stock, compact }: { stock: number; compact?: boolean | 'mini' }) {
  const level = LEVELS[stockLevel(stock)]
  return (
    <span
      className={`inline-flex items-center rounded-full border border-line-strong whitespace-nowrap text-fg ${compact === 'mini' ? 'h-4 gap-1 px-1.5 text-xs leading-none' : compact ? 'h-5 gap-1 px-1.5 text-xs' : 'h-6 gap-1.5 px-2 text-sm'} ${level.border}`}
    >
      <span aria-hidden="true" className={`shrink-0 rounded-full ${compact ? 'size-1.5' : 'size-2'} ${level.dot}`} />
      {level.label}
    </span>
  )
}

/** Some sizes are sold out while the product still has stock. Small and neutral: the stock badge is the louder signal. */
export function SizesOutChip({ count }: { count: number }) {
  return (
    <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-fg/15 px-1.5 text-xs whitespace-nowrap text-fg/80 tabular-nums">{`${count} ${count === 1 ? 'size' : 'sizes'} out`}</span>
  )
}

/** A product row needs attention when it is low, out, or has sold-out sizes. Archived rows never do. */
export const needsAlert = (product: ProductListItem) =>
  !isArchived(product) && (stockLevel(product.totalStock) !== 'in' || (product.totalStock > 0 && !!product.outOfStockVariants))

/** The stock count alone. A plain in-stock row says so to screen readers only; Low and Out are badges beside it. */
export function StockCount({ product }: { product: ProductListItem }) {
  return (
    <>
      {!isArchived(product) && stockLevel(product.totalStock) === 'in' && <span className="sr-only">{LEVELS.in.label} </span>}
      {product.totalStock}
    </>
  )
}

/** Low or Out badge and the sizes chip, or nothing. */
export function StockAlerts({ product }: { product: ProductListItem }) {
  if (!needsAlert(product)) return null
  return (
    <>
      {stockLevel(product.totalStock) !== 'in' && <StockBadge stock={product.totalStock} />}
      {product.totalStock > 0 && !!product.outOfStockVariants && <SizesOutChip count={product.outOfStockVariants} />}
    </>
  )
}

/** AR Fitting state in words and a dot (filled green, or a grey ring), so it never rests on colour alone. Text stays --fg on the tint. */
export function ArBadge({ ready, compact }: { ready: boolean; compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border whitespace-nowrap text-fg ${compact ? 'h-5 gap-1 px-1.5 text-xs' : 'h-6 gap-1.5 px-2 text-sm'} ${ready ? 'border-success bg-success/15' : 'border-line-strong bg-line'}`}
    >
      <span aria-hidden="true" className={`shrink-0 rounded-full ${compact ? 'size-1.5' : 'size-2'} ${ready ? 'bg-success' : 'border-2 border-fg-muted'}`} />
      {ready ? 'AR ready' : 'Not AR ready'}
    </span>
  )
}

export function ArchivedBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-dashed border-line-strong whitespace-nowrap text-fg-muted ${compact ? 'h-5 px-1.5 text-xs' : 'h-6 px-2 text-sm'}`}
    >
      Archived
    </span>
  )
}

/** An icon button inside a row. Its click must not reach the row, which would also open the drawer. */
export function RowAction({ label, icon, onClick, disabled }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-line/60 hover:text-chrome-strong disabled:cursor-progress disabled:opacity-60"
      >
        {icon}
      </button>
    </Tooltip>
  )
}

export interface RowActions {
  onRestock: (product: ProductListItem) => void
  onRestore: (product: ProductListItem) => void
  /** The product whose archive or restore is in flight; its action waits. */
  busyId: string | null
}

/** The row's quick action, or nothing. Accessible names carry the product: "Restock Fence-Line Blazer". */
export function ProductAction({ product, actions }: { product: ProductListItem; actions: RowActions }) {
  if (isArchived(product))
    return (
      <RowAction label={`Restore ${product.name}`} icon={<RestoreIcon />} onClick={() => actions.onRestore(product)} disabled={actions.busyId === product.id} />
    )
  if (isSoldOut(product)) return <RowAction label={`Restock ${product.name}`} icon={<PlusIcon />} onClick={() => actions.onRestock(product)} />
  return null
}

export function ProductThumb({ product, className }: { product: ProductListItem; className: string }) {
  const image = product.primaryImage
  return <PhotoImg src={image?.url} alt={image?.altText ?? product.name} loading="lazy" className={`${className} bg-line object-cover`} />
}

export function PriceRange({ product }: { product: ProductListItem }) {
  return (
    <>
      <span className="whitespace-nowrap">{formatPeso(product.minPrice)}</span>
      {product.maxPrice > product.minPrice && (
        <>
          {' '}
          <span className="whitespace-nowrap">– {formatPeso(product.maxPrice)}</span>
        </>
      )}
    </>
  )
}
