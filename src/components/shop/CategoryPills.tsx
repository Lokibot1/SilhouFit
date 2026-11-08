import type { Category } from '../../data/products'
import type { CategoryFacet } from '../../service/fetchProductFilters'
import { categoryCount } from '../../utils/categoryCount'
import { CategoryLabel } from './CategoryLabel'
import { KRAL_CHIP } from './shopControls'

interface CategoryPillsProps {
  value: Category | 'all'
  /** Every category to offer, in display order. */
  categories: readonly string[]
  /** Active products per category, or null until known (no numbers show). */
  counts: CategoryFacet[] | null
  onChange: (category: Category | 'all') => void
}

export function CategoryPills({ value, categories, counts, onChange }: CategoryPillsProps) {
  return (
    <div role="group" aria-label="Filter by category" className="-mx-6 overflow-x-auto px-6 py-1">
      <div className="flex w-max gap-2">
        {['all', ...categories].map((category) => {
          const active = category === value
          return (
            <button
              key={category}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(category)}
              className={`${KRAL_CHIP} shrink-0`}
            >
              <CategoryLabel name={category === 'all' ? 'All' : category} count={categoryCount(counts, category)} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
