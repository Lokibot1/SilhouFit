import { useCallback, useState, type ReactNode } from 'react'
import { useSection } from '../../../hooks/useSection'
import { fetchAdminOrder, type AdminOrderDetail, type AdminOrderItem, type AdminOrderRow, type AdminPayment } from '../../../service/adminOrdersApi'
import type { RequestOptions } from '../../../service/simulateRequest'
import { formatPeso, variantLabel } from '../../../utils/format'
import { shipmentStatusLabel } from '../../../utils/orders'
import { BagIcon } from '../../form/icons'
import { Modal } from '../../ui/Modal'
import { CopyId } from '../inventory/ProductDetail'
import { EmptyNote, SectionError } from '../StaffSection'
import { PlacedAt } from '../transactions/TransactionParts'
import { AdminOrderActions } from './AdminOrderActions'
import { OrderPills, PaymentPill } from './OrderPills'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />
const TH = 'sticky top-0 z-10 h-11 border-b border-line bg-canvas-sub px-3 text-left font-semibold text-fg'

/** "ASSIGNING_DRIVER" -> "Assigning driver". */
const humanize = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())

const METHOD_LABEL: Record<string, string> = { GCASH: 'GCash', PAYMAYA: 'Maya', CARD: 'Card', GRAB_PAY: 'GrabPay', BILLEASE: 'BillEase', OTHER: 'Other' }

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section>
    <h3 className="mb-2 text-xs font-semibold text-fg">{title}</h3>
    {children}
  </section>
)

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  )
}

/** The order's own facts. The chips and total come from the loaded order once it is here, so they follow a change. */
function Header({ order, detail }: { order: AdminOrderRow; detail: AdminOrderDetail | null }) {
  const live = detail ?? order
  return (
    <div>
      <p className="flex flex-wrap items-center gap-2">
        <OrderPills status={live.status} paymentStatus={live.paymentStatus} />
      </p>
      <p className="mt-2 text-xs text-fg-muted">
        Placed <PlacedAt iso={order.placedAt} />
      </p>
      <p className="mt-2 text-base font-semibold text-fg tabular-nums">{formatPeso(live.total)}</p>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
        <p className="min-w-0 font-mono text-xs break-all text-fg-muted">
          <span className="sr-only">Order ID </span>
          {order.id}
        </p>
        {/* The shared copy button is 36px; the drawer needs a 44px touch target. */}
        <div className="shrink-0 [&_button]:m-0! [&_button]:size-11!">
          <CopyId id={order.id} what="order" />
        </div>
      </div>
    </div>
  )
}

function Customer({ detail }: { detail: AdminOrderDetail }) {
  const { customer, address, note } = detail
  return (
    <dl className="grid gap-2 rounded-xl border border-line bg-canvas-sub p-3 text-xs">
      <Row label="Customer">{customer ? customer.name : 'Customer account removed'}</Row>
      {customer && <Row label="Email"><span className="break-all">{customer.email}</span></Row>}
      <div className="grid gap-2 border-t border-line pt-2">
        <Row label="Deliver to">{address.recipientName || 'No name on the address'}</Row>
        <Row label="Contact">
          <span className="tabular-nums">{address.phone || 'No phone on the address'}</span>
        </Row>
        <Row label="Address">{[address.line, `${address.city} ${address.postalCode}`.trim()].filter(Boolean).join(', ') || 'No address on the order'}</Row>
      </div>
      <div className="border-t border-line pt-2">
        <Row label="Customer note">{note ?? 'No note'}</Row>
      </div>
    </dl>
  )
}

function StockNote({ item }: { item: AdminOrderItem }) {
  return <span className="whitespace-nowrap tabular-nums">{item.stock === null ? 'Variant deleted' : `In stock now: ${item.stock}`}</span>
}

function Items({ detail }: { detail: AdminOrderDetail }) {
  if (detail.items.length === 0) return <EmptyNote>This order has no items.</EmptyNote>
  return (
    <>
      <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
        <caption className="sr-only">Items in this order with size and colour, SKU, units, unit price, stock now and line total</caption>
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
          {detail.items.map((item) => (
            <tr key={item.id}>
              <td className="border-b border-line px-3 py-2">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-line text-fg-muted">
                    <BagIcon size={20} />
                  </span>
                  <div className="min-w-0">
                    <span className="block font-semibold text-fg">{item.name}</span>
                    <span className="block text-fg-muted">{[variantLabel(item.size, item.color), item.sku].filter(Boolean).join(' · ')}</span>
                    <span className="flex flex-wrap gap-x-3 text-fg-muted">
                      <span className="whitespace-nowrap tabular-nums">
                        {item.qty} × {formatPeso(item.unitPrice)}
                      </span>
                      <StockNote item={item} />
                    </span>
                  </div>
                </div>
              </td>
              <td className="border-b border-line px-3 text-right whitespace-nowrap text-fg tabular-nums">{formatPeso(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3 text-xs">
        <dt className="text-fg-muted">Subtotal</dt>
        <dd className="text-right text-fg tabular-nums">{formatPeso(detail.subtotal)}</dd>
        <dt className="text-fg-muted">Shipping</dt>
        <dd className="text-right text-fg tabular-nums">{formatPeso(detail.shipping)}</dd>
        {detail.discount > 0 && (
          <>
            <dt className="text-fg-muted">Discount</dt>
            <dd className="text-right text-fg tabular-nums">−{formatPeso(detail.discount)}</dd>
          </>
        )}
        <dt className="font-semibold text-fg">Total</dt>
        <dd className="text-right font-semibold text-fg tabular-nums">{formatPeso(detail.total)}</dd>
      </dl>
    </>
  )
}

function Payment({ payment }: { payment: AdminPayment }) {
  return (
    <li className="rounded-xl border border-line bg-canvas-sub p-3 text-xs">
      <p className="flex flex-wrap items-center justify-between gap-x-3">
        <span className="font-semibold text-fg">
          {humanize(payment.provider)} · {METHOD_LABEL[payment.method] ?? humanize(payment.method)}
        </span>
        <PaymentPill status={payment.status} />
      </p>
      <p className="mt-1 text-fg-muted">
        <PlacedAt iso={payment.at} />
      </p>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
        <dt className="text-fg-muted">Amount</dt>
        <dd className="text-right text-fg tabular-nums">{formatPeso(payment.amount)}</dd>
        {payment.fee !== null && (
          <>
            <dt className="text-fg-muted">Fee</dt>
            <dd className="text-right text-fg tabular-nums">{formatPeso(payment.fee)}</dd>
          </>
        )}
        {payment.net !== null && (
          <>
            <dt className="text-fg-muted">Net</dt>
            <dd className="text-right text-fg tabular-nums">{formatPeso(payment.net)}</dd>
          </>
        )}
      </dl>
    </li>
  )
}

function Delivery({ detail }: { detail: AdminOrderDetail }) {
  const { shipment, events } = detail
  if (!shipment) return <EmptyNote>No delivery booked.</EmptyNote>
  const tracking = shipment.trackingUrl && /^https:\/\//i.test(shipment.trackingUrl) ? shipment.trackingUrl : null
  return (
    <div className="grid gap-3">
      <dl className="grid gap-2 rounded-xl border border-line bg-canvas-sub p-3 text-xs">
        <Row label="Courier">{[shipment.courier, shipment.serviceType].filter(Boolean).join(' · ')}</Row>
        <Row label="Status">{shipmentStatusLabel(shipment.status)}</Row>
        <Row label="Driver">
          {shipment.driverName ? (
            <>
              {shipment.driverName}
              {shipment.driverPlate && <span className="text-fg-muted"> · {shipment.driverPlate}</span>}
              {shipment.driverPhone && <span className="block text-fg-muted tabular-nums">{shipment.driverPhone}</span>}
            </>
          ) : (
            'Not assigned yet'
          )}
        </Row>
        <Row label="Delivery fee">
          <span className="tabular-nums">{formatPeso(shipment.deliveryFee)}</span>
        </Row>
        {tracking && (
          <Row label="Tracking">
            <a href={tracking} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold underline decoration-chrome-strong decoration-2 underline-offset-2 hover:text-chrome-strong">
              Open tracking page
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Row>
        )}
      </dl>
      {events.length === 0 ? (
        <EmptyNote>No courier updates yet.</EmptyNote>
      ) : (
        <ol aria-label="Courier updates, oldest first" className="grid gap-2 text-xs">
          {events.map((event) => (
            <li key={event.id} className="rounded-xl border border-line px-3 py-2">
              <p className="font-semibold text-fg">{humanize(event.label)}</p>
              {event.reason && <p className="text-fg-muted">{event.reason}</p>}
              <p className="text-fg-muted">
                <PlacedAt iso={event.at} />
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading order details" className="grid animate-pulse gap-6">
      <Bar className="h-24 w-full" />
      <Bar className="h-36 w-full" />
      {[0, 1].map((n) => (
        <div key={n} className="grid gap-2">
          <Bar className="h-14 w-full" />
        </div>
      ))}
      <Bar className="h-28 w-full" />
    </div>
  )
}

interface BodyProps {
  order: AdminOrderRow
  /** An order changed: the list and the counts read again. */
  onChanged: () => void
}

// Mounted fresh on every open (the drawer keys it by session), so it never shows an earlier visit's order.
function Body({ order, onChanged }: BodyProps) {
  const [reload, setReload] = useState(0)
  const fetcher = useCallback(
    (options: RequestOptions) => fetchAdminOrder(order.id, options),
    // A new reload is a new request, though it is not read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [order.id, reload],
  )
  const { state, previous, retry } = useSection(fetcher)
  const detail = state.status === 'success' ? state.data : (previous ?? null)

  return (
    <div aria-busy={state.status === 'loading'} className="grid gap-6 pb-5">
      <Header order={order} detail={detail} />
      {state.status === 'error' && (
        <div className="rounded-xl border border-line bg-canvas-sub p-3">
          <SectionError what={detail ? 'the latest order details' : 'the order details'} kind={state.kind} onRetry={retry} />
          {detail && <p className="mt-3 text-sm text-fg-muted">What shows below is from before your last change.</p>}
        </div>
      )}
      {detail ? (
        <div className={`grid gap-6 transition-opacity duration-150 ${state.status === 'loading' ? 'opacity-60' : ''}`}>
          <AdminOrderActions
            key={detail.id}
            detail={detail}
            onChanged={() => {
              setReload((n) => n + 1)
              onChanged()
            }}
          />
          <Section title="Customer and delivery address">
            <Customer detail={detail} />
          </Section>
          <Section title="Items">
            <Items detail={detail} />
          </Section>
          <Section title="Payments">
            {detail.payments.length === 0 ? (
              <EmptyNote>No payment attempts yet.</EmptyNote>
            ) : (
              <ul className="grid gap-2">
                {detail.payments.map((payment) => (
                  <Payment key={payment.id} payment={payment} />
                ))}
              </ul>
            )}
          </Section>
          <Section title="Delivery">
            <Delivery detail={detail} />
          </Section>
        </div>
      ) : (
        state.status === 'loading' && <DetailSkeleton />
      )}
    </div>
  )
}

interface AdminOrderDrawerProps {
  /** The order to show; it stays set while the drawer slides out. */
  order: AdminOrderRow | null
  open: boolean
  /** Counts up on every open, so the order loads again. */
  session: number
  onClose: () => void
  onChanged: () => void
}

/** The order's header at once, then everything staff need to act on it. */
export function AdminOrderDrawer({ order, open, session, onClose, onChanged }: AdminOrderDrawerProps) {
  return (
    <Modal variant="sheet" open={open} onClose={onClose} title={order?.orderNumber ?? ''}>
      {open && order && <Body key={session} order={order} onChanged={onChanged} />}
    </Modal>
  )
}
