import { APPAREL_SIZES } from '../data/products'
import type { MeasurementKey } from '../service/fetchProductList'
import { cleanText } from './checkoutValidation'
import { MEASUREMENT_FIELDS, parseMeasurement } from './productValidation'
import { COLUMNS_BY_CATEGORY } from './sizeMeasurementValidation'

export const SIZING_ROWS_MAX = 10

export interface SizingRow {
  id: string
  size: string
  measurements: Record<MeasurementKey, string>
}

/** What is typed in the custom sizing form. */
export interface SizingDraft {
  rows: SizingRow[]
}

let nextRow = 0
const emptyMeasurements = () => Object.fromEntries(MEASUREMENT_FIELDS.map(({ key }) => [key, ''])) as Record<MeasurementKey, string>
export const newSizingRow = (size = ''): SizingRow => ({ id: `r${++nextRow}`, size, measurements: emptyMeasurements() })
export const newSizingDraft = (): SizingDraft => ({ rows: ['S', 'M', 'L'].map(newSizingRow) })

/** The measurements a category's custom sizing asks for (the same columns as its base sizes). */
export const sizingColumns = (category: string) => MEASUREMENT_FIELDS.filter(({ key }) => (COLUMNS_BY_CATEGORY[category] ?? []).includes(key))

/** The size labels of a draft: trimmed, empty and repeated ones dropped. */
export const draftSizes = (draft: SizingDraft) => [...new Set(draft.rows.map((r) => cleanText(r.size)).filter(Boolean))]

/** Every problem by key: `size:<rowId>`, `row:<rowId>` (no measurement filled in), `m:<rowId>:<measurementKey>`. An empty object means it can be sent. */
export function validateSizingDraft(draft: SizingDraft, category: string): Record<string, string> {
  const errors: Record<string, string> = {}
  const seen = new Set<string>()
  for (const row of draft.rows) {
    const size = cleanText(row.size)
    if (!size) errors[`size:${row.id}`] = 'Enter a size such as S.'
    else if (seen.has(size.toLowerCase())) errors[`size:${row.id}`] = `${size} is listed twice. Give each size its own name.`
    else if (!APPAREL_SIZES.includes(size)) errors[`size:${row.id}`] = 'Use one of XS, S, M, L, XL, 2XL, 3XL or Free Size.'
    seen.add(size.toLowerCase())

    let filled = 0
    for (const { key, label, min, max } of sizingColumns(category)) {
      if (!row.measurements[key]) continue
      filled += 1
      const value = parseMeasurement(row.measurements[key])
      if (value === null || value < min || value > max) errors[`m:${row.id}:${key}`] = `Enter ${label.toLowerCase()} from ${min} to ${max} cm.`
    }
    if (filled === 0) errors[`row:${row.id}`] = 'Enter at least one measurement for this size.'
  }
  return errors
}

/** The sizes and measurements a valid draft makes: the numbers each variant of that size is sent with. */
export const buildCustomSizing = (draft: SizingDraft, category: string) => ({
  sizes: draft.rows.map((row) => ({
    size: cleanText(row.size),
    measurements: Object.fromEntries(sizingColumns(category).filter(({ key }) => row.measurements[key]).map(({ key }) => [key, parseMeasurement(row.measurements[key])!])) as Partial<Record<MeasurementKey, number>>,
  })),
})
