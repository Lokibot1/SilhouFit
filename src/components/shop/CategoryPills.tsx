import { CATEGORIES, type Category } from '../../data/products'

interface CategoryPillsProps {
  value: Category | 'all'
  counts: Record<Category | 'all', number>
  onChange: (category: Category | 'all') => void
}

export function CategoryPills({ value, counts, onChange }: CategoryPillsProps) {
  return (
    <div role="group" aria-label="Filter by category" className="-mx-6 overflow-x-auto px-6 py-1">
      <div className="flex w-max gap-2">
        {(['all', ...CATEGORIES] as const).map((category) => {
          const active = category === value
          return (
            <button
              key={category}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(category)}
              className={`pill glass-btn min-h-11 shrink-0 cursor-pointer whitespace-nowrap ${
                active ? 'bg-fg text-canvas' : 'bg-fg/5 text-fg hover:bg-fg/10'
              }`}
            >
              {category === 'all' ? 'All' : category}
              <span className="tabular-nums">{counts[category]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
