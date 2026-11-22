import { describe, expect, it } from 'vitest'
import { ProductListError } from '../../src/service/fetchProductList'
import { createFailureReason, manageFailureReason, sizingFailure } from '../../src/service/inventoryActions'

const SIZE = [
  'size is required',
  'size must be one of the allowed apparel sizes: XS, S, M, L, XL, 2XL, 3XL, Free Size',
  'Variant size is required',
  'Size "XXL" is not an allowed apparel size. Allowed sizes are: XS, S, M, L, XL, 2XL, 3XL, Free Size',
]
const MEASUREMENTS = [
  'Measurements are required for variant "Navy M". Provide at least one garment measurement or enable inheritBaseMeasurements.',
  'No active base size measurement found for category "Hoodie" and size "S" (variant "Navy S"). Provide explicit measurements or create a base size measurement first.',
  'Base size measurement for category "Hoodie" and size "S" has no measurement values defined.',
]

describe('sizingFailure', () => {
  it.each(SIZE)('puts "%s" on the size', (detail) => {
    expect(sizingFailure(detail)?.field).toBe('size')
  })
  it.each(MEASUREMENTS)('puts "%s" on the measurements, even when it also names a size', (detail) => {
    expect(sizingFailure(detail)?.field).toBe('measurements')
  })
  it('leaves other 400s alone', () => {
    for (const detail of [undefined, '', 'name must be longer than 2 characters', 'basePrice must be a positive number', 'sizes is not a field']) expect(sizingFailure(detail)).toBeNull()
  })
  it('explains what happened and what to do, without the API names', () => {
    for (const detail of [...SIZE, ...MEASUREMENTS]) {
      const { reason } = sizingFailure(detail)!
      expect(reason).not.toMatch(/inheritBaseMeasurements|apparel|variants\.\d|statusCode/)
      expect(reason).toMatch(/\b(Choose|Enter)\b/)
    }
  })
  it('is what the failure reasons say for a 400, and other 400s keep the server text', () => {
    const rejected = (detail: string) => new ProductListError('validation', detail, 400)
    expect(manageFailureReason(rejected(SIZE[0]), 'add-variant')).toBe(sizingFailure(SIZE[0])!.reason)
    expect(createFailureReason(rejected(MEASUREMENTS[1]), 'create')).toBe(sizingFailure(MEASUREMENTS[1])!.reason)
    expect(manageFailureReason(rejected('name is too long'), 'add-variant')).toBe('The server rejected the change: name is too long. Check what you entered, then try again.')
  })
})
