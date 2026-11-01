import { motion, useReducedMotion } from 'motion/react'
import { useRef, type KeyboardEvent } from 'react'
import { DURATION, EASE_OUT } from '../../../motion/tokens'

interface SegmentedTabsProps<T extends string> {
  label: string
  /** Makes the tab ids and the sliding pill unique on a page with more than one set. */
  name: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

/** Tabs like the inventory's Active | Archived: arrows, Home and End move to the next tab and open it; only the open tab is in the Tab order. Wraps on narrow screens. */
export function SegmentedTabs<T extends string>({ label, name, options, value, onChange }: SegmentedTabsProps<T>) {
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
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="font-ui inline-flex flex-wrap rounded-xl border border-line-strong p-0.5">
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
            className={`relative h-11 min-w-11 cursor-pointer rounded-[10px] px-3 text-base font-semibold transition-colors md:text-sm duration-150 ${selected ? 'text-canvas' : 'text-fg hover:bg-line/60 hover:text-chrome-strong'}`}
          >
            {selected && (
              <motion.span
                layoutId={`${name}-tab-pill`}
                aria-hidden="true"
                className="absolute inset-0 rounded-[10px] bg-fg"
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
