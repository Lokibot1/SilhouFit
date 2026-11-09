import { Link } from 'react-router-dom'
import type { CustomerOrder } from '../../service/ordersApi'
import { formatPeso, formatPlacedAt, itemsLabel } from '../../utils/format'
import { canBuyAgain, canCancel, itemCount, trackingLink } from '../../utils/orders'
import { BoxIcon, CartArrowIcon, SpinnerIcon } from '../form/icons'
import { KRAL_DANGER, KRAL_SECONDARY } from '../shop/shopControls'
import { PhotoImg } from '../ui/PhotoImg'
import { OrderStatusChip } from './OrderStatusChip'

const MAX_THUMBS = 3
const THUMB = 'photo-mono h-16 w-12 shrink-0 object-cover sm:h-20 sm:w-16'

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
  const extra = order.items.length - MAX_THUMBS
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

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <ul aria-label="Items" className="flex shrink-0 gap-2">
          {order.items.slice(0, MAX_THUMBS).map((item) => (
            <li key={item.id}>
              <PhotoImg tone="kral" src={item.imageUrl} alt={item.name} loading="lazy" className={THUMB} />
            </li>
          ))}
          {extra > 0 && (
            <li className={`${THUMB} font-kral-mono flex items-center justify-center bg-kral-porcelain text-base text-kral-muted tabular-nums dark:bg-kral-graphite`}>
              <span aria-hidden="true">+{extra}</span>
              <span className="sr-only">and {extra} more</span>
            </li>
          )}
        </ul>
        <div className="font-kral-mono min-w-0 flex-1">
          <p className="text-base leading-snug font-medium text-kral-fg [overflow-wrap:anywhere]">
            {order.items[0]?.name}
            {order.items.length > 1 && <span className="text-kral-muted"> + {order.items.length - 1} more</span>}
          </p>
          <p className="mt-1 text-base text-kral-muted tabular-nums md:text-sm">{itemsLabel(itemCount(order))}</p>
          <p className="mt-2 flex items-baseline justify-between gap-3 text-base text-kral-fg tabular-nums">
            <span className="text-kral-muted md:text-sm">Total</span>
            <span className="font-medium">{formatPeso(order.total)}</span>
          </p>
        </div>
      </div>

      <footer className="relative z-10 mt-4 flex flex-wrap gap-2">
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
