import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PAGER_FOOTER, PAGER_PAGINATION } from '../../components/staff/inventory/layout'
import { AdminOrderDrawer } from '../../components/staff/orders/AdminOrderDrawer'
import { AdminOrderMetrics } from '../../components/staff/orders/AdminOrderMetrics'
import { AdminOrderCards, AdminOrderTable } from '../../components/staff/orders/AdminOrderTable'
import { AdminOrderToolbar } from '../../components/staff/orders/AdminOrderToolbar'
import { SectionError } from '../../components/staff/StaffSection'
import { STAFF_SECTION } from '../../components/staff/StaffSkeleton'
import { TransactionPagerSkeleton } from '../../components/staff/TransactionsSkeleton'
import { PAGER_ROWS } from '../../components/staff/transactions/layout'
import { Pagination } from '../../components/shop/Pagination'
import { SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useSection } from '../../hooks/useSection'
import { useLivePoll } from '../../hooks/useLivePoll'
import { fetchAdminOrders, quietRead, type AdminOrderRow, type AdminOrdersPage } from '../../service/adminOrdersApi'
import { ORDER_STATUSES, PAYMENT_STATUSES } from '../../service/ordersApi'
import type { RequestOptions } from '../../service/simulateRequest'
import { manilaToday } from '../../utils/period'
import { rangeDates, readTransactionQuery, withTransactionParams } from '../../utils/transactionQuery'

const META_DESCRIPTION =
  'Manage every online order on SilhouFit: filter by status, payment and date, open an order to book a rider, move it along, cancel it or leave a note.'

/** Every online order, newest first, with the actions to fulfil it. */
export function StaffOnlineOrdersPage() {
  useDocumentTitle('Online orders — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const [params, setParams] = useSearchParams()
  // Search, date range, page and page size are the Transactions page's URL; status and payment are this page's own.
  const query = readTransactionQuery(params)
  const { q, range, page, per } = query
  const status = ORDER_STATUSES.find((s) => s === params.get('status')) ?? ''
  const payment = PAYMENT_STATUSES.find((s) => s === params.get('payment')) ?? ''
  const filtered = Boolean(q || range || status || payment)
  const { from, to } = rangeDates(query)

  // Counts up whenever an order changes, so the list and the counts read again (their old rows stay until the new ones arrive).
  const [version, setVersion] = useState(0)

  const load = useCallback(
    (options: RequestOptions): Promise<AdminOrdersPage> =>
      fetchAdminOrders({ page, limit: per, status: status || undefined, paymentStatus: payment || undefined, from, to, search: q || undefined }, options),
    // A new version is a new request, though it is not read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [q, status, payment, from, to, page, per, version],
  )
  const { state, previous, retry, swap } = useSection(load)
  const result = state.status === 'success' ? state.data : previous
  const stale = state.status === 'loading' && result !== undefined
  // The page being shown, read again on its own: the API moves statuses by itself (payment and courier webhooks).
  // A failed poll keeps the rows on screen; nothing is shown for it.
  useLivePoll(
    async (signal) => {
      const data = await quietRead(() => load({ signal }))
      if (data) swap(data)
    },
    { enabled: result !== undefined },
  )

  // Paging with the pager: once the new page renders, keep keyboard focus in the pager and bring the list back into view.
  const sectionRef = useRef<HTMLElement>(null)
  const pagerRef = useRef<HTMLDivElement>(null)
  const paged = useRef(false)
  useEffect(() => {
    if (!paged.current) return
    paged.current = false
    const section = sectionRef.current
    if (section && section.getBoundingClientRect().top < 56) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      section.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    }
    // Next or Prev may have just been disabled, which would drop focus to the page. Move it to the current page (or Prev when that number is hidden on phones).
    const focused = document.activeElement
    if (focused && focused !== document.body && !(focused instanceof HTMLButtonElement && focused.disabled)) return
    const nav = pagerRef.current?.querySelector('nav')
    for (const target of [nav?.querySelector<HTMLElement>('[aria-current="page"]'), nav?.querySelector<HTMLElement>('button:not(:disabled)')]) {
      target?.focus({ preventScroll: true })
      if (document.activeElement === target) break
    }
  }, [page])

  const update = (changes: Parameters<typeof withTransactionParams>[1], replace = false) => setParams((current) => withTransactionParams(current, changes), { replace })

  // The box keeps its own text; the URL gets the term once typing pauses. A URL that changes by itself (back, forward) wins.
  const [text, setText] = useState(q)
  const term = useDebouncedValue(text.trim(), 300)
  const written = useRef(q)
  useEffect(() => {
    if (term === written.current) return
    written.current = term
    update({ q: term }, true)
    // `update` only wraps setParams.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [term])
  useEffect(() => {
    if (q === written.current) return
    written.current = q
    setText(q)
  }, [q])

  function clearFilters() {
    written.current = ''
    setText('')
    update({ q: '', range: '', from: '', to: '', status: '', payment: '' })
  }

  const rows = result?.data ?? null

  // `selected` outlives `open`, so the drawer keeps its title and content while it slides out.
  const [selected, setSelected] = useState<AdminOrderRow | null>(null)
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)
  const openDetail = (order: AdminOrderRow) => {
    setSelected(order)
    setSession((n) => n + 1)
    setOpen(true)
  }

  return (
    <div className="grid gap-3">
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <h1 className="display min-w-0 text-2xl text-fg sm:text-3xl">Online orders</h1>
      </header>

      <AdminOrderMetrics version={version} />

      <section ref={sectionRef} aria-labelledby="orders-list" className={`${STAFF_SECTION} scroll-mt-14`}>
        <h2 id="orders-list" className="sr-only">
          Orders
        </h2>
        <AdminOrderToolbar
          text={text}
          onText={setText}
          query={query}
          status={status}
          payment={payment}
          today={manilaToday().date}
          // A payment pick starts again from the first page, like the other filters.
          onFilter={(changes) => update('payment' in changes ? { ...changes, page: '' } : changes)}
          onPer={(n) => update({ per: String(n) })}
          onClear={clearFilters}
        />
        <p role="status" className="sr-only">
          {state.status === 'loading' ? 'Loading orders' : ''}
        </p>

        {state.status === 'error' && result && (
          <div className="mb-3 rounded-xl border border-line bg-canvas-sub p-3">
            <SectionError what="the latest orders" kind={state.kind} onRetry={retry} />
            <p className="mt-3 text-sm text-fg-muted">The list below is from before your last change.</p>
          </div>
        )}

        {state.status === 'error' && !result ? (
          <SectionError what="the orders" kind={state.kind} onRetry={retry} />
        ) : result && result.data.length === 0 ? (
          <div>
            {result.meta.total > 0 ? (
              <>
                <p className="text-base text-fg-muted">There are no orders on page {page}.</p>
                <button type="button" onClick={() => update({ page: '' })} className={`${SECONDARY_BUTTON} mt-3`}>
                  Go to the first page
                </button>
              </>
            ) : filtered ? (
              <>
                <p className="text-base font-semibold text-fg">No orders match</p>
                <p className="mt-1 text-base text-fg-muted">Check the spelling, or clear the search and filters and try again.</p>
                <button type="button" onClick={clearFilters} className={`${SECONDARY_BUTTON} mt-3`}>
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-fg">No orders yet</p>
                <p className="mt-1 text-base text-fg-muted">Orders show here as soon as customers check out.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <AdminOrderTable rows={rows} skeletonRows={per} stale={stale} activeId={open ? (selected?.id ?? null) : null} onOpen={openDetail} />
            <AdminOrderCards rows={rows} skeletonRows={per} stale={stale} activeId={open ? (selected?.id ?? null) : null} onOpen={openDetail} />
            {result ? (
              <div className={PAGER_FOOTER}>
                <div ref={pagerRef} className={`${PAGER_PAGINATION} ${PAGER_ROWS}`}>
                  <Pagination
                    page={page}
                    pageCount={Math.max(1, result.meta.totalPages)}
                    from={(page - 1) * per + 1}
                    to={Math.min(page * per, result.meta.total)}
                    total={result.meta.total}
                    onPage={(next) => {
                      paged.current = true
                      update({ page: next > 1 ? String(next) : '' })
                    }}
                  />
                </div>
              </div>
            ) : (
              <TransactionPagerSkeleton />
            )}
          </>
        )}
      </section>

      <AdminOrderDrawer order={selected} open={open} session={session} onClose={() => setOpen(false)} onChanged={() => setVersion((n) => n + 1)} />
    </div>
  )
}
