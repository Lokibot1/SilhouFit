import { Link } from 'react-router-dom'
import type { CustomerOrder } from '../../service/ordersApi'
import { formatPeso, formatPlacedAt, itemsLabel } from '../../utils/format'
import { canBuyAgain, canCancel, itemCount, trackingLink } from '../../utils/orders'
import { BoxIcon, CartArrowIcon, SpinnerIcon } from '../form/icons'
import { KRAL_DANGER, KRAL_SECONDARY } from '../shop/shopControls'
import { PhotoImg } from '../ui/PhotoImg'
import { OrderStatusChip } from './OrderStatusChip'

const MAX_ROWS = 2
const THUMB = 'h-20 w-16 shrink-0 object-cover'

interface OrderCardProps {
  order: CustomerOrder
  onCancel: (order: CustomerOrder) => void
  onBuyAgain: (order: CustomerOrder) => void
  /** This order's pieces are being added to the cart. */
  buying: boolean
}

/** One order in the list. The whole card opens the order through the number's stretched link; the action buttons sit above it. */
export function OrderCard({ order, onCancel, onBuyAgain, buying }: OrderCardProps) {
  const titleId = `order-${order.id}`
  const track = trackingLink(order)
  const extra = order.items.length - MAX_ROWS
  return (
    <article aria-labelledby={titleId} className="relative border border-kral-rule p-4 transition-colors duration-150 hover:border-kral-fg motion-reduce:transition-none sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={titleId} className="font-kral-mono text-base font-medium break-all text-kral-fg tabular-nums">
            <Link to={`/orders/${order.id}`} className="kral-focus after:absolute after:inset-0 after:content-['']">
              {order.orderNumber}
            </Link>
          </h2>
          <p className="font-kral-mono mt-0.5 text-base text-kral-muted md:text-sm">Placed {formatPlacedAt(order.createdAt)}</p>
        </div>
        <OrderStatusChip status={order.status} />
      </header>

      <ul aria-label="Items" className="mt-4 flex flex-col gap-3">
        {order.items.slice(0, MAX_ROWS).map((item) => (
          <li key={item.id} className="font-kral-mono flex gap-3">
            <PhotoImg tone="kral" src={item.imageUrl} alt={item.name} loading="lazy" className={THUMB} />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="line-clamp-2 text-base leading-snug font-medium text-kral-fg [overflow-wrap:anywhere]">{item.name}</p>
              {(item.size || item.color) && <p className="mt-0.5 text-base text-kral-muted [overflow-wrap:anywhere] md:text-sm">{[item.size, item.color].filter(Boolean).join(' · ')}</p>}
              <p className="mt-auto flex items-baseline justify-between gap-3 pt-1 text-base tabular-nums">
                <span className="text-kral-muted md:text-sm">×{item.qty}</span>
                <span className="text-kral-fg">{formatPeso(item.unitPrice)}</span>
              </p>
            </div>
          </li>
        ))}
        {extra > 0 && <li className="font-kral-mono text-base text-kral-muted md:text-sm">+{extra} more {extra === 1 ? 'item' : 'items'}</li>}
      </ul>

      <p className="font-kral-mono mt-4 flex items-baseline justify-end gap-2 border-t border-kral-rule pt-3 text-base text-kral-fg tabular-nums">
        <span className="text-kral-muted md:text-sm">Total {itemsLabel(itemCount(order))}:</span>
        <span className="font-medium">{formatPeso(order.total)}</span>
      </p>

      <footer className="relative z-10 mt-3 flex flex-wrap justify-end gap-2">
        {canCancel(order) && (
          <button type="button" onClick={() => onCancel(order)} className={KRAL_DANGER}>
            Cancel order
          </button>
        )}
        {canBuyAgain(order) && (
          <button type="button" onClick={() => onBuyAgain(order)} disabled={buying} aria-busy={buying} className={KRAL_SECONDARY}>
            {buying ? <SpinnerIcon /> : <CartArrowIcon size={16} />}
            Buy again
          </button>
        )}
        {track && (
          <a href={track} target="_blank" rel="noopener noreferrer" className={KRAL_SECONDARY}>
            <BoxIcon size={16} />
            Track delivery
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
        <Link to={`/orders/${order.id}`} className={KRAL_SECONDARY} aria-label={`View order ${order.orderNumber}`}>
          View order
        </Link>
      </footer>
    </article>
  )
}
