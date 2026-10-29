import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSection } from '../../../hooks/useSection'
import { DURATION, EASE_OUT } from '../../../motion/tokens'
import { BagIcon } from '../../form/icons'
import { fetchTransactionDetail, type TransactionDetail, type TransactionLine, type TransactionListItem } from '../../../service/fetchTransactions'
import type { RequestOptions } from '../../../service/simulateRequest'
import { sampleTransactionDetail, TRANSACTIONS_SAMPLE_DATA } from '../../../service/sampleTransactions'
import { formatPeso, itemsLabel } from '../../../utils/format'
import { PAYMENT_LABELS } from '../../../utils/invoiceTax'
import { SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { CopyId } from '../inventory/ProductDetail'
import { EmptyNote, SectionBody } from '../StaffSection'
import { InvoicePreview } from './InvoicePreview'
import { PlacedAt, ReturnedBadge } from './TransactionParts'

/** Stands in for the detail request while no order is selected. It never answers. */
const IDLE = new Promise<TransactionDetail>(() => {})

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

const LINE_ROW = 'h-[4.5rem]'
const TH = 'sticky top-0 z-10 h-11 border-b border-line bg-canvas-sub text-left font-semibold text-fg'

/** The order's own facts, taken from the list row so they show before the items arrive. */
function Header({ transaction }: { transaction: TransactionListItem }) {
  return (
    <div>
      <p className="text-lg font-semibold text-fg">{transaction.customerName}</p>
      <p className="text-sm text-fg-muted">
        <PlacedAt iso={transaction.placedAt} />
      </p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 text-sm text-fg-muted">
        <span className="tabular-nums">{itemsLabel(transaction.itemCount)}</span>
        <span className="text-lg font-semibold text-fg tabular-nums">{formatPeso(transaction.total)}</span>
      </p>
      {transaction.returnedAt && (
        <div className="mt-2 rounded-xl border border-line bg-canvas-sub p-3 text-sm">
          <ReturnedBadge />
          <p className="mt-2 text-fg">
            Returned on <PlacedAt iso={transaction.returnedAt} />
          </p>
          <p className="text-fg-muted">Reason: {transaction.returnReason}</p>
          <p className="font-semibold text-fg tabular-nums">Refunded in full: {formatPeso(transaction.refundAmount ?? transaction.total)}</p>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
        <p className="min-w-0 font-mono text-xs break-all text-fg-muted">
          <span className="sr-only">Order ID </span>
          {transaction.id}
        </p>
        <CopyId id={transaction.id} what="order" />
      </div>
    </div>
  )
}

/** Who to reach about the order, once the detail has arrived. */
function Contact({ detail }: { detail: TransactionDetail | null }) {
  if (!detail) return <Bar className="h-28 w-full" />
  const { customer } = detail
  return (
    <dl className="grid gap-2 rounded-xl border border-line bg-canvas-sub p-3 text-sm">
      {customer && (
        <>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-fg-muted">Email</dt>
            <dd className="min-w-0 break-all text-fg">{customer.email}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-fg-muted">Contact</dt>
            <dd className="text-fg tabular-nums">{customer.phone}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-fg-muted">Address</dt>
            <dd className="min-w-0 text-fg">{customer.address ?? 'No address saved'}</dd>
          </div>
        </>
      )}
      <div className={`flex gap-3 ${customer ? 'border-t border-line pt-2' : ''}`}>
        <dt className="w-20 shrink-0 text-fg-muted">Payment</dt>
        <dd className="min-w-0 text-fg">
          {detail.paymentMethod ? PAYMENT_LABELS[detail.paymentMethod] : 'Not recorded'}
          <p className="text-fg-muted tabular-nums">
            {formatPeso(detail.total)} · <PlacedAt iso={detail.placedAt} />
          </p>
        </dd>
      </div>
    </dl>
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

function Lines({ detail, total }: { detail: TransactionDetail; total: number }) {
  return (
    <>
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
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
              <td className="border-b border-line py-2 pr-2">
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
              <td className="border-b border-line text-right whitespace-nowrap text-fg tabular-nums">{formatPeso(line.units * line.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        <dt className="text-fg-muted">Subtotal</dt>
        <dd className="text-right text-fg tabular-nums">{formatPeso(detail.subtotal)}</dd>
        <dt className="font-semibold text-fg">Total</dt>
        <dd className="text-right font-semibold text-fg tabular-nums">{formatPeso(total)}</dd>
      </dl>
    </>
  )
}

interface TransactionDrawerProps {
  /** The order to show; it stays set while the drawer slides out. */
  transaction: TransactionListItem | null
  open: boolean
  /** Counts up on every open, so the items load again. */
  session: number
  onClose: () => void
}

/** A read-only drawer: the order's header at once, then its items. */
export function TransactionDrawer({ transaction, open, session, onClose }: TransactionDrawerProps) {
  const id = transaction?.id
  const fetcher = useCallback(
    (options: RequestOptions) => (id ? (TRANSACTIONS_SAMPLE_DATA ? sampleTransactionDetail : fetchTransactionDetail)(id, options) : IDLE),
    // A new session is a new request, though it is not read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [id, session],
  )
  const section = useSection(fetcher)

  // The invoice preview takes the drawer's place (no second modal). It is remembered with the session it was opened in, so each open starts on the order.
  const [invoiceSession, setInvoiceSession] = useState<number | null>(null)
  const showInvoice = invoiceSession === session
  const invoiceButton = useRef<HTMLButtonElement>(null)
  const wasInvoice = useRef(false)
  const refocus = useRef(false)
  useEffect(() => {
    if (wasInvoice.current && !showInvoice) refocus.current = true
    wasInvoice.current = showInvoice
  }, [showInvoice])
  // The two views cross-fade with a short slide: the invoice arrives from the right, the order from the left.
  const reduced = useReducedMotion() ?? false
  const slide = (from: number) => ({
    initial: { opacity: 0, x: reduced ? 0 : from },
    animate: { opacity: 1, x: 0, transition: { duration: DURATION.state, ease: EASE_OUT } },
    exit: { opacity: 0, x: reduced ? 0 : -from, transition: { duration: DURATION.feedback } },
  })
  const detail = section.state.status === 'success' ? section.state.data : null

  return (
    <Modal variant="sheet" open={open} onClose={onClose} title={transaction && showInvoice ? `Invoice ${transaction.orderNo}` : (transaction?.orderNo ?? '')}>
      <AnimatePresence mode="wait" initial={false}>
        {open && transaction && showInvoice && detail ? (
          <motion.div key="invoice" {...slide(24)}>
            <InvoicePreview transaction={transaction} detail={detail} onBack={() => setInvoiceSession(null)} />
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
              {section.state.status !== 'error' && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-fg">Customer and payment</h3>
                  <Contact detail={detail} />
                </section>
              )}
              <section>
                <h3 className="mb-2 text-sm font-semibold text-fg">Items</h3>
                <SectionBody section={section} what="the items" skeleton={<LinesSkeleton />}>
                  {(loaded) =>
                    loaded.lines.length === 0 ? <EmptyNote>This order has no items.</EmptyNote> : <Lines detail={loaded} total={transaction.total} />
                  }
                </SectionBody>
                <button
                  ref={invoiceButton}
                  type="button"
                  disabled={!detail || detail.lines.length === 0}
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
