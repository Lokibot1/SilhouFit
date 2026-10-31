// Mirrors the loaded checkout form (order, delivery address, payment, note, summary) so the swap does not shift it.
// Heights are measured from the loaded page, which varies a little with the chosen options.
const SECTION = 'glass-card rounded-2xl p-5'
const Block = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** The route fallback: the page's own header (breadcrumb and title) is a placeholder too. */
export function CheckoutRouteFallback() {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-20 pb-24">
      <div className="h-5 w-48 animate-pulse rounded-xl bg-line" />
      <div className="mt-1 h-10 w-44 animate-pulse rounded-xl bg-line-strong" />
      <CheckoutSkeleton />
    </div>
  )
}

export function CheckoutSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading your order"
      className="mt-6 grid animate-pulse gap-6 lg:grid-cols-[1fr_22rem] lg:items-start"
    >
      <div className="min-w-0 space-y-6">
        <div className={SECTION}>
          <Block className="h-7 w-32" />
          <div className="mt-4 flex gap-4">
            <Block className="h-24 w-18 shrink-0 bg-line-strong" />
            <div className="flex-1 space-y-2">
              <Block className="h-4 w-1/2" />
              <Block className="h-5 w-2/3" />
              <Block className="h-5 w-1/2" />
              <Block className="h-7 w-full" />
            </div>
          </div>
        </div>
        <div className={SECTION}>
          <div className="flex items-center justify-between gap-3">
            <Block className="h-7 w-44" />
            <Block className="h-11 w-24 bg-line-strong" />
          </div>
          <div className="mt-3">
            <Block className="my-[3px] h-4 w-1/3" />
            <Block className="my-[3px] h-4 w-1/2" />
            <Block className="my-[3px] h-4 w-4/5" />
          </div>
        </div>
        <div className={SECTION}>
          <Block className="h-5 w-44" />
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Block className="h-[5.25rem] bg-line-strong" />
            <Block className="h-[5.25rem] bg-line-strong" />
          </div>
        </div>
        <div className={SECTION}>
          <Block className="h-7 w-40" />
          <Block className="mt-3 h-24 w-full" />
        </div>
      </div>
      <div className={`${SECTION} space-y-4`}>
        <Block className="h-7 w-40" />
        <Block className="h-10 w-2/3" />
        <Block className="h-28 w-full" />
        <Block className="h-11 w-full bg-line-strong" />
      </div>
    </div>
  )
}
