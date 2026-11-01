import { MEASUREMENT_KEYS, type MeasurementKey, type Measurements, type ProductVariant } from '../service/fetchProductList'
import type { CustomSizing } from '../service/customSizings'
import type { SizeMeasurement } from '../service/sizeMeasurements'
import { COLUMNS_BY_CATEGORY, compareSizes } from './sizeMeasurementValidation'

export type SizeGuideSource = 'product' | 'base' | 'none'

export interface SizeGuideRow {
  size: string
  /** Where the values come from: this garment's own measurements, the category's standard ones, or neither (every value is null). */
  source: SizeGuideSource
  values: Measurements
}

export interface SizeGuide {
  columns: MeasurementKey[]
  rows: SizeGuideRow[]
}

const EMPTY = Object.fromEntries(MEASUREMENT_KEYS.map((key) => [key, null])) as Measurements
export const norm = (size: string) => size.trim().toLowerCase()
const hasValue = (m: Measurements | null | undefined): m is Measurements => !!m && MEASUREMENT_KEYS.some((key) => m[key] !== null)

/**
 * One row per real variant size, smallest first. A size takes the first variant of that size that has any measurement (whole row, never
 * mixed field by field with the base); otherwise the category's base row for it; otherwise it has no values. Columns are the category's
 * defaults plus any other measurement a size has of its own.
 * A product with a custom sizing uses that instead of the base rows: its sizes are not the category's, so a size the sizing lacks has no
 * values rather than a wrong standard one. The AR fitting reads garment measurements through this same guide.
 */
export function buildSizeGuide(category: string, variants: ProductVariant[], baseRows: SizeMeasurement[], customSizing?: CustomSizing): SizeGuide {
  // Sizes that differ only in case or spacing are one size; the first-seen trimmed label is shown.
  const labels = new Map<string, string>()
  for (const v of variants) if (v.size && !labels.has(norm(v.size))) labels.set(norm(v.size), v.size.trim())
  const sizes = [...labels.values()].sort(compareSizes)
  const rows = sizes.map((size): SizeGuideRow => {
    const own = variants.find((v) => v.size !== null && norm(v.size) === norm(size) && hasValue(v.measurements))?.measurements
    if (own) return { size, source: 'product', values: own }
    if (customSizing) {
      const custom = customSizing.sizes.find((s) => norm(s.size) === norm(size))
      return custom ? { size, source: 'product', values: { ...EMPTY, ...custom.measurements } } : { size, source: 'none', values: EMPTY }
    }
    const base = baseRows.find((r) => norm(r.size) === norm(size) && hasValue(r))
    return base ? { size, source: 'base', values: base } : { size, source: 'none', values: EMPTY }
  })
  const defaults = COLUMNS_BY_CATEGORY[category] ?? MEASUREMENT_KEYS.filter((key) => baseRows.some((r) => r[key] !== null))
  const columns = MEASUREMENT_KEYS.filter((key) => defaults.includes(key) || rows.some((r) => r.source === 'product' && r.values[key] !== null))
  return { columns, rows }
}
