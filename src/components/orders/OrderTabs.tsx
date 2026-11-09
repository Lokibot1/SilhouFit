import { useEffect, useRef } from 'react'
import { ORDER_TABS, type OrderTab } from '../../utils/orders'
import { KRAL_CHIP } from '../shop/shopControls'

interface OrderTabsProps {
  tab: OrderTab
  /** How many orders each tab holds. */
  counts: Record<OrderTab, number>
  onChange: (tab: OrderTab) => void
}

/** The status tabs as a row of chips that scrolls sideways on a phone (the page itself never does), fading out at the right edge. */
export function OrderTabs({ tab, counts, onChange }: OrderTabsProps) {
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    row.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [tab])
  return (
    <div className="-mx-6 max-md:[mask-image:linear-gradient(to_right,transparent,#000_1.5rem,#000_calc(100%-2rem),transparent)] md:mx-0">
      <div ref={row} role="group" aria-label="Order status" className="flex gap-2 overflow-x-auto px-6 py-1 md:flex-wrap md:overflow-visible md:px-0">
        {ORDER_TABS.map(({ id, label }) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => onChange(id)} className={`${KRAL_CHIP} shrink-0 tabular-nums`}>
            {label} ({counts[id]})
          </button>
        ))}
      </div>
    </div>
  )
}
