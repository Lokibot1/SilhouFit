import type { ReactNode } from 'react'
import type { SectionState } from '../../../hooks/useSection'
import type { ProductListItem, ProductVariant } from '../../../service/fetchProductList'
import { isArchived } from '../../../utils/inventoryQuery'
import { parseStock } from '../../../utils/stockEdit'
import { InfoIcon, PencilIcon, PlusIcon, TrashIcon } from '../../form/icons'
import { SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { Checkbox } from '../../ui/Checkbox'
import { useToast } from '../../toast/useToast'
import { Tooltip } from '../../ui/Tooltip'
import { EmptyNote, SectionBody } from '../StaffSection'
import { ArchivedBadge, ArBadge, PriceRange, ProductThumb, RowAction, StockBadge, stockLevel, variantLabel } from './InventoryParts'
import { SoldOutHelper, StockCell } from './StockEditor'

const GROUP_ROW = 'h-11'
const SKU_HELP = 'SKU (Stock Keeping Unit): the unique code of one size and colour of this product. Stock, carts and orders use it to tell variants apart.'
const VARIANT_ROW = 'h-14'
// Below sm the two actions stack so the SKU keeps its room.
const MANAGED_ROW = 'h-24 sm:h-14'
const FACT_LABEL = 'text-xs text-fg-muted'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** The variant's swatch colour; a neutral dot when it has none. */
function Swatch({ colorHex }: { colorHex?: string | null }) {
  return (
    <span
      aria-hidden="true"
      style={colorHex ? { backgroundColor: colorHex } : undefined}
      className={`size-4 shrink-0 rounded-full border border-line-strong ${colorHex ? '' : 'bg-line'}`}
    />
  )
}

function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  )
}

export function CopyId({ id, what = 'product' }: { id: string; what?: string }) {
  const toast = useToast()
  async function copy() {
    try {
      await navigator.clipboard.writeText(id)
      toast.show({ kind: 'success', message: 'ID copied' })
    } catch {
      toast.show({ kind: 'error', message: "Couldn't copy the ID. Your browser blocked clipboard access, so select the ID and copy it by hand." })
    }
  }
  return (
    <Tooltip label="Copy ID">
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${what} ID`}
        className="-m-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:text-fg pointer-coarse:size-11"
      >
        <CopyIcon />
      </button>
    </Tooltip>
  )
}

/** What staff can do to a product's details and variants from the drawer. Left out while stock is being edited and for archived products. */
export interface ManageActions {
  onAddVariant: () => void
  onEditVariant: (variant: ProductVariant) => void
  onDeleteVariant: (variant: ProductVariant) => void
}

/** Where focus returns after a variant's delete prompt closes. Only one Add variant button shows at a time. */
export const ADD_VARIANT_ID = 'inventory-add-variant'

const AddVariantButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" id={ADD_VARIANT_ID} onClick={onClick} className={SECONDARY_BUTTON_SM}>
    <PlusIcon />
    Add color{' '}<span className="sr-only">variant</span>
  </button>
)

/** The product's own facts, taken from the list row so they show before the variants arrive. */
function Header({ product }: { product: ProductListItem }) {
  return (
    <div>
      <div className="flex gap-4">
        <ProductThumb product={product} className="size-24 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-fg-muted">{[product.category, product.brand].filter(Boolean).join(', ')}</p>
          <p className="mt-1 text-base font-semibold text-fg tabular-nums">
            <PriceRange product={product} />
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {isArchived(product) ? <ArchivedBadge compact /> : stockLevel(product.totalStock) !== 'in' && <StockBadge stock={product.totalStock} compact />}
            <span className="text-xs text-fg tabular-nums">{product.totalStock} in total</span>
            {product.arReady !== undefined && <ArBadge ready={product.arReady} compact />}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <p className="min-w-0 font-mono text-xs break-all text-fg-muted">
          <span className="sr-only">Product ID </span>
          {product.id}
        </p>
        <CopyId id={product.id} />
      </div>
    </div>
  )
}

const unique = (values: string[]) => [...new Set(values)]

/** Variant count, colours and sizes; `action` sits at the right end of the same rows. */
function Facts({ variants, action }: { variants: ProductVariant[]; action?: ReactNode }) {
  const colors = unique(variants.flatMap((v) => v.color ?? []))
  const sizes = unique(variants.flatMap((v) => v.size ?? []))
  return (
    <dl className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-5 gap-y-1">
      <dt className={FACT_LABEL}>Variants</dt>
      <dt className={FACT_LABEL}>Colors</dt>
      <dt className={FACT_LABEL}>Sizes</dt>
      <dd className="min-h-6 text-xs text-fg tabular-nums">{variants.length}</dd>
      <dd className="flex min-h-6 flex-wrap items-center gap-1.5" aria-label={colors.join(', ')}>
        {colors.map((color) => (
          <Swatch key={color} colorHex={variants.find((v) => v.color === color)?.colorHex} />
        ))}
      </dd>
      <dd className="min-h-6 text-xs text-fg">{sizes.join(', ')}</dd>
      {action && <div className="col-start-4 row-span-2 row-start-1 self-center">{action}</div>}
    </dl>
  )
}

function VariantsSkeleton() {
  return (
    <div role="status" aria-label="Loading variants" className="animate-pulse">
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-5 gap-y-1">
        {[0, 1, 2].map((n) => (
          <Bar key={n} className="h-5 w-14" />
        ))}
        {[0, 1, 2].map((n) => (
          <Bar key={n} className="h-6 w-full" />
        ))}
      </div>
      <div className="mt-4 h-11 border-b border-line" />
      {[0, 1, 2].map((n) => (
        <div key={n} className={`${VARIANT_ROW} flex items-center justify-between gap-3 border-b border-line`}>
          <Bar className="h-5 w-1/2" />
          <Bar className="h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** The stock boxes shown instead of the read-only stock while a product's stock is being edited. `draft` holds the text of the boxes that were touched. */
export interface StockEdit {
  draft: Record<string, string>
  disabled: boolean
  onChange: (variantId: string, text: string) => void
  onSetSoldOut: (stock: number) => void
  /** The AR Fitting checkbox, saved with the stock. */
  ar?: { checked: boolean; onChange: (checked: boolean) => void }
}

function VariantTable({ variants, edit, manage }: { variants: ProductVariant[]; edit?: StockEdit; manage?: ManageActions }) {
  const groups = new Map<string, ProductVariant[]>()
  for (const variant of variants) groups.set(variant.color ?? '', [...(groups.get(variant.color ?? '') ?? []), variant])
  const th = 'sticky top-0 z-10 h-11 border-b border-line bg-canvas-sub text-left font-semibold text-fg'
  const columns = manage ? 4 : 3

  return (
    <table className="mt-4 w-full table-fixed border-separate border-spacing-0 text-xs">
      <caption className="sr-only">Variants by color, with size, SKU and stock</caption>
      <colgroup>
        <col className="w-14" />
        <col />
        <col className={edit ? 'w-36' : 'w-28'} />
        {manage && <col className="w-11 sm:w-[5.5rem]" />}
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className={`${th} pl-3`}>
            Size
          </th>
          <th scope="col" className={th}>
            <span className="inline-flex items-center gap-1">
              SKU
              <Tooltip label={SKU_HELP} describe wrap>
                <button type="button" aria-label="What is a SKU?" className="flex size-4 cursor-help items-center justify-center rounded-full text-fg-muted hover:text-chrome-strong">
                  <InfoIcon className="size-3" />
                </button>
              </Tooltip>
            </span>
          </th>
          <th scope="col" className={`${th.replace('text-left', '')} text-center`}>
            Stock
          </th>
          {manage && (
            <th scope="col" className={th}>
              <span className="sr-only">Actions</span>
            </th>
          )}
        </tr>
      </thead>
      {[...groups].map(([color, items]) => (
        <tbody key={color}>
          <tr className={GROUP_ROW}>
            <th scope="rowgroup" colSpan={columns} className="border-b border-line pl-3 text-left text-xs font-medium text-fg">
              <span className="flex items-center gap-2">
                <Swatch colorHex={items[0].colorHex} />
                <span className="min-w-0 flex-1 truncate">{color || 'No colour'}</span>
                <span className="font-normal text-fg-muted tabular-nums">{items.reduce((sum, v) => sum + v.stock, 0)} in stock</span>
              </span>
            </th>
          </tr>
          {items.map((variant) => {
            const level = stockLevel(variant.stock)
            const text = edit?.draft[variant.id]
            const dirty = text !== undefined && parseStock(text) !== variant.stock
            return (
              <tr key={variant.id} className={`${manage ? MANAGED_ROW : VARIANT_ROW} ${edit ? (dirty ? 'bg-chrome/15' : '') : level === 'out' ? 'bg-danger/10' : ''}`}>
                <td className="border-b border-line pl-3 text-fg">{variant.size ?? '-'}</td>
                <td className="border-b border-line pr-2 font-mono text-xs break-all text-fg-muted">
                  {variant.sku}
                  {variant.name && <span className="font-ui block text-fg">{variant.name}</span>}
                  {dirty && <span className="block text-fg tabular-nums">Was {variant.stock}</span>}
                </td>
                <td className="border-b border-line text-center">
                  {edit ? (
                    <StockCell
                      variant={variant}
                      text={text ?? String(variant.stock)}
                      disabled={edit.disabled}
                      onChange={(next) => edit.onChange(variant.id, next)}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <span className={`text-fg tabular-nums ${level === 'in' ? '' : 'font-semibold'}`}>{variant.stock}</span>
                      <StockBadge stock={variant.stock} compact="mini" />
                    </div>
                  )}
                </td>
                {manage && (
                  <td className="border-b border-line">
                    <div className="flex flex-col items-end sm:flex-row sm:justify-end">
                      <RowAction label={`Edit ${variantLabel(variant)}`} icon={<PencilIcon />} onClick={() => manage.onEditVariant(variant)} />
                      <RowAction label={`Delete ${variantLabel(variant)}`} icon={<TrashIcon />} onClick={() => manage.onDeleteVariant(variant)} />
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      ))}
    </table>
  )
}

/** One product's drawer content: its header at once, then the colour and size variants with the stock of each (or the stock boxes, with `edit`). The drawer owns the request. */
export function ProductDetail({
  product,
  section,
  edit,
  manage,
  notice,
}: {
  product: ProductListItem
  section: { state: SectionState<{ variants: ProductVariant[] }>; retry: () => void }
  edit?: StockEdit
  manage?: ManageActions
  notice?: ReactNode
}) {
  return (
    <div className="pb-5">
      <Header product={product} />
      {notice}
      {edit?.ar && (
        <div className="mt-4 grid gap-1">
          <Checkbox label="AR Fitting ready" checked={edit.ar.checked} onChange={edit.ar.onChange} className="justify-start">
            <span className="text-sm font-semibold">AR Fitting ready</span>
          </Checkbox>
          <p className="text-xs text-fg-muted">Shoppers can try this item on in AR Fitting.</p>
        </div>
      )}
      <div className="mt-4">
        <SectionBody section={section} what="the variants" skeleton={<VariantsSkeleton />}>
          {({ variants }) =>
            variants.length === 0 ? (
              <>
                <EmptyNote>This product has no variants yet.</EmptyNote>
                {manage && (
                  <div className="mt-3">
                    <AddVariantButton onClick={manage.onAddVariant} />
                  </div>
                )}
              </>
            ) : (
              <>
                <Facts variants={variants} action={manage && <AddVariantButton onClick={manage.onAddVariant} />} />
                {edit && variants.some((v) => v.stock <= 0) && (
                  <SoldOutHelper count={variants.filter((v) => v.stock <= 0).length} disabled={edit.disabled} onApply={edit.onSetSoldOut} />
                )}
                <VariantTable variants={variants} edit={edit} manage={manage} />
              </>
            )
          }
        </SectionBody>
      </div>
    </div>
  )
}
