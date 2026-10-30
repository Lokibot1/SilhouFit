import { formatPeso } from '../../../utils/format'
import { GENDERS, type InventoryQuery } from '../../../utils/inventoryQuery'

export const STOCK_OPTIONS = [
  { value: '', label: 'All stock levels' },
  { value: 'in', label: 'In stock' },
  // These two need backend fields and send nothing yet.
  { value: 'out', label: 'Out of stock' },
  { value: 'sizes', label: 'Has out-of-stock sizes' },
]
export const AR_OPTIONS = [
  { value: '', label: 'All products' },
  { value: 'yes', label: 'AR Fitting ready' },
  { value: 'no', label: 'Not AR ready' },
]
export const GENDER_OPTIONS = [{ value: '', label: 'All genders' }, ...GENDERS]

/** One removable chip per filter that is set, with the URL change that removes it. */
export function filterChips(query: InventoryQuery) {
  const label = (options: { value: string; label: string }[], value: string) => (value ? (options.find((o) => o.value === value)?.label ?? value) : '')
  const price =
    query.minPrice !== undefined && query.maxPrice !== undefined
      ? `${formatPeso(query.minPrice)} to ${formatPeso(query.maxPrice)}`
      : query.minPrice !== undefined
        ? `From ${formatPeso(query.minPrice)}`
        : query.maxPrice !== undefined
          ? `Up to ${formatPeso(query.maxPrice)}`
          : ''
  const chips: { kind: string; text: string; changes: Record<string, string> }[] = [
    { kind: 'category', text: query.category, changes: { category: '' } },
    { kind: 'gender', text: label(GENDER_OPTIONS, query.gender), changes: { gender: '' } },
    { kind: 'brand', text: query.brand, changes: { brand: '' } },
    { kind: 'size', text: query.size, changes: { size: '' } },
    { kind: 'color', text: query.color, changes: { color: '' } },
    { kind: 'price', text: price, changes: { minPrice: '', maxPrice: '' } },
    { kind: 'stock', text: label(STOCK_OPTIONS, query.stock), changes: { stock: '' } },
    { kind: 'AR Fitting', text: label(AR_OPTIONS, query.ar), changes: { ar: '' } },
  ]
  return chips.filter((chip) => chip.text)
}
