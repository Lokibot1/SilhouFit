import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useCanView } from '../../../hooks/usePermissions'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { useSection } from '../../../hooks/useSection'
import { DURATION, EASE_OUT } from '../../../motion/tokens'
import { BagIcon, ChevronDownIcon } from '../../form/icons'
import { fetchAdminOrder } from '../../../service/adminOrdersApi'
import { fetchAdminTransaction, orderToTransactionDetail, redactPayload, type AdminTransactionDetail, type AdminTransactionRow } from '../../../service/adminTransactionsApi'
import type { TransactionDetail, TransactionLine } from '../../../service/fetchTransactions'
import { usesSampleOrders } from '../../../service/ordersApi'
import { sampleAdminTransaction, sampleTransactionDetail } from '../../../service/sampleTransactions'
import type { RequestOptions } from '../../../service/simulateRequest'
import { formatPeso } from '../../../utils/format'
import { methodLabel } from '../../../utils/orders'
import { providerLabel } from '../../../utils/transactionQuery'
import { SECONDARY_BUTTON, SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { CopyId } from '../inventory/ProductDetail'
import { OrderStatusPill, PaymentPill } from '../orders/OrderPills'
import { EmptyNote, SectionBody } from '../StaffSection'
import { InvoicePreview } from './InvoicePreview'
import { PlacedAt } from './TransactionParts'

/** Stands in for a request while no payment is selected, or for the items before there is an order. It never answers. */
const IDLE = new Promise<never>(() => {})

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

const LINE_ROW = 'h-[4.5rem]'
const TH = 'sticky top-0 z-10 h-11 border-b border-line bg-canvas-sub px-3 text-left font-semibold text-fg'

/** The payment's own facts, taken from the list row so they show before the detail arrives. */
function Header({ transaction }: { transaction: AdminTransactionRow }) {
  return (
    <div>
      <p className="text-base font-semibold text-fg">{transaction.customerName}</p>
      <p className="text-base text-fg-muted md:text-sm">
        <PlacedAt iso={transaction.at} />
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="font-mono text-2xl font-semibold text-fg tabular-nums">{formatPeso(transaction.amount)}</p>
        <PaymentPill status={transaction.status} />
      </div>
    </div>
  )
}

function Field({ label, number, children }: { label: string; number?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 font-medium text-fg-muted">{label}</dt>
      <dd className={`min-w-0 flex-1 text-fg ${number ? 'text-right tabular-nums' : ''}`}>{children}</dd>
    </div>
  )
}

/** A figure the gateway has not reported yet. */
const Figure = ({ value }: { value: number | null }) => (value === null ? <span className="text-fg-muted">Not reported</span> : formatPeso(value))

/** Same blocks as the loaded detail, at about the same heights, so nothing jumps when it arrives. */
function PaymentSkeleton() {
  return (
    <div role="status" aria-label="Loading payment details" className="grid animate-pulse gap-6">
      <Bar className="h-72 w-full" />
      <Bar className="h-40 w-full" />
      <Bar className="h-11 w-full" />
    </div>
  )
}

/** The payment is gone from the server (a 404): worth saying so, not a vague failure. */
function Gone({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert">
      <p className="text-base font-semibold text-fg md:text-sm">This transaction no longer exists.</p>
      <p className="mt-1 text-base text-fg-muted md:text-sm">It may have been removed. Close this panel and refresh the list, or try again.</p>
      <button type="button" onClick={onRetry} className={`${SECONDARY_BUTTON} mt-4`}>
        Retry
      </button>
    </div>
  )
}

/** The gateway's own record. Collapsed, shown as plain text (never markup), with secret-looking values hidden. */
function Payload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <details className="group rounded-xl border border-line">
      <summary className="font-ui flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-base font-semibold text-fg md:text-sm [&::-webkit-details-marker]:hidden">
        Gateway payload (JSON)
        <ChevronDownIcon className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line p-3">
        {Object.keys(payload).length === 0 ? (
          <EmptyNote>No payload recorded</EmptyNote>
        ) : (
          <pre className="max-h-80 overflow-auto font-mono text-xs break-all whitespace-pre-wrap text-fg">{JSON.stringify(redactPayload(payload), null, 2)}</pre>
        )}
      </div>
    </details>
  )
}

/** What the payment is and which order it paid for, once the detail has arrived. */
function PaymentDetail({ detail }: { detail: AdminTransactionDetail }) {
  const area = useLocation().pathname.split('/')[1]
  const canView = useCanView(useCurrentUser()?.role ?? 'staff')
  return (
    <div className="grid gap-6">
      <section>
        <h3 className="mb-2 text-base font-semibold text-fg md:text-sm">Payment</h3>
        <dl className="grid gap-3 text-base md:text-sm">
          <Field label="Provider">{providerLabel(detail.provider)}</Field>
          <Field label="Method">{methodLabel(detail.method)}</Field>
          <Field label="Reference">
            <span className="flex items-center justify-between gap-2">
              <span className="min-w-0 font-mono break-all">{detail.reference}</span>
              <CopyId id={detail.reference} what="payment reference" />
            </span>
          </Field>
          <Field label="Amount" number>
            {formatPeso(detail.amount)}
          </Field>
          <Field label="Fee" number>
            <Figure value={detail.fee} />
          </Field>
          <Field label="Net" number>
            <Figure value={detail.net} />
          </Field>
          <Field label="Created">
            <PlacedAt iso={detail.at} />
          </Field>
          <Field label="Updated">
            <PlacedAt iso={detail.updatedAt} />
          </Field>
        </dl>
      </section>
      <section>
        <h3 className="mb-2 text-base font-semibold text-fg md:text-sm">Order</h3>
        <dl className="grid gap-3 text-base md:text-sm">
          <Field label="Order">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold">{detail.orderNumber}</span>
              <OrderStatusPill status={detail.orderStatus} />
            </span>
          </Field>
          <Field label="Order total" number>
            {formatPeso(detail.orderTotal)}
          </Field>
          <Field label="Email">{detail.customerEmail ? <span className="break-all">{detail.customerEmail}</span> : <span className="text-fg-muted">No email on record</span>}</Field>
        </dl>
        {canView('online-orders') && (
          <Link
            to={`/${area}/online-orders?q=${encodeURIComponent(detail.orderNumber)}`}
            className="mt-2 inline-flex min-h-11 items-center text-base font-semibold underline decoration-chrome-strong decoration-2 underline-offset-2 hover:text-chrome-strong md:text-sm"
          >
            Open in Online orders
          </Link>
        )}
      </section>
      <Payload payload={detail.payload} />
    </div>
  )
}

function LinesSkeleton() {
  return (
    <div role="status" aria-label="Loading items" className="animate-pulse">
      <div className="h-11 border-b border-line" />
      {[0, 1, 2].map((n) => (
        <div key={n} className={`${LINE_ROW} flex items-center justify-between gap-3 border-b border-line`}>
          <Bar className="size-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <Bar className="h-5 w-2/3" />
            <Bar className="mt-1 h-4 w-1/3" />
          </div>
          <Bar className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

/** The product's photo, or a plain tile where there is none or it fails to load. */
function LineThumb({ line }: { line: TransactionLine }) {
  const [failed, setFailed] = useState(false)
  return line.imageUrl && !failed ? (
    <img src={line.imageUrl} alt={line.name} loading="lazy" onError={() => setFailed(true)} className="size-12 shrink-0 rounded-xl bg-line object-cover" />
  ) : (
    <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-line text-fg-muted">
      <BagIcon size={20} />
    </span>
  )
}

function Lines({ detail }: { detail: TransactionDetail }) {
  return (
    <>
      <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
        <caption className="sr-only">Items in this order with category, units, unit price and line total</caption>
        <colgroup>
          <col />
          <col className="w-28" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Item
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {detail.lines.map((line, index) => (
            <tr key={`${line.productId}-${index}`} className={LINE_ROW}>
              <td className="border-b border-line px-3 py-2">
                <div className="flex items-center gap-3">
                  <LineThumb line={line} />
                  <div className="min-w-0">
                    <span className="block font-semibold text-fg">{line.name}</span>
                    <span className="flex flex-wrap gap-x-3 text-fg-muted">
                      <span>{line.category}</span>
                      <span className="whitespace-nowrap tabular-nums">
                        {line.units} × {formatPeso(line.unitPrice)}
                      </span>
                    </span>
                  </div>
                </div>
              </td>
              <td className="border-b border-line px-3 text-right whitespace-nowrap text-fg tabular-nums">{formatPeso(line.units * line.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3 text-xs">
        <dt className="text-fg-muted">Subtotal</dt>
        <dd className="text-right text-fg tabular-nums">{formatPeso(detail.subtotal)}</dd>
        <dt className="font-semibold text-fg">Total</dt>
        <dd className="text-right font-semibold text-fg tabular-nums">{formatPeso(detail.total)}</dd>
      </dl>
    </>
  )
}

interface TransactionDrawerProps {
  /** The payment to show; it stays set while the drawer slides out. */
  transaction: AdminTransactionRow | null
  open: boolean
  /** Counts up on every open, so the detail loads again. */
  session: number
  onClose: () => void
}

/** A read-only drawer: the payment's header at once, then its detail from the API. */
export function TransactionDrawer({ transaction, open, session, onClose }: TransactionDrawerProps) {
  const sample = usesSampleOrders()
  const id = transaction?.id
  const fetcher = useCallback(
    (options: RequestOptions) => (id ? (sample ? sampleAdminTransaction : fetchAdminTransaction)(id, options) : IDLE),
    // A new session is a new request, though it is not read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [id, session, sample],
  )
  const section = useSection(fetcher)

  // The order's items and its Invoice: a simulated account's sample order, or a real one built from GET /admin/orders/:id.
  const orderId = transaction?.orderId
  const method = transaction?.method ?? ''
  const itemsFetcher = useCallback(
    (options: RequestOptions) => (orderId ? (sample ? sampleTransactionDetail(orderId, options) : fetchAdminOrder(orderId, options).then((order) => orderToTransactionDetail(order, method))) : IDLE),
    // A new session is a new request, though it is not read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [orderId, method, session, sample],
  )
  const items = useSection(itemsFetcher)
  const itemsDetail = items.state.status === 'success' ? items.state.data : null

  // The invoice preview takes the drawer's place (no second modal). It is remembered with the session it was opened in, so each open starts on the payment.
  const [invoiceSession, setInvoiceSession] = useState<number | null>(null)
  const showInvoice = invoiceSession === session
  const invoiceButton = useRef<HTMLButtonElement>(null)
  const wasInvoice = useRef(false)
  const refocus = useRef(false)
  useEffect(() => {
    if (wasInvoice.current && !showInvoice) refocus.current = true
    wasInvoice.current = showInvoice
  }, [showInvoice])
  // The two views cross-fade with a short slide: the invoice arrives from the right, the payment from the left.
  const reduced = useReducedMotion() ?? false
  const slide = (from: number) => ({
    initial: { opacity: 0, x: reduced ? 0 : from },
    animate: { opacity: 1, x: 0, transition: { duration: DURATION.state, ease: EASE_OUT } },
    exit: { opacity: 0, x: reduced ? 0 : -from, transition: { duration: DURATION.feedback } },
  })

  return (
    <Modal variant="sheet" open={open} onClose={onClose} title={transaction && showInvoice ? `Invoice ${transaction.orderNumber}` : (transaction?.orderNumber ?? '')}>
      <AnimatePresence mode="wait" initial={false}>
        {open && transaction && showInvoice && itemsDetail ? (
          <motion.div key="invoice" {...slide(24)}>
            <InvoicePreview transaction={itemsDetail} detail={itemsDetail} onBack={() => setInvoiceSession(null)} />
          </motion.div>
        ) : (
          open &&
          transaction && (
            <motion.div
              key="order"
              {...slide(-24)}
              onAnimationComplete={() => {
                if (!refocus.current) return
                refocus.current = false
                invoiceButton.current?.focus()
              }}
              className="grid gap-6 pb-5"
            >
              <Header transaction={transaction} />
              {section.state.status === 'error' && section.state.kind === 'not-found' ? (
                <Gone onRetry={section.retry} />
              ) : (
                <SectionBody section={section} what="the payment details" skeleton={<PaymentSkeleton />}>
                  {(loaded) => <PaymentDetail detail={loaded} />}
                </SectionBody>
              )}
              <section>
                <h3 className="mb-2 text-xs font-semibold text-fg">Items</h3>
                <SectionBody section={items} what="the items" skeleton={<LinesSkeleton />}>
                  {(loaded) => (loaded.lines.length === 0 ? <EmptyNote>This order has no items.</EmptyNote> : <Lines detail={loaded} />)}
                </SectionBody>
                <button
                  ref={invoiceButton}
                  type="button"
                  disabled={!itemsDetail || itemsDetail.lines.length === 0}
                  onClick={() => setInvoiceSession(session)}
                  className={`${SECONDARY_BUTTON_SM} mt-4 w-full sm:w-auto`}
                >
                  Invoice
                </button>
              </section>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </Modal>
  )
}
