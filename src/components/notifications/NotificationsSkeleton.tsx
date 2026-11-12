import { OrdersBreadcrumb } from '../orders/OrdersBreadcrumb'

// Same paddings and row heights as the loaded page, so nothing shifts when it swaps in.
const BLOCK = 'bg-kral-porcelain dark:bg-kral-graphite'

/** The filters and rows while the orders load. */
export function NotificationsListSkeleton() {
  return (
    <div role="status" aria-label="Loading notifications" className="animate-pulse motion-reduce:animate-none">
      <div className="mt-6 flex gap-2">
        <div className={`h-11 w-28 ${BLOCK}`} />
        <div className={`h-11 w-28 ${BLOCK}`} />
      </div>
      <ul className="mt-4 border border-kral-rule">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="flex min-h-18 items-start gap-3 border-b border-kral-rule px-4 py-3 last:border-b-0">
            <span className={`mt-2 size-2 shrink-0 ${BLOCK}`} />
            <span className={`h-20 w-16 shrink-0 ${BLOCK}`} />
            <span className="min-w-0 flex-1">
              <span className="flex h-6 items-center">
                <span className={`h-3 w-1/3 ${BLOCK}`} />
              </span>
              <span className="flex h-6 items-center">
                <span className={`h-3 w-2/3 ${BLOCK}`} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The route fallback: the page header and the list skeleton. */
export function NotificationsSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-18 pb-24 2xl:max-w-[88rem]">
      <OrdersBreadcrumb current="Notifications" />
      <h1 className="font-kral-display mt-1 text-2xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-4xl lg:text-5xl">Notifications</h1>
      <NotificationsListSkeleton />
    </div>
  )
}
