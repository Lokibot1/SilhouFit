// Mirrors the loaded checkout form (order, delivery address, payment, note, summary) so the swap does not shift it.
// Heights are measured from the loaded page, which varies a little with the chosen options.
// KRAL blocks are flat and square: Porcelain on Paper, Graphite on Obsidian.
const SECTION = 'border border-kral-rule p-5'
const Block = ({ className }: { className: string }) => <div className={`bg-kral-porcelain dark:bg-kral-graphite ${className}`} />

/** The route fallback: the page's own header (breadcrumb and title) is a placeholder too. */
export function CheckoutRouteFallback() {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-18 pb-24 2xl:max-w-[88rem]">
      <div className="lg:pt-2 lg:pb-[25px]">
        <div className="h-6 w-48 animate-pulse bg-kral-porcelain md:h-4 dark:bg-kral-graphite" />
        <div className="mt-1 h-[25px] w-44 animate-pulse bg-kral-porcelain sm:h-[38px] lg:h-[50px] dark:bg-kral-graphite" />
      </div>
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
            <Block className="h-24 w-18 shrink-0" />
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
            <Block className="h-11 w-24" />
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
            <Block className="h-[5.25rem]" />
            <Block className="h-[5.25rem]" />
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
        <Block className="h-11 w-full" />
      </div>
    </div>
  )
}
