import { STAFF_SECTION } from '../../staff/StaffSkeleton'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** The rows of the saved-location summary: the loaded <dl> and this placeholder share the row padding and the 24px line. */
export const PICKUP_ROW = 'grid gap-1 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3'

/** The summary's rows and the button under them, so nothing jumps when the saved location arrives. The caller adds role="status". */
export function PickupBodySkeleton() {
  return (
    <div className="animate-pulse">
      <div className="divide-y divide-line border-y border-line">
        {Array.from({ length: 5 }, (_, n) => (
          <div key={n} className={PICKUP_ROW}>
            <Bar className="h-5 w-24" />
            <Bar className="h-6" />
          </div>
        ))}
      </div>
      <Bar className="mt-4 h-11 w-full sm:w-56" />
    </div>
  )
}

/** The route fallback: the title row, then the card with its heading and summary. */
export function PickupLocationPageSkeleton() {
  return (
    <div role="status" aria-label="Loading Pickup location" className="grid animate-pulse gap-3">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <Bar className="h-8 w-56 max-w-full sm:h-9" />
        <Bar className="h-8 w-28" />
      </div>
      <section className={STAFF_SECTION}>
        <Bar className="mb-3 h-7 w-40" />
        <PickupBodySkeleton />
      </section>
    </div>
  )
}
