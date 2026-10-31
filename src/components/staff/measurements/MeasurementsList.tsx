import type { MeasurementKey } from '../../../service/fetchProductList'
import type { SizeMeasurement } from '../../../service/sizeMeasurements'
import { MEASUREMENT_FIELDS } from '../../../utils/productValidation'
import { COLUMNS_BY_CATEGORY } from '../../../utils/sizeMeasurementValidation'
import { SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { MEASURE_CARD, MEASURE_TD, MEASURE_TH, MeasurementsRowsSkeleton } from '../MeasurementsSkeleton'

// 44px touch targets at every width.
const ROW_BUTTON = `${SECONDARY_BUTTON_SM} min-h-11! min-w-11!`
const LABEL = Object.fromEntries(MEASUREMENT_FIELDS.map(({ key, label }) => [key, label]))

interface MeasurementsListProps {
  category: string
  /** Null while loading. */
  rows: SizeMeasurement[] | null
  /** How many rows the skeleton draws while loading. */
  skeletonRows: number
  /** The row being changed; its buttons wait. */
  busyId: string | null
  onEdit: (row: SizeMeasurement) => void
  onArchive: (row: SizeMeasurement) => void
  onRestore: (row: SizeMeasurement) => void
}

/** The sizes of one category: a table from md up, cards below. Only the measurements that matter for the category are shown; Edit shows all nine. */
export function MeasurementsList({ category, rows, skeletonRows, busyId, onEdit, onArchive, onRestore }: MeasurementsListProps) {
  const keys = COLUMNS_BY_CATEGORY[category] ?? []
  if (!rows) return <MeasurementsRowsSkeleton columns={keys.length} count={skeletonRows} />

  const actions = (row: SizeMeasurement) => {
    const busy = busyId === row.id
    const name = `${row.category} ${row.size}`
    return (
      <div className="flex justify-end gap-2">
        {row.isActive ? (
          <>
            <button type="button" data-row-action={row.id} disabled={busy} aria-label={`Edit ${name}`} onClick={() => onEdit(row)} className={ROW_BUTTON}>
              Edit
            </button>
            <button type="button" disabled={busy} aria-label={`Archive ${name}`} onClick={() => onArchive(row)} className={ROW_BUTTON}>
              Archive
            </button>
          </>
        ) : (
          <button type="button" data-row-action={row.id} disabled={busy} aria-label={`Restore ${name}`} onClick={() => onRestore(row)} className={ROW_BUTTON}>
            {busy ? 'Restoring…' : 'Restore'}
          </button>
        )}
      </div>
    )
  }
  const value = (row: SizeMeasurement, key: MeasurementKey) => (row[key] === null ? <span aria-label="Not set">—</span> : row[key])

  return (
    <>
      <table className="hidden w-full md:table">
        <caption className="sr-only">{category} sizes, measurements in centimetres</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={`${MEASURE_TH} text-left`}>
              Size
            </th>
            {keys.map((key) => (
              <th key={key} scope="col" className={`${MEASURE_TH} text-right`}>
                {LABEL[key]}
              </th>
            ))}
            <th scope="col" className={MEASURE_TH}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-line/40">
              <th scope="row" className={`${MEASURE_TD} text-left text-base font-semibold text-fg`}>
                {row.size}
              </th>
              {keys.map((key) => (
                <td key={key} className={`${MEASURE_TD} text-right text-base tabular-nums text-fg`}>
                  {value(row, key)}
                </td>
              ))}
              <td className={MEASURE_TD}>{actions(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className={MEASURE_CARD}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-base font-semibold text-fg">{row.size}</p>
              {actions(row)}
            </div>
            <dl className="mt-3 grid gap-1">
              {keys.map((key) => (
                <div key={key} className="flex justify-between gap-3 text-sm">
                  <dt className="text-fg-muted">{LABEL[key]} (cm)</dt>
                  <dd className="text-right tabular-nums text-fg">{value(row, key)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}
