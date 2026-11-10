import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { BoxIcon, CartArrowIcon, DownloadIcon, MessageIcon, SpinnerIcon, StoreIcon } from '../../components/form/icons'
import { CancelOrderModal } from '../../components/orders/CancelOrderModal'
import { OrderStatusChip } from '../../components/orders/OrderStatusChip'
import { OrderTimeline } from '../../components/orders/OrderTimeline'
import { OrdersBreadcrumb } from '../../components/orders/OrdersBreadcrumb'
import { OrderDetailSkeleton } from '../../components/orders/OrdersSkeleton'
import { KRAL_DANGER, KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { useToast } from '../../components/toast/useToast'
import { PhotoImg } from '../../components/ui/PhotoImg'
import { SampleDataBadge } from '../../components/ui/SampleDataBadge'
import { useBuyAgain } from '../../hooks/useBuyAgain'
import { useCancelOrder } from '../../hooks/useCancelOrder'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useOrder } from '../../hooks/useOrders'
import { usesSampleOrders, type CustomerOrder } from '../../service/ordersApi'
import { formatOrderTime, formatPeso, variantLabel } from '../../utils/format'
import { adaptOrderToReceipt, buildTimeline, canBuyAgain, canCancel, hasShipped, paymentStatusLabel, trackingLink } from '../../utils/orders'

const DESCRIPTION = 'Follow one SilhouFit order: where it is now, what is in it, what you paid, where it is going, and what you can do next, such as cancelling or buying again.'

const SECTION = 'border border-kral-rule p-5'
const HEADING = 'font-kral-display text-lg leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-xl'
const MUTED = 'font-kral-mono text-base text-kral-muted md:text-sm'

function Row({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? 'font-medium text-kral-fg' : ''}`}>
      <dt className="text-kral-muted">{label}</dt>
      <dd className="min-w-0 text-right tabular-nums">{children}</dd>
    </div>
  )
}

function OrderBody({ order, onCancel }: { order: CustomerOrder; onCancel: (order: CustomerOrder) => void }) {
  const toast = useToast()
  const { busy, buyAgain } = useBuyAgain()
  const [downloading, setDownloading] = useState(false)
  const [receiptFailed, setReceiptFailed] = useState(false)
  const { shipment } = order
  const track = trackingLink(order)

  async function downloadReceipt() {
    if (downloading) return
    setDownloading(true)
    setReceiptFailed(false)
    try {
      const { renderReceiptPdf } = await import('../../utils/receiptPdf')
      const url = URL.createObjectURL(await renderReceiptPdf(adaptOrderToReceipt(order)))
      const link = document.createElement('a')
      link.href = url
      link.download = `SilhouFit-receipt-${order.orderNumber}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.show({ kind: 'success', message: 'Receipt downloaded.' })
    } catch {
      setReceiptFailed(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        {order.status === 'CANCELLED' && (
          <div role="status" className={`${SECTION} border-kral-muted`}>
            <h2 className="font-kral-mono text-base font-medium text-kral-fg uppercase">This order was cancelled</h2>
            <p className={`${MUTED} mt-1`}>
              {order.cancelledAt && <span className="tabular-nums">Cancelled {formatOrderTime(order.cancelledAt)}. </span>}
              {order.cancellationReason ? <>Reason: {order.cancellationReason}</> : 'No reason was given.'}
            </p>
          </div>
        )}

        <section aria-labelledby="order-progress" className={SECTION}>
          <h2 id="order-progress" className={`${HEADING} mb-4`}>
            Order progress
          </h2>
          <OrderTimeline steps={buildTimeline(order)} />
        </section>

        {hasShipped(order) && shipment && (
          <section aria-labelledby="order-delivery" className={SECTION}>
            <h2 id="order-delivery" className={`${HEADING} flex items-center gap-2`}>
              <BoxIcon />
              Delivery
            </h2>
            <dl className="font-kral-mono mt-3 space-y-1 text-base md:text-sm">
              <Row label="Courier">{[shipment.courier, shipment.serviceType].filter(Boolean).join(' · ')}</Row>
              {shipment.driverName && <Row label="Driver">{shipment.driverName}</Row>}
              {shipment.driverPlate && <Row label="Plate number">{shipment.driverPlate}</Row>}
              {/* The rider's number is only for the last leg. */}
              {order.status === 'OUT_FOR_DELIVERY' && shipment.driverPhone && (
                <Row label="Driver phone">
                  <a href={`tel:${shipment.driverPhone}`} className="kral-focus inline-flex min-h-11 items-center underline underline-offset-4 hover:text-kral-red-ink">
                    {shipment.driverPhone}
                  </a>
                </Row>
              )}
            </dl>
            {track && (
              <a href={track} target="_blank" rel="noopener noreferrer" className={`${KRAL_SECONDARY} mt-4 w-full sm:w-fit`}>
                Track delivery
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </section>
        )}

        <section aria-labelledby="order-items" className={SECTION}>
          <h2 id="order-items" className={HEADING}>
            Items ({order.items.length})
          </h2>
          <ul className="mt-4 space-y-4">
            {order.items.map((item) => (
              <li key={item.id} className="flex min-w-0 gap-4">
                <PhotoImg tone="kral" src={item.imageUrl} alt={item.name} loading="lazy" className="h-24 w-18 shrink-0 object-cover" />
                <div className="font-kral-mono min-w-0 flex-1">
                  <h3 className="font-kral-display text-sm leading-tight font-extrabold [overflow-wrap:anywhere] text-kral-fg uppercase sm:text-base">{item.name}</h3>
                  {variantLabel(item.size, item.color) && <p className={`${MUTED} mt-1`}>{variantLabel(item.size, item.color)}</p>}
                  <div className="mt-2 text-right tabular-nums">
                    <p className="text-base text-kral-muted md:text-sm">
                      {formatPeso(item.unitPrice)} × {item.qty}
                    </p>
                    <p className="text-base font-medium text-kral-fg">{formatPeso(item.total)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {order.note && (
          <section aria-labelledby="order-note" className={SECTION}>
            <h2 id="order-note" className={HEADING}>
              Your note
            </h2>
            <p className={`${MUTED} mt-3 break-words text-kral-fg`}>{order.note}</p>
          </section>
        )}
      </div>

      <aside aria-labelledby="order-summary" className={`${SECTION} space-y-4 lg:sticky lg:top-[calc(4rem+var(--site-header-extra,0px))]`}>
        <h2 id="order-summary" className={HEADING}>
          Order summary
        </h2>
        <dl className="font-kral-mono space-y-1 text-base md:text-sm">
          <Row label="Subtotal">{formatPeso(order.subtotal)}</Row>
          <Row label="Shipping">{order.shipping === 0 ? 'Free' : formatPeso(order.shipping)}</Row>
          {order.discount > 0 && <Row label="Discount">−{formatPeso(order.discount)}</Row>}
          <Row label="Total" strong>
            {formatPeso(order.total)}
          </Row>
          <Row label="Payment">{paymentStatusLabel(order.paymentStatus)}</Row>
        </dl>

        <div className="border-t border-kral-rule pt-4">
          <h3 className="font-kral-mono text-base font-medium text-kral-fg uppercase md:text-sm">Delivering to</h3>
          <address className={`${MUTED} mt-1 leading-snug break-words not-italic`}>
            <span className="block font-medium text-kral-fg">{order.address.recipientName}</span>
            <span className="block tabular-nums">{order.address.phone}</span>
            <span className="block">{order.address.line}</span>
            <span className="block">
              {order.address.city} {order.address.postalCode}
            </span>
          </address>
        </div>

        {order.status === 'PENDING_PAYMENT' && <p className={`${MUTED} border-t border-kral-rule pt-4`}>Online payment is coming soon. Your order is held until then.</p>}

        <div className="flex flex-col gap-3 border-t border-kral-rule pt-4">
          {canBuyAgain(order) && (
            <button type="button" onClick={() => void buyAgain(order)} disabled={busy === order.id} aria-busy={busy === order.id} className={KRAL_SECONDARY}>
              {busy === order.id ? <SpinnerIcon /> : <CartArrowIcon size={16} />}
              Buy again
            </button>
          )}
          {order.status !== 'CANCELLED' && (
            <button type="button" onClick={() => void downloadReceipt()} disabled={downloading} aria-busy={downloading} className={KRAL_SECONDARY}>
              {downloading ? <SpinnerIcon /> : <DownloadIcon />}
              Download receipt
            </button>
          )}
          <Link to="/messages" className={KRAL_SECONDARY}>
            <MessageIcon size={16} />
            Contact seller
          </Link>
          {canCancel(order) && (
            <button type="button" onClick={() => onCancel(order)} className={KRAL_DANGER}>
              Cancel order
            </button>
          )}
          {receiptFailed && (
            <p role="alert" className="font-kral-mono text-base leading-snug text-danger md:text-sm">
              We couldn&apos;t make your receipt. Something went wrong while building the PDF. Press Download receipt to try again.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

/** One order; the id is the page's, so the whole page is keyed by it. */
function OrderPage({ id }: { id: string }) {
  const user = useCurrentUser()
  const { pathname, search } = useLocation()
  const { status, order, retry, refresh, update } = useOrder(id, !!user)
  const cancel = useCancelOrder((next) => (next ? update(next) : refresh()))
  const heading = useRef<HTMLHeadingElement>(null)
  useDocumentTitle(order ? `Order ${order.orderNumber} — SilhouFit` : 'Your order — SilhouFit')
  useMetaDescription(DESCRIPTION)

  // The heading is read out once the order (or why there is none) is on screen.
  const settled = status !== 'loading'
  useEffect(() => {
    if (settled) heading.current?.focus({ preventScroll: true })
  }, [settled])

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />
  if (status === 'loading') return <OrderDetailSkeleton />

  return (
    <div className="mx-auto max-w-6xl px-6 pt-18 pb-24 2xl:max-w-[88rem]">
      <OrdersBreadcrumb current={order?.orderNumber ?? 'Order'} orders />
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 ref={heading} tabIndex={-1} className="font-kral-display min-w-0 text-xl leading-[1.05] font-extrabold [overflow-wrap:anywhere] text-kral-fg uppercase outline-none sm:text-3xl lg:text-4xl">
          {order ? order.orderNumber : status === 'not-found' ? 'Order not found' : 'Your order'}
        </h1>
        {order && <OrderStatusChip status={order.status} />}
        {order && usesSampleOrders() && <SampleDataBadge tone="kral" reason="This order is a placeholder for this test account. Cancelling it only changes this tab." />}
      </div>

      {status === 'not-found' && (
        <div className="mt-6 border border-kral-rule p-6 sm:p-8">
          <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">We can&apos;t find this order</h2>
          <p className="font-kral-mono mt-3 max-w-xl text-base leading-relaxed text-kral-muted">
            It may belong to another account, or the link may be wrong. Open My orders to find yours.
          </p>
          <Link to="/orders" className={`${KRAL_PRIMARY} mt-6 w-fit`}>
            <StoreIcon />
            Back to my orders
          </Link>
        </div>
      )}

      {status === 'error' && !order && (
        <div role="alert" className="mt-6 border border-kral-rule p-6 sm:p-8">
          <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">This order did not load</h2>
          <p className="font-kral-mono mt-3 max-w-xl text-base leading-relaxed text-kral-muted">
            The request for this order failed, most likely because the connection dropped or the service is briefly unavailable. Your order is safe. Check your connection, then try again.
          </p>
          <button type="button" onClick={retry} className={`${KRAL_PRIMARY} mt-6 w-fit`}>
            Try again
          </button>
        </div>
      )}

      {order && <OrderBody order={order} onCancel={cancel.open} />}

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

export function OrderDetailPage() {
  const { id = '' } = useParams()
  return <OrderPage key={id} id={id} />
}
