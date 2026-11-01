import type { CustomSizing } from '../../../service/customSizings'
import { sizingColumns } from '../../../utils/customSizing'
import { compareSizes } from '../../../utils/sizeMeasurementValidation'
import { ArchiveIcon, PencilIcon, RestoreIcon } from '../../form/icons'
import { MEASURE_CARD, MEASURE_TD, MEASURE_TH } from '../MeasurementsSkeleton'
import { RowIconButton } from './RowIconButton'

interface CustomSizingListProps {
  category: string
  sizings: CustomSizing[]
  onEdit: (sizing: CustomSizing) => void
  onArchive: (sizing: CustomSizing) => void
  onRestore: (sizing: CustomSizing) => void
}

/** A category's custom sizings: each a named table from md up, cards below, with Edit and Archive (Restore on the archived tab). */
export function CustomSizingList({ category, sizings, onEdit, onArchive, onRestore }: CustomSizingListProps) {
  const columns = sizingColumns(category)
  const value = (sizing: CustomSizing['sizes'][number], key: (typeof columns)[number]['key']) => sizing.measurements[key] ?? <span aria-label="Not set">—</span>

  return (
    <ul className="grid gap-5">
      {sizings.map((sizing) => {
        const sizes = [...sizing.sizes].sort((a, b) => compareSizes(a.size, b.size))
        return (
          <li key={sizing.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-fg">
                {sizing.name} <span className="text-sm font-normal text-fg-muted">· {sizes.length === 1 ? '1 size' : `${sizes.length} sizes`}</span>
              </h3>
              <div className="flex gap-2">
                {sizing.isActive === false ? (
                  <RowIconButton label={`Restore ${sizing.name}`} icon={<RestoreIcon />} onClick={() => onRestore(sizing)} />
                ) : (
                  <>
                    <RowIconButton label={`Edit ${sizing.name}`} icon={<PencilIcon />} onClick={() => onEdit(sizing)} />
                    <RowIconButton label={`Archive ${sizing.name}`} icon={<ArchiveIcon />} onClick={() => onArchive(sizing)} />
                  </>
                )}
              </div>
            </div>
            <table className="mt-2 hidden w-full md:table">
              <caption className="sr-only">{sizing.name} sizes, measurements in centimetres</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={`${MEASURE_TH} text-left`}>
                    Size
                  </th>
                  {columns.map(({ key, label }) => (
                    <th key={key} scope="col" className={`${MEASURE_TH} text-right`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sizes.map((row) => (
                  <tr key={row.size} className="hover:bg-line/40">
                    <th scope="row" className={`${MEASURE_TD} text-left text-base font-semibold text-fg`}>
                      {row.size}
                    </th>
                    {columns.map(({ key }) => (
                      <td key={key} className={`${MEASURE_TD} text-right text-base tabular-nums text-fg`}>
                        {value(row, key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-2 grid gap-3 md:hidden">
              {sizes.map((row) => (
                <li key={row.size} className={MEASURE_CARD}>
                  <p className="text-base font-semibold text-fg">{row.size}</p>
                  <dl className="mt-3 grid gap-1">
                    {columns.map(({ key, label }) => (
                      <div key={key} className="flex justify-between gap-3 text-sm">
                        <dt className="text-fg-muted">{label} (cm)</dt>
                        <dd className="text-right tabular-nums text-fg">{value(row, key)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}
