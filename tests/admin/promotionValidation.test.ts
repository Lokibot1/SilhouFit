import { describe, expect, it } from 'vitest'
import { statusOf } from '../../src/service/promotions'
import { sanitizeCode, sanitizeName, validatePromotion, type PromotionFormValues } from '../../src/utils/promotionValidation'

const valid: PromotionFormValues = {
  name: 'Payday Sale',
  code: 'PAYDAY15',
  type: 'percent',
  value: '15',
  appliesTo: { scope: 'all' },
  startsAt: '2026-10-01',
  endsAt: '2026-10-31',
  usageLimit: '',
  minSpend: '',
}
const errorsOf = (over: Partial<PromotionFormValues>, existing: { id: string; code: string }[] = [], editingId?: string) =>
  validatePromotion({ ...valid, ...over }, existing, editingId)

describe('statusOf', () => {
  const dates = { startsAt: '2026-10-10', endsAt: '2026-10-20', endedEarlyAt: null }
  it('includes both the first and the last day', () => {
    expect(statusOf(dates, '2026-10-09')).toBe('scheduled')
    expect(statusOf(dates, '2026-10-10')).toBe('active')
    expect(statusOf(dates, '2026-10-20')).toBe('active')
    expect(statusOf(dates, '2026-10-21')).toBe('ended')
  })
  it('is ended once it was ended early, whatever the dates say', () => {
    expect(statusOf({ ...dates, endedEarlyAt: '2026-10-15T10:00:00+08:00' }, '2026-10-15')).toBe('ended')
    expect(statusOf({ ...dates, endedEarlyAt: '2026-10-05T10:00:00+08:00' }, '2026-10-05')).toBe('ended')
  })
})

describe('validatePromotion', () => {
  it('accepts a complete promotion', () => {
    expect(errorsOf({})).toEqual({})
  })

  it('takes a percent from 1 to 90, whole', () => {
    expect(errorsOf({ value: '1' }).value).toBeUndefined()
    expect(errorsOf({ value: '90' }).value).toBeUndefined()
    expect(errorsOf({ value: '0' }).value).toBe('Percent off must be from 1 to 90.')
    expect(errorsOf({ value: '91' }).value).toBe('Percent off must be from 1 to 90.')
    expect(errorsOf({ value: '12.5' }).value).toMatch(/whole number/)
    expect(errorsOf({ value: '' }).value).toBe('Enter how many percent off.')
  })

  it('takes pesos above 0 with at most 2 decimals, up to 100,000', () => {
    const fixed = { type: 'fixed' as const }
    expect(errorsOf({ ...fixed, value: '0' }).value).toBe('Pesos off must be more than 0.')
    expect(errorsOf({ ...fixed, value: '0.01' }).value).toBeUndefined()
    expect(errorsOf({ ...fixed, value: '199.50' }).value).toBeUndefined()
    expect(errorsOf({ ...fixed, value: '1.234' }).value).toMatch(/2 decimals/)
    expect(errorsOf({ ...fixed, value: '100000' }).value).toBeUndefined()
    expect(errorsOf({ ...fixed, value: '100001' }).value).toMatch(/at most/)
  })

  it('lets a sale end on its start date but not before it', () => {
    expect(errorsOf({ endsAt: '2026-10-01' }).endsAt).toBeUndefined()
    expect(errorsOf({ endsAt: '2026-09-30' }).endsAt).toBe("End date can't be before the start date.")
    expect(errorsOf({ endsAt: '2026-10-02' }).endsAt).toBeUndefined()
    expect(errorsOf({ startsAt: '' }).startsAt).toBeDefined()
  })

  it('takes a code of 4 to 20 capital letters and numbers that no other promotion uses', () => {
    expect(errorsOf({ code: 'ABC' }).code).toBe('Use 4 to 20 characters for the code.')
    expect(errorsOf({ code: 'ABCD' }).code).toBeUndefined()
    expect(errorsOf({ code: 'A'.repeat(20) }).code).toBeUndefined()
    expect(errorsOf({ code: 'A'.repeat(21) }).code).toBe('Use 4 to 20 characters for the code.')
    expect(errorsOf({ code: 'SALE-20' }).code).toBe('A code can only have capital letters and numbers.')
    expect(errorsOf({ code: '' }).code).toBe('Enter the code shoppers will type at checkout.')
    const existing = [{ id: 'a', code: 'PAYDAY15' }]
    expect(errorsOf({}, existing).code).toMatch(/already uses this code/)
    expect(errorsOf({}, existing, 'a').code).toBeUndefined()
  })

  it('checks the optional limits only when they are filled in', () => {
    expect(errorsOf({ usageLimit: '0' }).usageLimit).toMatch(/at least 1/)
    expect(errorsOf({ usageLimit: '1' }).usageLimit).toBeUndefined()
    expect(errorsOf({ usageLimit: '1.5' }).usageLimit).toMatch(/whole number/)
    expect(errorsOf({ minSpend: '0' }).minSpend).toBeUndefined()
    expect(errorsOf({ minSpend: '10.999' }).minSpend).toMatch(/2 decimals/)
  })

  it('needs a category in category mode and 1 to 20 products in products mode', () => {
    expect(errorsOf({ appliesTo: { scope: 'category', category: '' } }).appliesTo).toBe('Choose the category this promotion applies to.')
    expect(errorsOf({ appliesTo: { scope: 'category', category: 'Denim' } }).appliesTo).toBeUndefined()
    const product = (n: number) => ({ id: `p${n}`, name: `Product ${n}` })
    expect(errorsOf({ appliesTo: { scope: 'products', products: [] } }).appliesTo).toBe('Add at least 1 product to put on sale.')
    expect(errorsOf({ appliesTo: { scope: 'products', products: [product(1)] } }).appliesTo).toBeUndefined()
    expect(errorsOf({ appliesTo: { scope: 'products', products: Array.from({ length: 20 }, (_, n) => product(n)) } }).appliesTo).toBeUndefined()
    expect(errorsOf({ appliesTo: { scope: 'products', products: Array.from({ length: 21 }, (_, n) => product(n)) } }).appliesTo).toBe('Choose at most 20 products.')
  })

  it('needs a name of 3 to 40 characters', () => {
    expect(errorsOf({ name: '  ' }).name).toBeDefined()
    expect(errorsOf({ name: 'ab' }).name).toBe('Use at least 3 characters for the name.')
    expect(errorsOf({ name: 'abc' }).name).toBeUndefined()
  })
})

describe('sanitizing', () => {
  it('turns a code into capital letters and numbers, at most 20', () => {
    expect(sanitizeCode('sale 5!-x\u{1F600}')).toBe('SALE5X')
    expect(sanitizeCode('a'.repeat(30))).toHaveLength(20)
  })
  it('keeps letters, numbers and single spaces in a name', () => {
    expect(sanitizeName('  Big   Sale 2026! \u{1F600}')).toBe('Big Sale 2026 ')
    expect(sanitizeName('x'.repeat(50))).toHaveLength(40)
  })
})
