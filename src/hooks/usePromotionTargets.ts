import { useCallback } from 'react'
import { fetchShopProducts } from '../service/fetchShopProducts'
import type { RequestOptions } from '../service/simulateRequest'
import { facets } from './useShopColours'
import { useDebouncedValue } from './useDebouncedValue'
import { useSection } from './useSection'

/** Products shown per search; the picker says when there are more. */
export const PICKER_PAGE = 8

const loadCategories = () => facets().then((found) => found.categories.map((category) => category.name))

/** The real product categories from GET /products/filters, kept for the session and shared with the shop's filters; a failure can be retried. */
export function useProductCategories() {
  return useSection(loadCategories)
}

/** Products matching `text` (debounced) from GET /products, as their own section. */
export function useProductSearch(text: string) {
  const search = useDebouncedValue(text.trim(), 300)
  const load = useCallback((options: RequestOptions) => fetchShopProducts({ search: search || undefined, sortBy: 'name', sortOrder: 'asc', limit: PICKER_PAGE }, options), [search])
  const section = useSection(load)
  /** True while the box holds text the list does not reflect yet. */
  const waiting = text.trim() !== search
  return { ...section, search, waiting }
}
