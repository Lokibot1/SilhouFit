import type { OrderStatus, PaymentStatus } from '../../../service/ordersApi'
import { paymentStatusLabel, STATUS_CHIP, type ChipTone } from '../../../utils/orders'

const PILL = 'font-ui inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-semibold whitespace-nowrap text-fg'

// The words carry the meaning; the tint only backs them up (same as the Transactions status badge).
const STATUS_TINT: Record<ChipTone, string> = { alert: 'bg-danger/10', outline: 'border border-line-strong bg-canvas', filled: 'bg-info/15', muted: 'bg-line' }
const PAYMENT_TINT: Record<PaymentStatus, string> = { UNPAID: 'bg-line', PENDING: 'bg-warning/15', PAID: 'bg-success/15', FAILED: 'bg-danger/10', REFUNDED: 'bg-line' }

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const { label, tone } = STATUS_CHIP[status]
  return <span className={`${PILL} ${STATUS_TINT[tone]}`}>{label}</span>
}

export function PaymentPill({ status }: { status: PaymentStatus }) {
  return <span className={`${PILL} ${PAYMENT_TINT[status]}`}>{paymentStatusLabel(status)}</span>
}

/** The order's status, and its payment status too unless the two read the same ("Paid" twice says nothing new). */
export function OrderPills({ status, paymentStatus }: { status: OrderStatus; paymentStatus: PaymentStatus }) {
  return (
    <>
      <OrderStatusPill status={status} />
      {STATUS_CHIP[status].label !== paymentStatusLabel(paymentStatus) && <PaymentPill status={paymentStatus} />}
    </>
  )
}
