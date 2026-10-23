import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useReveal } from '../../hooks/useReveal'
import { useSection } from '../../hooks/useSection'
import { DURATION, EASE_OUT, staggerDelay } from '../../motion/tokens'
import { fetchOrderLog, type LoggedOrder } from '../../service/fetchStaffAnalytics'
import { formatOrderTime, formatPeso } from '../../utils/format'
import { SECONDARY_BUTTON } from '../ui/buttonStyles'
import { EmptyNote, SectionBody, StaffSection } from './StaffSection'
import { LOG_PAGE, LOG_ROW, OrderLogSkeleton } from './StaffSkeleton'

/** Who ordered, newest first. The list keeps the order the data comes in. */
export function OrderLog() {
  const section = useSection(fetchOrderLog)

  return (
    <StaffSection id="order-log" title="Recent orders" description="Newest first">
      <SectionBody section={section} what="the recent orders" skeleton={<OrderLogSkeleton />}>
        {(orders) =>
          orders.length === 0 ? (
            <EmptyNote>No orders yet. Customers who order show here as soon as they check out.</EmptyNote>
          ) : (
            <Log orders={orders} />
          )
        }
      </SectionBody>
    </StaffSection>
  )
}

function Log({ orders }: { orders: LoggedOrder[] }) {
  const { ref, inView, reduced } = useReveal<HTMLDivElement>()
  const list = useRef<HTMLOListElement>(null)
  const [shown, setShown] = useState(LOG_PAGE)

  // When the last rows appear the button goes, so focus moves to the first of them instead of dropping.
  useEffect(() => {
    if (shown > LOG_PAGE && shown >= orders.length) (list.current?.children[shown - LOG_PAGE] as HTMLElement | undefined)?.focus({ preventScroll: true })
  }, [shown, orders.length])

  return (
    <div ref={ref}>
      <ol ref={list} aria-describedby="order-log-desc" className="divide-y divide-line">
        {orders.slice(0, shown).map((order, i) => (
          <motion.li
            key={order.orderId}
            tabIndex={-1}
            className={`${LOG_ROW} grid grid-cols-[minmax(0,1fr)_auto] content-center gap-x-3 outline-none @xl:grid-cols-[minmax(0,1fr)_5rem_4.5rem_7rem_8.5rem] @xl:items-center`}
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : undefined}
            transition={{ duration: DURATION.shift, ease: EASE_OUT, delay: reduced ? 0 : staggerDelay(i % LOG_PAGE) }}
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
      {shown < orders.length && (
        <div className="mt-3 flex justify-center">
          <button type="button" onClick={() => setShown((n) => n + LOG_PAGE)} className={SECONDARY_BUTTON}>
            View more
          </button>
        </div>
      )}
    </div>
  )
}
