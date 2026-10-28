import { CARD_ROW, TABLE_ROW, TD } from '../../staff/inventory/layout'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** Table rows the height of the loaded rows; `cells` is how many columns the table has. */
export function AccountTableSkeletonRows({ count, cells }: { count: number; cells: number }) {
  return Array.from({ length: count }, (_, n) => (
    <tr key={n} className={`${TABLE_ROW} animate-pulse`}>
      {Array.from({ length: cells }, (_, c) => (
        <td key={c} className={TD}>
          <Bar className={`h-5 ${c === 0 ? 'w-2/3' : 'w-3/4'}`} />
        </td>
      ))}
    </tr>
  ))
}

export function AccountCardSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <li key={n} className={`${CARD_ROW} flex animate-pulse flex-col justify-center gap-2`}>
      <Bar className="h-6 w-2/3" />
      <Bar className="h-5 w-1/2" />
    </li>
  ))
}

/** The route fallback for User Management: title, tabs, then a panel of rows. */
export function AccountsPageSkeleton() {
  return (
    <div role="status" aria-label="Loading user management" className="grid gap-3">
      <Bar className="h-8 w-56 animate-pulse sm:h-9" />
      <Bar className="h-12 w-72 max-w-full animate-pulse" />
      <section className={STAFF_SECTION}>
        <Bar className="mb-3 h-11 w-full animate-pulse" />
        <ul className="divide-y divide-line border-y border-line">
          <AccountCardSkeletonRows count={6} />
        </ul>
      </section>
    </div>
  )
}
