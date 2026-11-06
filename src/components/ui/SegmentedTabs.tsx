import { motion, useReducedMotion } from 'motion/react'
import { useRef, type KeyboardEvent } from 'react'
import { DURATION, EASE_OUT } from '../../motion/tokens'

interface SegmentedTabsProps<T extends string> {
  /** Names the group for screen readers. */
  label: string
  /** Makes the tab ids and the sliding pill unique on a page with more than one set. */
  name: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  /** A smaller set for tight panels: 28px tall with text-xs on a desktop pointer. Touch and small screens stay 44px. */
  compact?: boolean
}

/**
 * The one tab switcher for Active | Archived, status filters, categories and account types.
 * Every set is the same size: 36px tall on a desktop pointer, 44px on touch and small screens. A tab is at least 64px wide, and wraps on narrow screens.
 * Arrows, Home and End move to the next tab and open it; only the open tab is in the Tab order.
 */
export function SegmentedTabs<T extends string>({ label, name, options, value, onChange, compact }: SegmentedTabsProps<T>) {
  const reduced = useReducedMotion()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function onKeyDown(event: KeyboardEvent) {
    const index = options.findIndex((option) => option.value === value)
    const last = options.length - 1
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key]
    if (next === undefined) return
    event.preventDefault()
    onChange(options[next].value)
    refs.current[options[next].value]?.focus()
  }

  return (
    // The container is rounded-xl (12px) with a 3px border and padding, so a rounded-lg (8px) tab sits almost concentric and no wedge shows at the ends.
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="font-ui inline-flex max-w-full flex-wrap rounded-xl border border-line-strong p-0.5">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[option.value] = node
            }}
            type="button"
            role="tab"
            id={`${name}-tab-${option.value}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`relative cursor-pointer rounded-lg font-semibold transition-colors ${compact ? 'h-7 min-w-12 px-2 text-xs' : 'h-8 min-w-16 px-3 text-sm max-md:text-base'} duration-150 pointer-coarse:h-11 max-md:h-11 ${selected ? 'text-canvas' : 'text-fg hover:bg-line/60 hover:text-chrome-strong'}`}
          >
            {selected && (
              <motion.span
                layoutId={`${name}-tab-pill`}
                aria-hidden="true"
                className="absolute inset-0 bg-fg"
                // The radius is set here, not in a class, so the slide keeps the corners round instead of squashing them.
                style={{ borderRadius: 8 }}
                transition={reduced ? { duration: 0 } : { duration: DURATION.state, ease: EASE_OUT }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
