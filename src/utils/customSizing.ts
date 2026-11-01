import type { MeasurementKey } from '../service/fetchProductList'
import type { CustomSizing } from '../service/customSizings'
import { cleanText } from './checkoutValidation'
import { filterText, MEASUREMENT_FIELDS, parseMeasurement } from './productValidation'
import { COLUMNS_BY_CATEGORY, SIZE_MAX } from './sizeMeasurementValidation'

export const SIZING_NAME_MAX = 40
export const SIZING_ROWS_MAX = 10

export interface SizingRow {
  id: string
  size: string
  measurements: Record<MeasurementKey, string>
}

/** What is typed in the custom sizing form. */
export interface SizingDraft {
  name: string
  rows: SizingRow[]
}

let nextRow = 0
const emptyMeasurements = () => Object.fromEntries(MEASUREMENT_FIELDS.map(({ key }) => [key, ''])) as Record<MeasurementKey, string>
export const newSizingRow = (size = ''): SizingRow => ({ id: `r${++nextRow}`, size, measurements: emptyMeasurements() })
export const newSizingDraft = (): SizingDraft => ({ name: '', rows: ['S', 'M', 'L'].map(newSizingRow) })

/** Letters, numbers, spaces and hyphens only. */
export const filterSizingName = (input: string) => filterText(input.replace(/[^\p{L}\p{N} -]/gu, ''), SIZING_NAME_MAX)

/** The measurements a category's custom sizing asks for (the same columns as its base sizes). */
export const sizingColumns = (category: string) => MEASUREMENT_FIELDS.filter(({ key }) => (COLUMNS_BY_CATEGORY[category] ?? []).includes(key))

/** The size labels of a draft: trimmed, empty and repeated ones dropped. */
export const draftSizes = (draft: SizingDraft) => [...new Set(draft.rows.map((r) => cleanText(r.size)).filter(Boolean))]

/**
 * Every problem by key: `name`, `size:<rowId>`, `row:<rowId>` (no measurement filled in), `m:<rowId>:<measurementKey>`.
 * `takenNames` are the names the category already uses. An empty object means it can be saved.
 */
export function validateSizingDraft(draft: SizingDraft, category: string, takenNames: string[]): Record<string, string> {
  const errors: Record<string, string> = {}
  const name = cleanText(draft.name)
  if (name.length < 2) errors.name = 'Enter a name of 2 to 40 characters, such as "Hoodie Custom".'
  else if (takenNames.some((taken) => taken.toLowerCase() === name.toLowerCase())) errors.name = `${category} already has a custom sizing called ${name}. Use a different name.`

  const seen = new Set<string>()
  for (const row of draft.rows) {
    const size = cleanText(row.size)
    if (!size) errors[`size:${row.id}`] = 'Enter a size such as S.'
    else if (size.length > SIZE_MAX) errors[`size:${row.id}`] = `Use ${SIZE_MAX} characters or fewer.`
    else if (seen.has(size.toLowerCase())) errors[`size:${row.id}`] = `${size} is listed twice. Give each size its own name.`
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

/** The draft an existing sizing is edited as. */
export const draftFromSizing = (sizing: CustomSizing): SizingDraft => ({
  name: sizing.name,
  rows: sizing.sizes.map(({ size, measurements }) => ({
    ...newSizingRow(size),
    measurements: { ...emptyMeasurements(), ...Object.fromEntries(Object.entries(measurements).map(([key, value]) => [key, String(value)])) },
  })),
})

/** The custom sizing a valid draft makes. */
export function buildCustomSizing(draft: SizingDraft, category: string): Omit<CustomSizing, 'id' | 'createdAt' | 'isActive'> {
  return {
    category,
    name: cleanText(draft.name),
    sizes: draft.rows.map((row) => ({
      size: cleanText(row.size),
      measurements: Object.fromEntries(sizingColumns(category).filter(({ key }) => row.measurements[key]).map(({ key }) => [key, parseMeasurement(row.measurements[key])!])),
    })),
  }
}
