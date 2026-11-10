import { STAFF_SECTION } from './StaffSkeleton'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** Table cells and cards share these paddings with the loaded list (components/staff/measurements/MeasurementsList), so nothing shifts. */
export const MEASURE_TH = 'px-3 py-2 text-sm font-semibold text-fg-muted'
export const MEASURE_TD = 'px-3 py-2 align-middle'
export const MEASURE_CARD = 'rounded-xl border border-line bg-canvas p-3'

/** `count` is how many rows the list will have, so the skeleton is as tall as what replaces it. */
export function MeasurementsRowsSkeleton({ columns, count = 5 }: { columns: number; count?: number }) {
  return (
    <div role="status" aria-label="Loading sizes" className="animate-pulse">
      <table className="hidden w-full md:table">
        <thead>
          <tr className="border-b border-line">
            <th className={MEASURE_TH}>
              <Bar className="h-5 w-12" />
            </th>
            {Array.from({ length: columns }, (_, n) => (
              <th key={n} className={`${MEASURE_TH} pr-8`}>
                <Bar className="mx-auto h-5 w-20" />
              </th>
            ))}
            <th className={MEASURE_TH} />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {Array.from({ length: count }, (_, n) => (
            <tr key={n}>
              <td className={MEASURE_TD}>
                <Bar className="h-5 w-12" />
              </td>
              {Array.from({ length: columns }, (_, m) => (
                <td key={m} className={`${MEASURE_TD} pr-8`}>
                  <Bar className="mx-auto h-5 w-10" />
                </td>
              ))}
              <td className={MEASURE_TD}>
                <Bar className="ml-auto h-11 w-40" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="grid gap-3 md:hidden">
        {Array.from({ length: count }, (_, n) => (
          <li key={n} className={MEASURE_CARD}>
            <div className="flex items-center justify-between gap-3">
              <Bar className="h-6 w-14" />
              <Bar className="h-11 w-40" />
            </div>
            <div className="mt-3 grid gap-1">
              {Array.from({ length: columns }, (_, m) => (
                <Bar key={m} className="h-5 w-full" />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The route's fallback while the page's code loads: the header and a list shaped like the default category's. */
export function MeasurementsPageSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true">
      <div>
        <div className="h-9 w-64 max-w-full rounded-xl bg-line" />
        <div className="mt-1 h-4 w-72 max-w-full rounded-xl bg-line" />
      </div>
      <section className={STAFF_SECTION}>
        <MeasurementsRowsSkeleton columns={5} />
      </section>
    </div>
  )
}
