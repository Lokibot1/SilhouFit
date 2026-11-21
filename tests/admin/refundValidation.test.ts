import { describe, expect, it } from 'vitest'
import { REFUND_LIMITS, sanitizeText, validateResolution } from '../../src/utils/refundValidation'

describe('validateResolution', () => {
  it('needs a reference, not counting the spaces around it', () => {
    expect(validateResolution({ manualReference: '', notes: '' }).manualReference).toMatch(/^Enter the reference/)
    expect(validateResolution({ manualReference: '   ', notes: '' }).manualReference).toMatch(/^Enter the reference/)
    expect(validateResolution({ manualReference: ' BDO-1234 ', notes: '' })).toEqual({})
  })

  it('limits the reference to 128 and the notes to 500 characters', () => {
    expect(validateResolution({ manualReference: 'a'.repeat(REFUND_LIMITS.referenceMax), notes: 'n'.repeat(REFUND_LIMITS.notesMax) })).toEqual({})
    const errors = validateResolution({ manualReference: 'a'.repeat(REFUND_LIMITS.referenceMax + 1), notes: 'n'.repeat(REFUND_LIMITS.notesMax + 1) })
    expect(errors.manualReference).toBe('The reference can be at most 128 characters.')
    expect(errors.notes).toBe('The notes can be at most 500 characters.')
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
