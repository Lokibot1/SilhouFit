import { motion } from 'motion/react'
import type { Category } from '../../data/products'
import { DURATION, EASE_OUT } from '../../motion/tokens'

interface CategoryPillsProps {
  value: Category | 'all'
  /** Every category to offer, in display order. */
  categories: readonly string[]
  onChange: (category: Category | 'all') => void
}

export function CategoryPills({ value, categories, onChange }: CategoryPillsProps) {
  return (
    <div role="group" aria-label="Filter by category" className="-mx-6 -mb-2 overflow-x-auto px-6 pt-1 pb-3">
      <div className="flex w-max gap-2">
        {['all', ...categories].map((category) => {
          const active = category === value
          return (
            <button
              key={category}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(category)}
              className="pill skeuo skeuo-slide skeuo-gloss relative min-h-9 pointer-coarse:min-h-11 shrink-0 cursor-pointer px-3 py-1 whitespace-nowrap"
            >
              {active && (
                <motion.span
                  layoutId="category-pill"
                  aria-hidden="true"
                  className="skeuo-ink-face skeuo-gloss-face absolute inset-0 rounded-full"
                  transition={{ duration: DURATION.state, ease: EASE_OUT }}
                />
              )}
              <span className="relative">{category === 'all' ? 'All' : category}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
