import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ORDER_TABS, type OrderTab } from '../../utils/orders'

interface OrderTabsProps {
  tab: OrderTab
  onChange: (tab: OrderTab) => void
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** The status tabs as a row that scrolls sideways on a phone (the page itself never does). The row bleeds to the screen edge with no fade, so the next tab shows cut off and says there is more. One underline slides to the chosen tab. */
export function OrderTabs({ tab, onChange }: OrderTabsProps) {
  const row = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)
  const settled = useRef(false)

  useLayoutEffect(() => {
    const place = () => {
      const active = row.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (active) setBar({ left: active.offsetLeft, width: active.offsetWidth })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [tab])

  useEffect(() => {
    const active = row.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: settled.current && !reducedMotion() ? 'smooth' : 'auto' })
    settled.current = true
  }, [tab])

  return (
    <div>
      <div ref={row} role="group" aria-label="Order status" className="relative flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b border-kral-rule pl-6 md:overflow-visible md:px-0">
        {ORDER_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => onChange(id)}
            className="kral-focus font-kral-mono flex min-h-11 shrink-0 cursor-pointer items-center px-2.5 text-sm font-medium whitespace-nowrap text-kral-muted uppercase transition-colors duration-200 ease-out hover:text-kral-fg aria-pressed:text-kral-fg motion-reduce:transition-none md:px-3 md:text-xs md:tracking-[0.08em]"
          >
            {label}
          </button>
        ))}
        {bar && (
          <span
            aria-hidden="true"
            style={{ transform: `translateX(${bar.left}px)`, width: bar.width }}
            className={`pointer-events-none absolute bottom-0 left-0 h-0.5 bg-kral-fg transition-[transform,width] duration-300 ease-out motion-reduce:transition-none`}
          />
        )}
      </div>
    </div>
  )
}
