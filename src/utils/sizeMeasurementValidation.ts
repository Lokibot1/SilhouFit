import { CATEGORIES, SIZES_BY_CATEGORY } from '../data/products'
import type { MeasurementKey } from '../service/fetchProductList'
import type { SizeMeasurement, SizeMeasurementInput, SizeMeasurementPatch } from '../service/sizeMeasurements'
import { cleanText } from './checkoutValidation'
import { filterText, MEASUREMENT_FIELDS, parseMeasurement } from './productValidation'

export const SIZE_MAX = 20

/**
 * The columns the list and the forms show for each category (a form also keeps one a row already has). Headwear shows the neck because the schema has no head
 * circumference.
 */
export const COLUMNS_BY_CATEGORY: Record<string, MeasurementKey[]> = {
  Hoodie: ['chestWidthCm', 'totalLengthCm', 'shoulderWidthCm', 'sleeveLengthCm', 'neckCm'],
  Shirt: ['chestWidthCm', 'totalLengthCm', 'shoulderWidthCm', 'sleeveLengthCm', 'neckCm'],
  Pants: ['waistWidthCm', 'hipWidthCm', 'inseamCm', 'thighCm', 'totalLengthCm'],
  Shorts: ['waistWidthCm', 'hipWidthCm', 'inseamCm', 'thighCm', 'totalLengthCm'],
  Headwear: ['neckCm'],
}

export const filterSizeLabel = (input: string) => filterText(input, SIZE_MAX)

export interface SizeFormValues {
  category: string
  size: string
  measurements: Record<MeasurementKey, string>
}

export function sizeFormValues(category: string, row?: SizeMeasurement): SizeFormValues {
  return {
    category: row?.category ?? category,
    size: row?.size ?? '',
    measurements: Object.fromEntries(MEASUREMENT_FIELDS.map(({ key }) => [key, String(row?.[key] ?? '')])) as SizeFormValues['measurements'],
  }
}

/** Every problem by field key: `size`, `m:<key>` for one measurement, `measurements` for none filled in. An empty object means it can be sent. */
export function validateSizeForm(v: SizeFormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!(CATEGORIES as readonly string[]).includes(v.category)) errors.category = 'Choose a category.'
  if (!cleanText(v.size)) errors.size = `Enter a size such as ${SIZES_BY_CATEGORY[v.category]?.[0] ?? 'M'}.`
  else if (cleanText(v.size).length > SIZE_MAX) errors.size = `Use ${SIZE_MAX} characters or fewer.`
  let filled = 0
  for (const { key, label, min, max } of MEASUREMENT_FIELDS) {
    const text = v.measurements[key]
    if (!text) continue
    filled += 1
    const value = parseMeasurement(text)
    if (value === null || value < min || value > max) errors[`m:${key}`] = `Enter ${label.toLowerCase()} from ${min} to ${max} cm.`
  }
  if (filled === 0) errors.measurements = 'Enter at least one measurement.'
  return errors
}

/** The request for a new size that passed validation: empty boxes are left out. */
export function buildSizeInput(v: SizeFormValues): SizeMeasurementInput {
  return {
    category: v.category,
    size: cleanText(v.size),
    ...Object.fromEntries(MEASUREMENT_FIELDS.filter(({ key }) => v.measurements[key]).map(({ key }) => [key, parseMeasurement(v.measurements[key])!])),
  }
}

/** Only what differs from `original`; a cleared measurement is `null`. An empty patch means nothing changed. */
export function buildSizePatch(v: SizeFormValues, original: SizeMeasurement): SizeMeasurementPatch {
  const patch: SizeMeasurementPatch = {}
  if (cleanText(v.size) !== original.size) patch.size = cleanText(v.size)
  for (const { key } of MEASUREMENT_FIELDS) {
    const next = v.measurements[key] ? parseMeasurement(v.measurements[key]) : null
    if (next !== original[key]) patch[key] = next
  }
  return patch
}

const NAMED = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']

/** Smallest first: named sizes in garment order, waist numbers by value, anything else (One size) last by name. */
export function compareSizes(a: string, b: string): number {
  const rank = (size: string) => {
    const named = NAMED.indexOf(size.toUpperCase())
    if (named >= 0) return [0, named] as const
    return /^\d+(\.\d+)?$/.test(size) ? ([1, Number(size)] as const) : ([2, 0] as const)
  }
  const [groupA, valueA] = rank(a)
  const [groupB, valueB] = rank(b)
  return groupA - groupB || valueA - valueB || a.localeCompare(b)
}
