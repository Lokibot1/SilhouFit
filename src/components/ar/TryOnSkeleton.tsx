// Mirrors the loaded try-on page: same grid, same stage box, same rows in the panel.
import { KRAL_BLOCK } from '../profile/profileKral'
import { ShopHeader } from '../shop/ShopHeader'

export const TRY_ON_BODY = 'mx-auto w-full max-w-6xl px-6 pb-12 2xl:max-w-[88rem]'
export const TRY_ON_GRID = 'flex flex-col gap-6 lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-12'
/** Under the header: about 60% of a phone screen, a full screen column from lg. */
export const STAGE_SIZE = 'h-[min(60svh,32rem)] lg:sticky lg:top-4 lg:h-[calc(100svh-10rem)]'

const Bar = ({ className = '' }: { className?: string }) => <div className={`${KRAL_BLOCK} ${className}`}>&nbsp;</div>

/** A section's own loader: the same rows as its loaded content. */
export function RowsSkeleton({ label, rows, height = 'h-11' }: { label: string; rows: number; height?: string }) {
  return (
    <div role="status" aria-label={label} className="flex animate-pulse flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`${height} ${KRAL_BLOCK}`} />
      ))}
    </div>
  )
}

export function TryOnPanelSkeleton() {
  return (
    <div role="status" aria-label="Loading the try-on" className="flex animate-pulse flex-col gap-6">
      <Bar className="font-kral-mono w-2/3 text-base" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`h-11 w-11 ${KRAL_BLOCK}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className={`h-11 w-24 ${KRAL_BLOCK}`} />
        ))}
      </div>
      <div className={`h-40 ${KRAL_BLOCK}`} />
    </div>
  )
}

/** The route fallback (header included), so the swap to the loaded page does not shift the layout. */
export function TryOnSkeleton() {
  return (
    <>
      <ShopHeader tone="kral" title="AR try-on" crumb="AR try-on" compact />
      <div className={TRY_ON_BODY}>
        <div className={TRY_ON_GRID}>
          <div aria-hidden="true" className={`animate-pulse ${KRAL_BLOCK} ${STAGE_SIZE}`} />
          <TryOnPanelSkeleton />
        </div>
      </div>
    </>
  )
}
