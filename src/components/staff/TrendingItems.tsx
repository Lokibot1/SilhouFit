import { motion } from 'motion/react'
import { useReveal } from '../../hooks/useReveal'
import { useSection } from '../../hooks/useSection'
import { DURATION, EASE_OUT, staggerDelay } from '../../motion/tokens'
import { LOW_STOCK } from '../../data/products'
import { fetchTrendingItems, type TrendingItem } from '../../service/fetchStaffAnalytics'
import { EmptyNote, SectionBody, StaffSection } from './StaffSection'
import { BAR_ROW, BarsSkeleton, TREND_ROW } from './StaffSkeleton'

/** The five most ordered products this month, as horizontal bars. */
export function TrendingItems() {
  const section = useSection(fetchTrendingItems)

  return (
    <StaffSection id="trending" title="Trendy items" description="Most ordered items this month">
      <SectionBody section={section} what="the trendy items" skeleton={<BarsSkeleton />}>
        {(items) =>
          items.length === 0 ? (
            <EmptyNote>No orders yet this month. The most ordered items show here once the first order is placed.</EmptyNote>
          ) : (
            <BarsFigure items={items} />
          )
        }
      </SectionBody>
    </StaffSection>
  )
}

/** Stock status as text plus a colour cue, so it never relies on colour alone. */
export function stockLabel(stock: number): { kind: 'in' | 'low' | 'out'; text: string } {
  if (stock <= 0) return { kind: 'out', text: 'Sold out' }
  if (stock <= LOW_STOCK) return { kind: 'low', text: `Low stock · ${stock} left` }
  return { kind: 'in', text: 'In stock' }
}

const CHIP = {
  in: { box: 'border-line', dot: 'bg-success' },
  low: { box: 'border-danger', dot: 'bg-danger' },
  out: { box: 'border-danger bg-danger/10', dot: 'bg-danger' },
}

function StockChip({ stock }: { stock: number }) {
  const { kind, text } = stockLabel(stock)
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-xs font-semibold leading-4 text-fg ${CHIP[kind].box}`}>
      <span className={`size-2 rounded-full ${CHIP[kind].dot}`} aria-hidden="true" />
      {text}
    </span>
  )
}

function BarsFigure({ items }: { items: TrendingItem[] }) {
  const { ref, inView, reduced, fade } = useReveal<HTMLElement>()
  const most = Math.max(...items.map((item) => item.orders))

  return (
    <motion.figure ref={ref} {...fade}>
      <ol>
        {items.map((item, i) => (
          <li key={item.productId} className={`${BAR_ROW} ${TREND_ROW}`}>
            <span className="grid size-5 place-items-center rounded-full bg-line text-xs font-semibold tabular-nums text-fg" aria-hidden="true">
              {i + 1}
            </span>
            <div className="flex h-5 items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-fg">{item.name}</span>
              <span className="shrink-0 text-right tabular-nums text-fg">
                {item.orders.toLocaleString('en-PH')} <span className="text-xs text-fg-muted">{item.orders === 1 ? 'order' : 'orders'}</span>
              </span>
            </div>
            <div className="col-start-2 flex h-5 items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-fg-muted">{item.category}</span>
              <StockChip stock={item.stock} />
            </div>
            <div className="col-start-2 h-1.5 rounded-full bg-chart-grid" aria-hidden="true">
              <motion.div
                className="h-full origin-left rounded-full bg-chart-2"
                style={{ width: `${(item.orders / most) * 100}%` }}
                initial={{ scaleX: reduced ? 1 : 0 }}
                animate={inView ? { scaleX: 1 } : undefined}
                transition={{ duration: DURATION.entrance, ease: EASE_OUT, delay: reduced ? 0 : staggerDelay(i) }}
              />
            </div>
            <div className="col-start-2 h-4 truncate text-xs leading-4 text-fg-muted">
              {item.arConversion != null ? (
                <>
                  <span className="tabular-nums">{item.arConversion}%</span> used AR Fitting
                </>
              ) : (
                'No AR Fitting'
              )}
            </div>
          </li>
        ))}
      </ol>
    </motion.figure>
  )
}
