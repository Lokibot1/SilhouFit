// Mirrors the loaded reviews: the summary block, the filter row, then review rows of the same heights.
const BLOCK = 'bg-kral-porcelain dark:bg-kral-graphite'

// A one-line bar sized by the text classes it is given (the non-breaking space gives it the line height).
const Bar = ({ className = '' }: { className?: string }) => <div className={`${BLOCK} ${className}`}>&nbsp;</div>

/** The review rows only, for a filter or page change where the summary and filters stay on screen. */
export function ReviewListSkeleton({ rows = 10, pulse = true }: { rows?: number; pulse?: boolean }) {
  return (
    <ul role="status" aria-label="Loading reviews" className={pulse ? 'animate-pulse' : undefined}>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="border-t border-kral-rule py-6">
          <div className="flex items-center gap-3">
            <div className={`size-8 shrink-0 ${BLOCK}`} />
            <Bar className="font-kral-mono w-32 text-base md:text-sm" />
          </div>
          <Bar className="font-kral-mono mt-3 w-40 text-base md:text-sm" />
          <Bar className="font-kral-mono mt-3 w-full max-w-xl text-base md:text-sm" />
          <Bar className="font-kral-mono mt-1 w-2/3 max-w-md text-base md:text-sm" />
        </li>
      ))}
    </ul>
  )
}

export function ProductReviewsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid gap-6 md:grid-cols-[auto_1fr] md:gap-12">
        <div>
          <Bar className="font-kral-display w-24 text-5xl leading-none" />
          <Bar className="mt-3 w-28 text-xl" />
          <Bar className="font-kral-mono mt-3 w-20 text-base md:text-sm" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-3">
              <Bar className="font-kral-mono text-base md:text-sm" />
              <div className={`h-2 ${BLOCK}`} />
              <Bar className="font-kral-mono text-base md:text-sm" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-8 flex flex-wrap gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`h-11 ${BLOCK} ${i === 5 ? 'w-36' : 'w-20'}`} />
        ))}
      </div>
      <div className="mt-6">
        <ReviewListSkeleton pulse={false} />
      </div>
    </div>
  )
}
