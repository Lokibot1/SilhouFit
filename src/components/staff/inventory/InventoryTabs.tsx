import { motion, useReducedMotion } from 'motion/react'
import { useRef, type KeyboardEvent } from 'react'
import { DURATION, EASE_OUT } from '../../../motion/tokens'
import { STATUSES, type InventoryStatus } from '../../../utils/inventoryQuery'

const LABEL: Record<InventoryStatus, string> = { active: 'Active', archived: 'Archived' }

/** Active | Archived, as tabs: arrows, Home and End move to the next tab and open it; only the open tab is in the Tab order. */
export function InventoryTabs({ value, onChange }: { value: InventoryStatus; onChange: (status: InventoryStatus) => void }) {
  const reduced = useReducedMotion()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function onKeyDown(event: KeyboardEvent) {
    const index = STATUSES.indexOf(value)
    const next = { ArrowRight: (index + 1) % STATUSES.length, ArrowLeft: (index + STATUSES.length - 1) % STATUSES.length, Home: 0, End: STATUSES.length - 1 }[
      event.key
    ]
    if (next === undefined) return
    event.preventDefault()
    onChange(STATUSES[next])
    refs.current[STATUSES[next]]?.focus()
  }

  return (
    <div role="tablist" aria-label="Product status" onKeyDown={onKeyDown} className="font-ui inline-flex h-9 rounded-xl pointer-coarse:h-auto border border-line-strong p-0.5">
      {STATUSES.map((status) => {
        const selected = status === value
        return (
          <button
            key={status}
            ref={(node) => {
              refs.current[status] = node
            }}
            type="button"
            role="tab"
            id={`inventory-tab-${status}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(status)}
            // 44px tall on touch screens.
            className={`relative h-8 min-w-20 cursor-pointer rounded-[10px] px-3 text-sm font-semibold transition-colors duration-150 pointer-coarse:h-11 ${selected ? 'text-canvas' : 'text-fg hover:bg-line/60 hover:text-chrome-strong'}`}
          >
            {selected && (
              <motion.span
                layoutId="inventory-tab-pill"
                aria-hidden="true"
                className="absolute inset-0 rounded-[10px] bg-fg"
                transition={reduced ? { duration: 0 } : { duration: DURATION.state, ease: EASE_OUT }}
              />
            )}
            <span className="relative">{LABEL[status]}</span>
          </button>
        )
      })}
    </div>
  )
}
