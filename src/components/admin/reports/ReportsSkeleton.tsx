import { STAFF_SECTION } from '../../staff/StaffSkeleton'

const Block = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** The page's placeholder while its code loads: the header and the two report cards. */
export function ReportsPageSkeleton() {
  return (
    <div role="status" aria-label="Loading Reports" className="grid animate-pulse gap-3">
      <div>
        <Block className="h-9 w-40" />
        <Block className="mt-1 h-4 w-56" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1].map((n) => (
          <div key={n} className={`${STAFF_SECTION} grid gap-4`}>
            <div>
              <Block className="h-7 w-44" />
              <Block className="mt-2 h-4 w-full" />
            </div>
            <Block className="h-11 w-full sm:w-80" />
            <div className="flex gap-2">
              <Block className="h-11 w-40" />
              <Block className="h-11 w-36" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
