import { StatCardsSkeleton, STAFF_SECTION } from '../../staff/StaffSkeleton'

const Block = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** The page's placeholder while its code loads: the header, the four cards, then the chart and tables as plain tiles. */
export function ArInsightsPageSkeleton() {
  return (
    <div role="status" aria-label="Loading AR Fitting Insights" className="grid animate-pulse gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Block className="h-9 w-64 max-w-full" />
          <Block className="mt-1 h-4 w-48" />
        </div>
        <Block className="h-11 w-full sm:w-80" />
      </div>
      <StatCardsSkeleton />
      <div className={STAFF_SECTION}>
        <Block className="mb-3 h-7 w-40" />
        <Block className="h-48" />
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <div className={`${STAFF_SECTION} xl:col-span-7`}>
          <Block className="mb-3 h-7 w-40" />
          <Block className="h-96" />
        </div>
        <div className="grid gap-3 xl:col-span-5">
          <div className={STAFF_SECTION}>
            <Block className="mb-3 h-7 w-40" />
            <Block className="h-32" />
          </div>
          <div className={STAFF_SECTION}>
            <Block className="mb-3 h-7 w-40" />
            <Block className="h-32" />
          </div>
        </div>
      </div>
    </div>
  )
}
