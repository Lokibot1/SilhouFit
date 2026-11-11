import { useCallback, useState, type ReactNode } from 'react'
import { useSection } from '../../../hooks/useSection'
import { fetchAdminOrder, type AdminOrderDetail, type AdminOrderItem, type AdminOrderRow, type AdminPayment } from '../../../service/adminOrdersApi'
import type { RequestOptions } from '../../../service/simulateRequest'
import { formatPeso, variantLabel } from '../../../utils/format'
import { shipmentStatusLabel } from '../../../utils/orders'
import { BagIcon, BoxIcon, UserIcon, WalletIcon } from '../../form/icons'
import { PRIMARY_BUTTON_SM } from '../../ui/buttonStyles'
import { PhotoImg } from '../../ui/PhotoImg'
import { Modal } from '../../ui/Modal'
import { CopyId } from '../inventory/ProductDetail'
import { EmptyNote, SectionError } from '../StaffSection'
import { PlacedAt } from '../transactions/TransactionParts'
import { AdminOrderActions } from './AdminOrderActions'
import { CARD_LABEL, OrderCard } from './OrderCard'
import { OrderPills, PaymentPill } from './OrderPills'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** "ASSIGNING_DRIVER" -> "Assigning driver". */
const humanize = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())

/** Units left at or under this show as a warning in the items list. */
const LOW_STOCK = 5

const METHOD_LABEL: Record<string, string> = { GCASH: 'GCash', PAYMAYA: 'Maya', CARD: 'Card', GRAB_PAY: 'GrabPay', BILLEASE: 'BillEase', OTHER: 'Other' }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 font-medium text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  )
}

/** The order's own facts. The chips and total come from the loaded order once it is here, so they follow a change. */
function Header({ order, detail }: { order: AdminOrderRow; detail: AdminOrderDetail | null }) {
  const live = detail ?? order
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-4 text-base md:text-sm">
        <OrderPills status={live.status} paymentStatus={live.paymentStatus} />
        <span className="text-fg-muted">
          · Placed <PlacedAt iso={order.placedAt} />
        </span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-t border-line pt-4">
        <div>
          <p className={CARD_LABEL}>Total amount</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-fg tabular-nums">{formatPeso(live.total)}</p>
        </div>
        <div>
          <p className={CARD_LABEL}>Reference ID</p>
          <div className="mt-1 flex items-center rounded-xl border border-line bg-canvas-sub pl-3">
            <span className="sr-only">Order ID {order.id}</span>
            <span aria-hidden="true" className="font-mono text-base text-fg md:text-sm">
              {order.id.slice(0, 8)}…{order.id.slice(-5)}
            </span>
            {/* The shared copy button is 36px; the drawer needs a 44px touch target. */}
            <div className="[&_button]:m-0! [&_button]:size-11!">
              <CopyId id={order.id} what="order" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Customer({ detail }: { detail: AdminOrderDetail }) {
  const { customer, address, note } = detail
  return (
    <dl className="grid gap-3 text-base md:text-sm">
      <Row label="Customer"><span className="font-semibold">{customer ? customer.name : 'Customer account removed'}</span></Row>
      {customer && <Row label="Email"><span className="break-all">{customer.email}</span></Row>}
      <Row label="Deliver to">{address.recipientName || 'No name on the address'}</Row>
      <Row label="Contact">
        <span className="tabular-nums">{address.phone || 'No phone on the address'}</span>
      </Row>
      <Row label="Address">{[address.line, `${address.city} ${address.postalCode}`.trim()].filter(Boolean).join(', ') || 'No address on the order'}</Row>
      <div className="border-t border-dashed border-line pt-3">
        <Row label="Customer note">{note ? note : <span className="text-fg-muted italic">No note provided</span>}</Row>
      </div>
    </dl>
  )
}

function StockNote({ item }: { item: AdminOrderItem }) {
  const gone = item.stock === null
  const low = !gone && item.stock! <= LOW_STOCK
  return (
    <span className={`flex items-center gap-1.5 whitespace-nowrap tabular-nums ${low ? 'font-semibold text-fg' : ''}`}>
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${gone ? 'bg-danger' : low ? 'bg-warning' : 'bg-line-strong'}`} />
      {gone ? 'Variant deleted' : `In stock now: ${item.stock}`}
    </span>
  )
}

function Items({ detail }: { detail: AdminOrderDetail }) {
  if (detail.items.length === 0) return <EmptyNote>This order has no items.</EmptyNote>
  return (
    <>
      <ul aria-label="Items in this order with size and colour, SKU, units, unit price, stock now and line total" className="divide-y divide-line text-base md:text-sm">
        {detail.items.map((item) => (
          <li key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0">
            <PhotoImg src={item.imageUrl} alt={item.name} loading="lazy" className="h-20 w-16 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0">
              <span className="block font-semibold text-fg">{item.name}</span>
              <span className="block text-fg-muted">{[variantLabel(item.size, item.color), item.sku].filter(Boolean).join(' · ')}</span>
              <span className="mt-1 block text-fg tabular-nums">
                {item.qty} × {formatPeso(item.unitPrice)}
              </span>
              <span className="text-fg-muted">
                <StockNote item={item} />
              </span>
            </div>
            <span className="text-right font-semibold whitespace-nowrap text-fg tabular-nums">{formatPeso(item.total)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 border-t border-line pt-4 text-base md:text-sm">
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
    <li className="rounded-xl border border-line bg-canvas p-3 text-base md:text-sm">
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
    <div className="grid gap-4">
      <dl className="grid gap-3 text-base md:text-sm">
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
      <div className="border-t border-line pt-4">
        {events.length === 0 ? (
          <EmptyNote>No courier updates yet.</EmptyNote>
        ) : (
          <ol aria-label="Courier updates, oldest first" className="grid gap-4 border-l border-line-strong text-base md:text-sm">
            {events.map((event) => (
              <li key={event.id} className="relative pl-4">
                <span aria-hidden="true" className="absolute top-2 -left-[3.5px] size-1.5 rounded-full bg-fg" />
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
    </div>
  )
}

/** Same blocks as the loaded order, at about the same heights, so nothing jumps when it arrives. */
function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading order details" className="grid animate-pulse gap-6">
      <div className="grid gap-3">
        <Bar className="h-4 w-24" />
        <Bar className="h-11 w-full" />
      </div>
      <Bar className="h-56 w-full" />
      <Bar className="h-64 w-full" />
      <Bar className="h-72 w-full" />
      <Bar className="h-40 w-full" />
      <Bar className="h-48 w-full" />
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
        <div className="rounded-xl border border-line bg-canvas-sub p-4">
          <SectionError what={detail ? 'the latest order details' : 'the order details'} kind={state.kind} onRetry={retry} />
          {detail && <p className="mt-3 text-base text-fg-muted md:text-sm">What shows below is from before your last change.</p>}
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
          <OrderCard icon={<UserIcon size={16} />} title="Customer and delivery address">
            <Customer detail={detail} />
          </OrderCard>
          <OrderCard icon={<BagIcon size={16} />} title={`Items (${detail.items.length})`} aside={<span className={CARD_LABEL}>Total</span>}>
            <Items detail={detail} />
          </OrderCard>
          <OrderCard icon={<WalletIcon size={16} />} title="Payments">
            {detail.payments.length === 0 ? (
              <EmptyNote>No payment attempts yet.</EmptyNote>
            ) : (
              <ul className="grid gap-3">
                {detail.payments.map((payment) => (
                  <Payment key={payment.id} payment={payment} />
                ))}
              </ul>
            )}
          </OrderCard>
          <OrderCard icon={<BoxIcon size={16} />} title="Delivery">
            <Delivery detail={detail} />
          </OrderCard>
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
    <Modal
      variant="sheet"
      open={open}
      onClose={onClose}
      title={order?.orderNumber ?? ''}
      titleClassName="min-w-0 font-mono! tracking-normal! break-all"
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={PRIMARY_BUTTON_SM}>
            Done &amp; Close
          </button>
        </div>
      }
    >
      {open && order && <Body key={session} order={order} onChanged={onChanged} />}
    </Modal>
  )
}
