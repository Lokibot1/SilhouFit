import type { ReactNode } from 'react'
import type { OrderStatus } from '../../service/ordersApi'
import { STATUS_CHIP, type ChipTone } from '../../utils/orders'
import { AlertIcon, BoxIcon, CartArrowIcon, CheckIcon, ClockIcon, MapPinIcon, RestoreIcon, WalletIcon, XIcon } from '../form/icons'

// An icon and words on every chip, so the status never rests on colour alone.
const ICON: Record<OrderStatus, ReactNode> = {
  PENDING_PAYMENT: <ClockIcon size={16} />,
  PAYMENT_FAILED: <AlertIcon size={16} />,
  PAID: <WalletIcon size={16} />,
  PROCESSING: <BoxIcon size={16} />,
  DISPATCHED: <CartArrowIcon size={16} />,
  OUT_FOR_DELIVERY: <MapPinIcon size={16} />,
  DELIVERED: <CheckIcon size={16} />,
  CANCELLED: <XIcon size={16} />,
  REFUNDED: <RestoreIcon size={16} />,
}

const TONE: Record<ChipTone, string> = {
  alert: 'border-kral-red-ink text-kral-red-ink',
  outline: 'border-kral-fg text-kral-fg',
  filled: 'border-kral-fg bg-kral-fg text-kral-bg',
  muted: 'border-kral-muted text-kral-muted',
}

/** An order's status as a square mono chip. Red is only for orders that need the shopper to act (pay). */
export function OrderStatusChip({ status, className = '' }: { status: OrderStatus; className?: string }) {
  const { label, tone } = STATUS_CHIP[status]
  return (
    <span
      data-status={status}
      className={`font-kral-mono inline-flex min-h-7 w-fit items-center gap-1.5 border px-2 text-base whitespace-nowrap uppercase md:text-xs md:tracking-[0.08em] ${TONE[tone]} ${className}`}
    >
      {ICON[status]}
      {label}
    </span>
  )
}
