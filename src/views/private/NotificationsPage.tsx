import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { BagIcon, StoreIcon } from '../../components/form/icons'
import { NotificationsListSkeleton } from '../../components/notifications/NotificationsSkeleton'
import { OrdersBreadcrumb } from '../../components/orders/OrdersBreadcrumb'
import { KRAL_CHIP, KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useOrders } from '../../hooks/useOrders'
import { buildNotifications, isUnread, loadSeen, markSeen, onSeenChanged, relativeTime, saveSeen, unreadCount, type Notification, type Seen } from '../../utils/notifications'

const DESCRIPTION = 'Every update on your SilhouFit orders in one list: see what is new, filter to the unread ones, mark them all as read, or open an order to follow its progress.'

const PAGE_SIZE = 20
const ROW = 'kral-focus flex min-h-18 w-full items-start gap-3 px-4 py-3 text-kral-fg transition-colors duration-150 ease-out hover:bg-kral-fg/10 focus-visible:bg-kral-fg/10 motion-reduce:transition-none'

export function NotificationsPage() {
  useDocumentTitle('Notifications — SilhouFit')
  useMetaDescription(DESCRIPTION)

  const user = useCurrentUser()
  const { pathname, search } = useLocation()
  const email = user?.email
  const { status, orders, retry } = useOrders(!!user)
  const [seen, setSeen] = useState<Seen>(() => loadSeen(email))
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [shown, setShown] = useState(PAGE_SIZE)
  const entries = useMemo(() => buildNotifications(orders, Infinity), [orders])

  // The bell saves to the same list; follow it.
  useEffect(() => onSeenChanged(() => setSeen(loadSeen(email))), [email])

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />

  const unread = unreadCount(entries, seen)
  const found = filter === 'unread' ? entries.filter((entry) => isUnread(entry, seen)) : entries
  const markRead = (next: Seen) => {
    setSeen(next)
    saveSeen(email, next)
  }
  const failedWithOrders = status === 'error' && orders.length > 0

  return (
    <div className="mx-auto max-w-6xl px-6 pt-18 pb-24 2xl:max-w-[88rem]">
      <OrdersBreadcrumb current="Notifications" />
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="font-kral-display text-2xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-4xl lg:text-5xl">Notifications</h1>
        {status === 'ready' && (
          <p role="status" className="font-kral-mono text-base text-kral-muted tabular-nums md:text-sm">
            {unread} unread
          </p>
        )}
      </div>

      {status === 'loading' && <NotificationsListSkeleton />}

      {status === 'error' && orders.length === 0 && (
        <div role="alert" className="mt-6 border border-kral-rule p-6 sm:p-8">
          <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">Your notifications did not load</h2>
          <p className="font-kral-mono mt-3 max-w-xl text-base leading-relaxed text-kral-muted">
            They come from your orders, and the request for them failed, most likely because the connection dropped or the service is briefly unavailable. Check your connection, then try again.
          </p>
          <button type="button" onClick={retry} className={`${KRAL_PRIMARY} mt-6 w-fit`}>
            Try again
          </button>
        </div>
      )}

      {(status === 'ready' || failedWithOrders) && (
        <>
          {failedWithOrders && (
            <div role="alert" className="font-kral-mono mt-6 flex flex-wrap items-center gap-3 border border-danger px-4 py-3 text-base text-kral-muted md:text-sm">
              <span className="min-w-0 flex-1">We couldn&apos;t refresh your orders, so this list may be out of date. Check your connection, then try again.</span>
              <button type="button" onClick={retry} className={KRAL_SECONDARY}>
                Try again
              </button>
            </div>
          )}

          {entries.length === 0 ? (
            <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-12 text-center sm:py-16">
              <span aria-hidden="true" className="text-kral-muted">
                <BagIcon className="size-14" />
              </span>
              <h2 className="font-kral-display mt-4 text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">No notifications yet</h2>
              <p className="font-kral-mono mt-3 text-base leading-relaxed text-kral-muted">Updates on your orders show up here once you place one.</p>
              <Link to="/shop" className={`${KRAL_PRIMARY} mt-6 w-full max-w-xs`}>
                <StoreIcon />
                Continue shopping
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <div role="group" aria-label="Show notifications" className="flex gap-2">
                  <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={KRAL_CHIP}>
                    All <span className="tabular-nums">{entries.length}</span>
                  </button>
                  <button type="button" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')} className={KRAL_CHIP}>
                    Unread <span className="tabular-nums">{unread}</span>
                  </button>
                </div>
                <button type="button" onClick={() => markRead(markSeen(entries))} disabled={unread === 0} className={KRAL_SECONDARY}>
                  Mark all read
                </button>
              </div>

              {found.length === 0 ? (
                <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-12 text-center sm:py-16">
                  <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">You&apos;re all caught up</h2>
                  <p className="font-kral-mono mt-3 text-base leading-relaxed text-kral-muted">Nothing is unread. New updates on your orders show up here.</p>
                  <button type="button" onClick={() => setFilter('all')} className={`${KRAL_SECONDARY} mt-6 w-full max-w-xs`}>
                    Show all
                  </button>
                </div>
              ) : (
                <>
                  <ul className="mt-4 border border-kral-rule">
                    {found.slice(0, shown).map((entry) => (
                      <li key={entry.id} className="border-b border-kral-rule last:border-b-0">
                        <Row entry={entry} unread={isUnread(entry, seen)} onOpen={() => markRead({ ...seen, [entry.id]: entry.status })} />
                      </li>
                    ))}
                  </ul>
                  <div className="font-kral-mono mt-4 flex flex-wrap items-center justify-between gap-3 text-base text-kral-muted tabular-nums md:text-sm">
                    <p>
                      Showing {Math.min(shown, found.length)} of {found.length}
                    </p>
                    {found.length > shown && (
                      <button type="button" onClick={() => setShown((count) => count + PAGE_SIZE)} className={KRAL_SECONDARY}>
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
  )
}

function Row({ entry, unread, onOpen }: { entry: Notification; unread: boolean; onOpen: () => void }) {
  return (
    <Link to={`/orders/${entry.id}`} onClick={onOpen} className={ROW}>
      {/* A square dot, not colour alone: present only while unread, with the same room kept when read. */}
      <span aria-hidden="true" className={`mt-2 size-2 shrink-0 ${unread ? 'bg-kral-fg' : ''}`} />
      <span className="min-w-0 flex-1">
        {unread && <span className="sr-only">Unread. </span>}
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-kral-mono min-w-0 truncate text-base tabular-nums">{entry.orderNumber}</span>
          <time dateTime={entry.at} className="font-kral-mono shrink-0 text-base text-kral-muted tabular-nums md:text-sm">
            {relativeTime(entry.at)}
          </time>
        </span>
        <span className={`block text-base ${unread ? 'font-semibold' : 'text-kral-muted'}`}>{entry.sentence}</span>
      </span>
    </Link>
  )
}
