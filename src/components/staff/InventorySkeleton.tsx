import {
  CARD_ROW,
  InventoryColgroup,
  PAGER_CONTROL,
  PAGER_FOOTER,
  PAGER_PAGINATION,
  PAGER_PAGINATION_SKELETON,
  rememberedShowAlerts,
  TABLE_HEAD_ROW,
  TABLE_ROW,
  TD,
  TH,
} from './inventory/layout'
import { STAFF_SECTION } from './StaffSkeleton'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** Body rows with the table's own row height and cell padding, so the data replaces them without a shift. */
export function InventoryTableSkeletonRows({ count, showAlerts }: { count: number; showAlerts: boolean }) {
  return Array.from({ length: count }, (_, n) => (
    <tr key={n} className={`${TABLE_ROW} animate-pulse`}>
      <td className={TD}>
        <div className="flex items-center gap-2.5 @6xl:gap-3">
          <div className="size-10 shrink-0 rounded-xl bg-line" />
          <div className="min-w-0 flex-1">
            <Bar className="h-5 w-2/3" />
            <Bar className="mt-1 h-4 w-1/3" />
          </div>
        </div>
      </td>
      <td className={TD}>
        <Bar className="h-4 w-16" />
      </td>
      <td className={TD}>
        <Bar className="h-6 w-24" />
      </td>
      <td className={TD}>
        <Bar className="h-4 w-16" />
      </td>
      <td className={TD}>
        <Bar className="h-4 w-20" />
      </td>
      <td className={TD}>
        <Bar className="h-4 w-8" />
      </td>
      {showAlerts && (
        <td className={TD}>
          <Bar className="mx-auto h-6 w-24" />
        </td>
      )}
      <td className={TD} />
    </tr>
  ))
}

export function InventoryCardSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <li key={n} className={`${CARD_ROW} flex animate-pulse items-center gap-3`}>
      <div className="size-16 shrink-0 rounded-xl bg-line" />
      <div className="min-w-0 flex-1">
        <Bar className="h-5 w-2/3" />
        <Bar className="mt-1 h-4 w-1/3" />
        <Bar className="mt-3 h-4 w-1/2" />
      </div>
    </li>
  ))
}

/** The pager footer's placeholder: same layout and heights as the real Pagination. */
export function InventoryPagerSkeleton() {
  return (
    <div aria-hidden="true" className={`${PAGER_FOOTER} animate-pulse`}>
      <div className={PAGER_PAGINATION}>
        <div className={PAGER_PAGINATION_SKELETON}>
          <Bar className="h-5 w-40" />
          <Bar className={`${PAGER_CONTROL} w-56`} />
        </div>
      </div>
    </div>
  )
}

/** The route's fallback while the page's code loads: the page header, a card with the toolbar's controls, and the first rows. */
export function InventoryPageSkeleton() {
  const showAlerts = rememberedShowAlerts()
  return (
    <div role="status" aria-label="Loading inventory" className="grid gap-3">
      <div>
        <Bar className="display h-8 w-36 sm:h-9" />
        <Bar className="mt-1 h-4 w-48" />
      </div>
      <div className={STAFF_SECTION}>
        <div className="mb-3 grid gap-3">
          <Bar className="h-11" />
          <Bar className="h-9 pointer-coarse:h-11 @4xl:hidden" />
          <Bar className="h-11" />
        </div>
        <table className="hidden w-full table-fixed border-separate border-spacing-0 animate-pulse @4xl:table">
          <InventoryColgroup showAlerts={showAlerts} />
          <thead>
            <tr className={TABLE_HEAD_ROW}>
              {Array.from({ length: showAlerts ? 7 : 6 }, (_, n) => (
                <th key={n} className={`${TH}`}>
                  {n < (showAlerts ? 6 : 5) && <Bar className="h-4 w-16" />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <InventoryTableSkeletonRows count={10} showAlerts={showAlerts} />
          </tbody>
        </table>
        <ul className="divide-y divide-line border-y border-line @4xl:hidden">
          <InventoryCardSkeletonRows count={10} />
        </ul>
        <InventoryPagerSkeleton />
      </div>
    </div>
  )
}
