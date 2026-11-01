import type { CategoryFacet } from '../service/fetchProductFilters'

/** How many active products `category` has ('all' is the total); undefined until the counts are known, so no number shows. */
export function categoryCount(counts: CategoryFacet[] | null, category: string) {
  if (!counts) return undefined
  if (category === 'all') return counts.reduce((sum, c) => sum + c.count, 0)
  return counts.find((c) => c.name.toLowerCase() === category.toLowerCase())?.count ?? 0
}
