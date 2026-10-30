import { describe, expect, it } from 'vitest'
import { REFUND_LIMITS, sanitizeText, validateApproval, validateRejection } from '../../src/utils/refundValidation'

const TOTAL = 1250
const amountError = (amount: string) => validateApproval({ amount, note: '' }, TOTAL).amount

describe('validateApproval', () => {
  it('accepts an amount from 0.01 up to the order total', () => {
    for (const amount of ['0.01', '1', '600.5', '1249.99', '1250', '1250.00']) expect(amountError(amount)).toBeUndefined()
  })

  it('asks for an amount when it is empty', () => {
    expect(amountError('')).toBe('Enter the amount to refund.')
    expect(amountError('   ')).toBe('Enter the amount to refund.')
  })

  it('refuses 0 and anything that is not pesos with at most 2 decimals', () => {
    expect(amountError('0')).toBe('The refund must be more than ₱0.00.')
    expect(amountError('0.00')).toBe('The refund must be more than ₱0.00.')
    for (const amount of ['1.234', 'abc', '12a', '-5', '1e3', '1,250', '.5']) expect(amountError(amount)).toBe('Use pesos with at most 2 decimals, such as 1250 or 1250.50.')
  })

  it('refuses more than the order total and names the total', () => {
    expect(amountError('1250.01')).toBe('Enter an amount of at most ₱1,250.00, the order total.')
    expect(amountError('99999')).toBe('Enter an amount of at most ₱1,250.00, the order total.')
  })

  it('limits the note', () => {
    expect(validateApproval({ amount: '10', note: 'a'.repeat(REFUND_LIMITS.noteMax) }, TOTAL).note).toBeUndefined()
    expect(validateApproval({ amount: '10', note: 'a'.repeat(REFUND_LIMITS.noteMax + 1) }, TOTAL).note).toBe(`The note can be at most ${REFUND_LIMITS.noteMax} characters.`)
  })
})

describe('validateRejection', () => {
  const reasonOf = (reason: string) => validateRejection({ reason }).reason

  it('needs a reason of 10 to 300 characters, not counting the spaces around it', () => {
    expect(reasonOf('')).toMatch(/^Enter why this request is rejected/)
    expect(reasonOf('   ')).toMatch(/^Enter why/)
    expect(reasonOf('too short')).toBe('Use at least 10 characters so the reason is clear.')
    expect(reasonOf(' '.repeat(5) + 'short' + ' '.repeat(5))).toBe('Use at least 10 characters so the reason is clear.')
    expect(reasonOf('a'.repeat(REFUND_LIMITS.reasonMin))).toBeUndefined()
    expect(reasonOf('a'.repeat(REFUND_LIMITS.reasonMax))).toBeUndefined()
    expect(reasonOf('a'.repeat(REFUND_LIMITS.reasonMax + 1))).toBe(`The reason can be at most ${REFUND_LIMITS.reasonMax} characters.`)
  })
})

describe('sanitizeText', () => {
  it('strips emoji, collapses spaces and line breaks, drops leading space and cuts at the limit', () => {
    expect(sanitizeText('Worn 👕 and   washed', 50)).toBe('Worn and washed')
    expect(sanitizeText('line one\n\nline two', 50)).toBe('line one line two')
    expect(sanitizeText('   hello', 50)).toBe('hello')
    expect(sanitizeText('abcdef', 3)).toBe('abc')
  })
})
