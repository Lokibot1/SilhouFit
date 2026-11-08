import { Fragment } from 'react'
import { useProductSizing } from '../../service/customSizings'
import { useSizeGuide } from '../../hooks/useSizeGuide'
import type { MeasurementKey, ProductVariant } from '../../service/fetchProductList'
import { MEASUREMENT_FIELDS } from '../../utils/productValidation'
import { norm, type SizeGuideRow } from '../../utils/sizeGuide'
import { COLUMNS_BY_CATEGORY } from '../../utils/sizeMeasurementValidation'
import { Modal } from '../ui/Modal'
import { KRAL_SECONDARY } from './shopControls'

const LABEL = Object.fromEntries(MEASUREMENT_FIELDS.map(({ key, label }) => [key, label]))
const TH = 'font-kral-mono px-3 py-2 text-base font-medium text-kral-muted uppercase md:text-xs md:tracking-[0.08em]'
const TD = 'font-kral-mono px-3 py-2 align-middle'
const SELECTED = 'bg-kral-porcelain dark:bg-kral-graphite'

interface SizeGuideModalProps {
  open: boolean
  onClose: () => void
  category: string
  variants: ProductVariant[]
  /** The size picked on the page; its row is highlighted. */
  selected: string
  /** The product's id, to find the custom sizing it uses. */
  productId?: string
}

const Bar = ({ className }: { className: string }) => <div className={`bg-kral-porcelain dark:bg-kral-graphite ${className}`} />

/** The loaded guide's shape (intro, then the table from md up or the cards below) with one row per real size, so nothing jumps when it arrives. */
function SizeGuideSkeleton({ rows, columns }: { rows: number; columns: number }) {
  const cells = Array.from({ length: columns }, (_, n) => n)
  return (
    <div role="status" aria-label="Loading size guide" className="animate-pulse">
      {rows > 0 && (
        <>
          <Bar className="mb-3 h-6 w-3/4" />
          <table className="hidden w-full md:table">
            <thead>
              <tr className="border-b border-kral-rule">
                <th scope="col" className={TH}>
                  <Bar className="h-5 w-10" />
                </th>
                {cells.map((n) => (
                  <th key={n} scope="col" className={TH}>
                    <Bar className="ml-auto h-5 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-kral-rule">
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  <td className={TD}>
                    <Bar className="h-11 w-24" />
                  </td>
                  {cells.map((n) => (
                    <td key={n} className={TD}>
                      <Bar className="ml-auto h-6 w-8" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="space-y-2 md:hidden">
            {Array.from({ length: rows }, (_, r) => (
              <li key={r} className="border border-kral-rule p-3">
                <Bar className="h-11 w-24" />
                <div className="mt-2 grid gap-1">
                  {cells.map((n) => (
                    <Bar key={n} className="h-6 w-full" />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Garment measurements per size: this piece's own where it has them, the category's standard ones otherwise. */
export function SizeGuideModal({ open, onClose, category, variants, selected, productId }: SizeGuideModalProps) {
  const customSizing = useProductSizing(productId)
  const { loading, guide, available, failed, retry } = useSizeGuide(category, variants, open, customSizing)
  const { columns, rows } = guide
  const sourceLabel = (row: SizeGuideRow) => (row.source === 'product' ? 'This piece' : row.source === 'base' ? `Standard for ${category}` : '')
  const isSelected = (row: SizeGuideRow) => !!selected && row.size.toLowerCase() === selected.toLowerCase()
  const cell = (row: SizeGuideRow, key: MeasurementKey) => {
    const value = row.values[key]
    return value === null ? (
      <>
        <span aria-hidden="true">–</span>
        <span className="sr-only">Not measured</span>
      </>
    ) : (
      value
    )
  }
  const failure = failed && (
    <div role="alert" className="py-3">
      <p className="font-kral-display text-base leading-[1.05] font-extrabold text-kral-fg uppercase">We couldn&apos;t load the standard {category} measurements.</p>
      <p className="font-kral-mono mt-1 text-base text-kral-muted">Something went wrong on our side or the connection dropped. Try again in a moment.</p>
      <button type="button" onClick={retry} className={`${KRAL_SECONDARY} mt-3`}>
        Retry
      </button>
    </div>
  )
  const sizeHeading = (row: SizeGuideRow) => (
    <>
      <span className="text-base font-medium text-kral-fg">{row.size}</span>
      {isSelected(row) && <span className="ml-2 text-base font-normal text-kral-muted md:text-sm">(Selected)</span>}
      {row.source !== 'none' && <span className="block text-base font-normal text-kral-muted md:text-sm">{sourceLabel(row)}</span>}
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title="Size guide" tone="kral">
      <div className="pb-5">
        {loading ? (
          <SizeGuideSkeleton rows={new Set(variants.flatMap((v) => (v.size ? [norm(v.size)] : []))).size} columns={COLUMNS_BY_CATEGORY[category]?.length ?? 4} />
        ) : failed && !available ? (
          failure
        ) : !available ? (
          <p role="status" className="font-kral-mono py-6 text-base text-kral-muted">
            Size guide isn't available for this piece yet. Check the description for sizing notes, or message the team.
          </p>
        ) : (
          <>
            {failure}
            <p className="font-kral-mono mb-3 text-base text-kral-muted">Garment measurements in cm, taken flat across the garment.</p>
            <table className="hidden w-full md:table">
              <caption className="sr-only">{category} sizes, garment measurements in centimetres</caption>
              <thead>
                <tr className="border-b border-kral-rule">
                  <th scope="col" className={`${TH} text-left`}>
                    Size
                  </th>
                  {columns.map((key) => (
                    <th key={key} scope="col" className={`${TH} text-right`}>
                      {LABEL[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-kral-rule">
                {rows.map((row) => (
                  <tr key={row.size} aria-current={isSelected(row) || undefined} className={isSelected(row) ? SELECTED : undefined}>
                    <th scope="row" className={`${TD} text-left`}>
                      {sizeHeading(row)}
                    </th>
                    {row.source === 'none' ? (
                      <td colSpan={columns.length} className={`${TD} text-right text-base text-kral-muted`}>
                        Not available
                      </td>
                    ) : (
                      columns.map((key) => (
                        <td key={key} className={`${TD} text-right text-base tabular-nums text-kral-fg`}>
                          {cell(row, key)}
                        </td>
                      ))
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="space-y-2 md:hidden">
              {rows.map((row) => (
                <li key={row.size} aria-current={isSelected(row) || undefined} className={`border border-kral-rule p-3 ${isSelected(row) ? SELECTED : ''}`}>
                  <p>{sizeHeading(row)}</p>
                  {row.source === 'none' ? (
                    <p className="font-kral-mono mt-1 text-base text-kral-muted">Not available</p>
                  ) : (
                    <dl className="font-kral-mono mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-base">
                      {columns.map((key) => (
                        <Fragment key={key}>
                          <dt className="text-kral-muted">{LABEL[key]}</dt>
                          <dd className="text-right tabular-nums text-kral-fg">{cell(row, key)}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  )}
                </li>
              ))}
            </ul>
            {rows.some((row) => row.source === 'product') && (
              <p className="font-kral-mono mt-3 text-base text-kral-muted md:text-sm">Rows marked &ldquo;This piece&rdquo; use this product&apos;s own measurements.</p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
