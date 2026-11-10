import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useReveal } from '../../hooks/useReveal'
import { useSection } from '../../hooks/useSection'
import { DURATION, EASE_OUT, staggerDelay } from '../../motion/tokens'
import { fetchAdminOrders } from '../../service/adminOrdersApi'
import type { LoggedOrder } from '../../service/fetchStaffAnalytics'
import type { RequestOptions } from '../../service/simulateRequest'
import { formatOrderTime, formatPeso } from '../../utils/format'
import { ViewAllLink } from './ViewAllLink'
import { EmptyNote, SectionBody, StaffSection } from './StaffSection'
import { LOG_ROW, LOG_ROWS, LOG_ROWS_NARROW, LOG_ROW_HIDDEN, OrderLogSkeleton } from './StaffSkeleton'

// The latest orders from GET /admin/orders, which is already newest first.
const fetchRecentOrders = async (options: RequestOptions): Promise<LoggedOrder[]> =>
  (await fetchAdminOrders({ limit: LOG_ROWS }, options)).data.map((order) => ({
    orderId: order.orderNumber,
    customerName: order.customerName,
    placedAt: order.placedAt,
    itemCount: order.itemCount,
    total: order.total,
  }))

/** Who ordered, newest first. The list keeps the order the data comes in. `compact` is for a tile that shares its column: it takes a fixed height below xl and fills its half from xl, and the list scrolls. `viewAll` is the page the tile links to. */
export function OrderLog({ compact = false, viewAll }: { compact?: boolean; viewAll?: string }) {
  const section = useSection(fetchRecentOrders)
  const body = (content: ReactNode) => (compact ? <div className="h-80 overflow-y-auto xl:h-auto xl:min-h-0 xl:flex-1">{content}</div> : content)

  return (
    <StaffSection
      id="order-log"
      title="Recent orders"
      description="Newest first"
      action={viewAll ? <ViewAllLink to={viewAll} what="online orders" /> : undefined}
    >
      <SectionBody section={section} what="the recent orders" skeleton={body(<OrderLogSkeleton />)}>
        {(orders) =>
          orders.length === 0 ? (
            <EmptyNote>No orders yet. Customers who order show here as soon as they check out.</EmptyNote>
          ) : (
            body(<Log orders={orders} />)
          )
        }
      </SectionBody>
    </StaffSection>
  )
}

function Log({ orders }: { orders: LoggedOrder[] }) {
  const { ref, inView, reduced } = useReveal<HTMLDivElement>()

  return (
    <div ref={ref}>
      <ol aria-describedby="order-log-desc" className="divide-y divide-line">
        {orders.map((order, i) => (
          <motion.li
            key={order.orderId}
            className={`${LOG_ROW} ${LOG_ROW_HIDDEN} grid grid-cols-[minmax(0,1fr)_auto] content-center gap-x-3 @xl:grid-cols-[minmax(0,1fr)_9.5rem_4rem_6rem_6.5rem] @xl:items-center`}
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : undefined}
            transition={{ duration: DURATION.shift, ease: EASE_OUT, delay: reduced ? 0 : staggerDelay(i % LOG_ROWS_NARROW) }}
          >
            <span className="col-start-1 row-start-1 truncate text-sm font-semibold text-fg @xl:col-start-1">{order.customerName}</span>
            <span className="col-start-1 row-start-2 truncate font-mono text-xs text-fg-muted @xl:col-start-2 @xl:row-start-1">{order.orderId}</span>
            <span className="col-start-2 row-start-2 text-right text-xs tabular-nums text-fg-muted @xl:col-start-3 @xl:row-start-1">
              {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
            </span>
            <span className="col-start-2 row-start-1 text-right text-sm font-semibold tabular-nums text-fg @xl:col-start-4">{formatPeso(order.total)}</span>
            <time dateTime={order.placedAt} className="col-start-1 row-start-3 text-xs tabular-nums text-fg-muted @xl:col-start-5 @xl:row-start-1 @xl:text-right">
              {formatOrderTime(order.placedAt)}
            </time>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
