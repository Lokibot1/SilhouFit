import { OrdersBreadcrumb } from './OrdersBreadcrumb'

// Same paddings, text sizes and block sizes as the loaded page, so nothing shifts when it swaps in.
const BLOCK = 'bg-kral-porcelain dark:bg-kral-graphite'
const WIDTH = 'mx-auto max-w-6xl px-6 pt-18 pb-24 2xl:max-w-[88rem]'
const TITLE = 'font-kral-display mt-1 text-2xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-4xl lg:text-5xl'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`${BLOCK} ${className}`}>&nbsp;</div>
}

function CardSkeleton() {
  return (
    <li className="border border-kral-rule p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <Bar className="font-kral-mono w-56 max-w-full text-base" />
          <Bar className="font-kral-mono mt-0.5 w-40 text-base md:text-sm" />
        </div>
        <div className={`h-7 w-40 ${BLOCK}`} />
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="flex shrink-0 gap-2">
          <div className={`h-20 w-16 ${BLOCK}`} />
          <div className={`h-20 w-16 ${BLOCK}`} />
        </div>
        <div className="min-w-0 flex-1">
          <Bar className="font-kral-mono w-2/3 text-base leading-snug" />
          <Bar className="font-kral-mono mt-1 w-1/4 text-base md:text-sm" />
          <Bar className="font-kral-mono mt-2 w-full text-base" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className={`h-11 w-32 ${BLOCK}`} />
        <div className={`h-11 w-32 ${BLOCK}`} />
      </div>
    </li>
  )
}

/** The tabs, search and cards while the orders load. */
export function OrdersListSkeleton() {
  return (
    <div role="status" aria-label="Loading your orders" className="animate-pulse">
      <div className="mt-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`h-11 w-28 shrink-0 ${BLOCK}`} />
        ))}
      </div>
      <div className={`mt-4 h-11 w-full sm:w-72 ${BLOCK}`} />
      <ul className="mt-6 space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </ul>
    </div>
  )
}

/** The route fallback: the page header and the list skeleton. */
export function OrdersSkeleton() {
  return (
    <div className={WIDTH}>
      <OrdersBreadcrumb current="Orders" />
      <h1 className={TITLE}>My orders</h1>
      <OrdersListSkeleton />
    </div>
  )
}

/** An order's page while it loads: the timeline, the items and the summary column. */
export function OrderDetailBodySkeleton() {
  return (
    <div role="status" aria-label="Loading your order" className="mt-6 grid animate-pulse gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        <div className="border border-kral-rule p-5">
          <div className={`h-7 w-40 ${BLOCK}`} />
          <div className="@container">
            <div className="mt-4 space-y-5 @4xl:flex @4xl:space-y-0 @4xl:gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="grid grid-cols-[1rem_1fr] gap-x-3 @4xl:flex-1 @4xl:grid-cols-1 @4xl:gap-y-2">
                  <div className={`size-4 ${BLOCK}`} />
                  <div>
                    <Bar className="font-kral-mono w-28 text-base md:text-sm" />
                    <Bar className="font-kral-mono mt-0.5 w-36 text-base md:text-xs" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="border border-kral-rule p-5">
          <div className={`h-7 w-32 ${BLOCK}`} />
          <ul className="mt-4 space-y-4">
            {Array.from({ length: 2 }, (_, i) => (
              <li key={i} className="flex gap-4">
                <div className={`h-24 w-18 shrink-0 ${BLOCK}`} />
                <div className="min-w-0 flex-1">
                  <Bar className="font-kral-mono w-3/4 text-base" />
                  <Bar className="font-kral-mono mt-1 w-1/2 text-base" />
                  <Bar className="font-kral-mono mt-3 ml-auto w-1/3 text-base" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="space-y-4 border border-kral-rule p-5">
        <div className={`h-7 w-40 ${BLOCK}`} />
        {Array.from({ length: 4 }, (_, i) => (
          <Bar key={i} className="font-kral-mono w-full text-base" />
        ))}
        <div className={`h-11 w-full ${BLOCK}`} />
        <div className={`h-11 w-full ${BLOCK}`} />
      </div>
    </div>
  )
}

/** The route fallback for an order: breadcrumb, a title bar and the body skeleton. */
export function OrderDetailSkeleton() {
  return (
    <div className={WIDTH}>
      <OrdersBreadcrumb current="Order" orders />
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className={`${TITLE} sr-only`}>Your order</h1>
        <div aria-hidden="true" className={`h-8 w-72 max-w-full animate-pulse sm:h-10 ${BLOCK}`} />
        <div aria-hidden="true" className={`h-7 w-40 animate-pulse ${BLOCK}`} />
      </div>
      <OrderDetailBodySkeleton />
    </div>
  )
}
