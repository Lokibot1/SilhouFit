import { Link, Navigate, useLocation } from 'react-router-dom'
import { BagIcon, StoreIcon } from '../../components/form/icons'
import { RetryButton } from '../../components/notifications/RetryButton'
import { NotificationsListSkeleton } from '../../components/notifications/NotificationsSkeleton'
import { OrdersBreadcrumb } from '../../components/orders/OrdersBreadcrumb'
import { useToast } from '../../components/toast/useToast'
import { KRAL_CHIP, KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useNotifications } from '../../hooks/useNotifications'
import { notificationHref, type ServerNotification } from '../../service/notificationsApi'
import { failureCopy, relativeTime } from '../../utils/notifications'

const DESCRIPTION = 'Every update on your SilhouFit orders in one list: see what is new, filter to the unread ones, mark them all as read, or open an order to follow its progress.'

const ROW = 'kral-focus flex min-h-18 w-full items-start gap-3 px-4 py-3 text-kral-fg transition-colors duration-150 ease-out hover:bg-kral-fg/10 focus-visible:bg-kral-fg/10 motion-reduce:transition-none'

export function NotificationsPage() {
  useDocumentTitle('Notifications — SilhouFit')
  useMetaDescription(DESCRIPTION)

  const user = useCurrentUser()
  const { pathname, search } = useLocation()
  const toast = useToast()
  const { count, items, total, allTotal, hasNextPage, status, error, loadingMore, unreadOnly, setUnreadOnly, markRead, markAllRead, loadMore, refresh, retry } = useNotifications({ enabled: !!user })

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />

  const unread = count ?? 0
  const failedWithItems = status === 'error' && items.length > 0
  const markAll = async () => {
    if (await markAllRead()) toast.show({ kind: 'success', message: 'All notifications marked as read.' })
  }

  return (
    <PullToRefresh onRefresh={refresh}>
    <div className="mx-auto max-w-6xl px-6 pt-18 pb-24 2xl:max-w-[88rem]">
      <OrdersBreadcrumb current="Notifications" />
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="font-kral-display text-2xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-4xl lg:text-5xl">Notifications</h1>
        {status === 'ready' && count !== null && (
          <p role="status" className="font-kral-mono text-base text-kral-muted tabular-nums md:text-sm">
            {unread} unread
          </p>
        )}
      </div>

      {status === 'loading' && <NotificationsListSkeleton />}

      {status === 'error' && items.length === 0 && (
        <div role="alert" className="mt-6 border border-kral-rule p-6 sm:p-8">
          <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">Your notifications did not load</h2>
          <p className="font-kral-mono mt-3 max-w-xl text-base leading-relaxed text-kral-muted">
            {failureCopy(error)}
          </p>
          <RetryButton error={error} onRetry={retry} className={`${KRAL_PRIMARY} mt-6 w-fit`} />
        </div>
      )}

      {(status === 'ready' || failedWithItems) && (
        <>
          {failedWithItems && (
            <div role="alert" className="font-kral-mono mt-6 flex flex-wrap items-center gap-3 border border-danger px-4 py-3 text-base text-kral-muted md:text-sm">
              <span className="min-w-0 flex-1">{failureCopy(error)} This list may be out of date.</span>
              <RetryButton error={error} onRetry={retry} className={KRAL_SECONDARY} />
            </div>
          )}

          {items.length === 0 && !unreadOnly ? (
            <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-12 text-center sm:py-16">
              <span aria-hidden="true" className="text-kral-muted">
                <BagIcon className="size-14" />
              </span>
              <h2 className="font-kral-display mt-4 text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">No notifications yet</h2>
              <p className="font-kral-mono mt-3 text-base leading-relaxed text-kral-muted">Order, payment and delivery updates show here.</p>
              <Link to="/shop" className={`${KRAL_PRIMARY} mt-6 w-full max-w-xs`}>
                <StoreIcon />
                Continue shopping
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <div role="group" aria-label="Show notifications" className="flex gap-2">
                  <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)} className={KRAL_CHIP}>
                    All <span className="tabular-nums">{allTotal}</span>
                  </button>
                  <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)} className={KRAL_CHIP}>
                    Unread <span className="tabular-nums">{unread}</span>
                  </button>
                </div>
                <button type="button" onClick={() => void markAll()} disabled={unread === 0} className={KRAL_SECONDARY}>
                  Mark all read
                </button>
              </div>

              {items.length === 0 ? (
                <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-12 text-center sm:py-16">
                  <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">You&apos;re all caught up</h2>
                  <p className="font-kral-mono mt-3 text-base leading-relaxed text-kral-muted">Nothing is unread. New updates on your orders show up here.</p>
                  <button type="button" onClick={() => setUnreadOnly(false)} className={`${KRAL_SECONDARY} mt-6 w-full max-w-xs`}>
                    Show all
                  </button>
                </div>
              ) : (
                <>
                  <ul className="mt-4 border border-kral-rule">
                    {items.map((entry) => (
                      <li key={entry.id} className="border-b border-kral-rule last:border-b-0">
                        <Row entry={entry} onOpen={() => void markRead(entry.id)} />
                      </li>
                    ))}
                  </ul>
                  <div className="font-kral-mono mt-4 flex flex-wrap items-center justify-between gap-3 text-base text-kral-muted tabular-nums md:text-sm">
                    <p>
                      Showing {items.length} of {total}
                    </p>
                    {hasNextPage && (
                      <button type="button" onClick={loadMore} disabled={loadingMore} className={KRAL_SECONDARY}>
                        Show more
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
    </PullToRefresh>
  )
}

function Row({ entry, onOpen }: { entry: ServerNotification; onOpen: () => void }) {
  const unread = !entry.readAt
  const href = notificationHref(entry)
  const content = (
    <>
      {/* A square dot, not colour alone: present only while unread, with the same room kept when read. */}
      <span aria-hidden="true" className={`mt-2 size-2 shrink-0 ${unread ? 'bg-kral-fg' : ''}`} />
      <span className="min-w-0 flex-1">
        {unread && <span className="sr-only">Unread. </span>}
        <span className="flex items-baseline justify-between gap-3">
          <span className={`min-w-0 text-base ${unread ? 'font-semibold' : 'text-kral-muted'}`}>{entry.title}</span>
          <time dateTime={entry.createdAt} className="font-kral-mono shrink-0 text-base text-kral-muted tabular-nums md:text-sm">
            {relativeTime(entry.createdAt)}
          </time>
        </span>
        {entry.body && <span className="block text-base text-kral-muted">{entry.body}</span>}
      </span>
    </>
  )
  // A notification that names no order has nowhere to go: a plain row.
  return href ? (
    <Link to={href} onClick={onOpen} className={ROW}>
      {content}
    </Link>
  ) : (
    <div className="flex min-h-18 w-full items-start gap-3 px-4 py-3 text-kral-fg">{content}</div>
  )
}
