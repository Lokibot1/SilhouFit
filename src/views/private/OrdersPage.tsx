import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { BagIcon, BoxIcon, CheckIcon, MapPinIcon, SearchIcon, StoreIcon, WalletIcon, XIcon } from '../../components/form/icons'
import { CancelOrderModal } from '../../components/orders/CancelOrderModal'
import { OrderCard } from '../../components/orders/OrderCard'
import { OrdersBreadcrumb } from '../../components/orders/OrdersBreadcrumb'
import { OrdersListSkeleton } from '../../components/orders/OrdersSkeleton'
import { OrderTabs } from '../../components/orders/OrderTabs'
import { Pagination } from '../../components/shop/Pagination'
import { KRAL_INPUT, KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { SampleDataBadge } from '../../components/ui/SampleDataBadge'
import { useBuyAgain } from '../../hooks/useBuyAgain'
import { useCancelOrder } from '../../hooks/useCancelOrder'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useOrders } from '../../hooks/useOrders'
import { usesSampleOrders } from '../../service/ordersApi'
import { stripControl } from '../../utils/checkoutValidation'
import { filterOrders, parseTab, tabCounts, tabLabel, type OrderTab } from '../../utils/orders'

const DESCRIPTION = 'Your SilhouFit orders in one place: filter them by status, search by order number or product, open one to follow its progress, or cancel an unpaid order.'

const PER_PAGE = 10
const SEARCH_MAX = 60

/** What an empty tab says: what would be here, and what puts an order here. */
const EMPTY_TAB: Partial<Record<OrderTab, { icon: ReactNode; title: string; note: string }>> = {
  'to-pay': { icon: <WalletIcon className="size-14" />, title: 'Nothing to pay', note: 'An order waiting for payment shows here with a Pay now button, so you can finish checking out.' },
  'to-ship': { icon: <BoxIcon className="size-14" />, title: 'Nothing being prepared', note: 'Once you have paid, your order shows here while we pack it for delivery.' },
  'to-receive': { icon: <MapPinIcon className="size-14" />, title: 'Nothing on its way', note: "When a rider picks up your order, it shows here with a live map and the rider's details." },
  completed: { icon: <CheckIcon className="size-14" />, title: 'No delivered orders yet', note: 'Orders you have received show here, and you can buy any of them again.' },
  cancelled: { icon: <XIcon className="size-14" />, title: 'No cancelled orders', note: 'An order you cancel shows here, with the reason you gave.' },
}

const parsePage = (value: string | null) => (/^\d{1,4}$/.test(value ?? '') ? Math.max(1, Number(value)) : 1)

export function OrdersPage() {
  useDocumentTitle('My orders — SilhouFit')
  useMetaDescription(DESCRIPTION)

  const user = useCurrentUser()
  const { pathname, search } = useLocation()
  const [params, setParams] = useSearchParams()
  const { status, orders, retry, refresh } = useOrders(!!user)
  const { busy, buyAgain } = useBuyAgain()
  const cancel = useCancelOrder(() => refresh())
  const heading = useRef<HTMLHeadingElement>(null)
  const [query, setQuery] = useState('')
  const typed = useDebouncedValue(query, 200)

  const tab = parseTab(params.get('tab'))
  const counts = tabCounts(orders)
  const found = filterOrders(orders, tab, typed)
  const pageCount = Math.max(1, Math.ceil(found.length / PER_PAGE))
  const page = Math.min(parsePage(params.get('page')), pageCount)
  const shown = found.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const searching = typed.trim() !== ''

  function go(next: { tab?: OrderTab; page?: number }) {
    const target = new URLSearchParams(params)
    const nextTab = next.tab ?? tab
    if (nextTab === 'all') target.delete('tab')
    else target.set('tab', nextTab)
    if (!next.page || next.page === 1) target.delete('page')
    else target.set('page', String(next.page))
    setParams(target)
  }

  // A new page of orders starts at the top, with the heading read out.
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) {
      moved.current = true
      return
    }
    heading.current?.focus()
  }, [tab, page])

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />

  const sample = usesSampleOrders()
  const failedWithOrders = status === 'error' && orders.length > 0

  return (
    <div className="mx-auto max-w-6xl px-6 pt-18 pb-24 2xl:max-w-[88rem]">
      <OrdersBreadcrumb current="Orders" />
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 ref={heading} tabIndex={-1} className="font-kral-display text-2xl leading-[1.05] font-extrabold text-kral-fg uppercase outline-none sm:text-4xl lg:text-5xl">
          My orders
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          {sample && <SampleDataBadge tone="kral" reason="These orders are placeholders for this test account. Cancelling one only changes this tab." />}
          {status === 'ready' && (
            <p role="status" className="font-kral-mono text-base text-kral-muted tabular-nums md:text-sm">
              {found.length} {found.length === 1 ? 'order' : 'orders'}
              {tab !== 'all' && ` in ${tabLabel(tab)}`}
              {searching && ` matching “${typed.trim()}”`}
            </p>
          )}
        </div>
      </div>

      {status === 'loading' && <OrdersListSkeleton />}

      {status === 'error' && orders.length === 0 && (
        <div role="alert" className="mt-6 border border-kral-rule p-6 sm:p-8">
          <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">Your orders did not load</h2>
          <p className="font-kral-mono mt-3 max-w-xl text-base leading-relaxed text-kral-muted">
            The request for your orders failed, most likely because the connection dropped or the service is briefly unavailable. Your orders are safe. Check your connection, then try again.
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

          {orders.length === 0 ? (
            <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-12 text-center sm:py-16">
              <span aria-hidden="true" className="text-kral-muted">
                <BagIcon className="size-14" />
              </span>
              <h2 className="font-kral-display mt-4 text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">No orders yet</h2>
              <p className="font-kral-mono mt-3 text-base leading-relaxed text-kral-muted">When you place an order it shows up here, so you can follow it and find it again.</p>
              <Link to="/shop" className={`${KRAL_PRIMARY} mt-6 w-full max-w-xs`}>
                <StoreIcon />
                Back to shop
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-6">
                <OrderTabs tab={tab} counts={counts} onChange={(next) => go({ tab: next })} />
              </div>
              <div className="relative mt-4 sm:w-72">
                <label htmlFor="orders-search" className="sr-only">
                  Search orders by order number or product
                </label>
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-kral-muted" />
                <input
                  id="orders-search"
                  type="search"
                  value={query}
                  maxLength={SEARCH_MAX}
                  autoComplete="off"
                  placeholder="Search orders"
                  onChange={(event) => setQuery(stripControl(event.target.value))}
                  className={`${KRAL_INPUT} mt-0 pl-10`}
                />
              </div>

              {found.length === 0 ? (
                <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-12 text-center sm:py-16">
                  <span aria-hidden="true" className="text-kral-muted">
                    {searching ? <SearchIcon className="size-14" /> : (EMPTY_TAB[tab]?.icon ?? <BagIcon className="size-14" />)}
                  </span>
                  <h2 className="font-kral-display mt-4 text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">
                    {searching ? 'No orders match your search' : (EMPTY_TAB[tab]?.title ?? `No orders in ${tabLabel(tab)}`)}
                  </h2>
                  <p className="font-kral-mono mt-3 text-base leading-relaxed text-kral-muted">
                    {searching
                      ? `Nothing${tab === 'all' ? '' : ` in ${tabLabel(tab)}`} has “${typed.trim()}” in its order number or product names. Check the spelling, or clear the search and try again.`
                      : (EMPTY_TAB[tab]?.note ?? 'Nothing here yet.')}
                  </p>
                  {searching ? (
                    <button type="button" onClick={() => setQuery('')} className={`${KRAL_SECONDARY} mt-6 w-full max-w-xs`}>
                      <XIcon size={16} />
                      Clear search
                    </button>
                  ) : (
                    <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
                      <button type="button" onClick={() => go({ tab: 'all' })} className={`${KRAL_SECONDARY} w-full`}>
                        View all orders
                      </button>
                      <Link to="/shop" className={`${KRAL_PRIMARY} w-full`}>
                        <StoreIcon />
                        Continue shopping
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <ul className="mt-6 space-y-4">
                    {shown.map((order) => (
                      <li key={order.id}>
                        <OrderCard order={order} onCancel={cancel.open} onBuyAgain={(target) => void buyAgain(target)} buying={busy === order.id} />
                      </li>
                    ))}
                  </ul>
                  {found.length > PER_PAGE && (
                    <Pagination
                      tone="kral"
                      page={page}
                      pageCount={pageCount}
                      from={(page - 1) * PER_PAGE + 1}
                      to={Math.min(page * PER_PAGE, found.length)}
                      total={found.length}
                      onPage={(next) => go({ page: next })}
                    />
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      <CancelOrderModal
        open={cancel.target !== null}
        orderNumber={cancel.target?.orderNumber ?? ''}
        pending={cancel.pending}
        error={cancel.error}
        onClose={cancel.close}
        onConfirm={(reason) => void cancel.confirm(reason)}
      />
    </div>
  )
}
