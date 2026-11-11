import { describe, expect, it } from 'vitest'
import { confidentialityProblem, parseKeywords, validateHelpAnswer, type HelpFormValues } from '../../src/utils/helpAnswerValidation'

const valid: HelpFormValues = {
  question: 'Can I return an item?',
  answer: 'Returns follow the refund policy.',
  keywords: 'return, exchange',
  category: 'returns',
  linkTo: '/refund-policy',
  linkLabel: 'Read the refund policy',
  published: true,
}
const errorsOf = (over: Partial<HelpFormValues>) => validateHelpAnswer({ ...valid, ...over })

describe('validateHelpAnswer', () => {
  it('accepts a complete answer, with or without a link', () => {
    expect(errorsOf({})).toEqual({})
    expect(errorsOf({ linkTo: '', linkLabel: '' })).toEqual({})
  })

  it('holds the question to 8 to 120 characters and the answer to 10 to 600', () => {
    expect(errorsOf({ question: '' }).question).toMatch(/Enter/)
    expect(errorsOf({ question: 'Why?' }).question).toMatch(/at least 8/)
    expect(errorsOf({ question: 'x'.repeat(121) }).question).toMatch(/at most 120/)
    expect(errorsOf({ answer: 'Short' }).answer).toMatch(/at least 10/)
    expect(errorsOf({ answer: 'x'.repeat(601) }).answer).toMatch(/at most 600/)
    expect(errorsOf({ answer: 'x'.repeat(600) }).answer).toBeUndefined()
  })

  it('allows at most 10 keywords of 24 letters, digits and spaces', () => {
    expect(errorsOf({ keywords: Array.from({ length: 11 }, (_, n) => `word${n}`).join(',') }).keywords).toMatch(/at most 10/)
    expect(errorsOf({ keywords: 'x'.repeat(25) }).keywords).toMatch(/at most 24/)
    expect(errorsOf({ keywords: 'return, size#' }).keywords).toMatch(/letters, numbers and spaces/)
    expect(errorsOf({ keywords: '' }).keywords).toBeUndefined()
  })

  it('needs link text when a page is chosen, and only takes listed pages', () => {
    expect(errorsOf({ linkLabel: '' }).linkLabel).toMatch(/Enter the text/)
    expect(errorsOf({ linkTo: '/admin/users' as never }).linkTo).toMatch(/listed pages/)
  })

  it('rejects contact details in any text field', () => {
    expect(errorsOf({ answer: 'Write to help@kral.ph for more.' }).answer).toMatch(/email/)
    expect(errorsOf({ question: 'Call 0917 123 4567 to ask' }).question).toMatch(/phone/)
    expect(errorsOf({ linkLabel: 'Visit www.kral.ph' }).linkLabel).toMatch(/web address/)
  })
})

describe('confidentialityProblem', () => {
  it('flags emails, long digit runs, web addresses, staff paths, tags and control characters', () => {
    expect(confidentialityProblem('mail a@b.co')).toMatch(/email/)
    expect(confidentialityProblem('ref 1234567')).toMatch(/phone/)
    expect(confidentialityProblem('ref 123-45-67')).toMatch(/phone/)
    expect(confidentialityProblem('see https://kral.ph')).toMatch(/web address/)
    expect(confidentialityProblem('open /admin/users now')).toMatch(/staff page/)
    expect(confidentialityProblem('open /superadmin/users')).toMatch(/staff page/)
    expect(confidentialityProblem('hi <script>alert(1)</script>')).toMatch(/plain text/)
    expect(confidentialityProblem('bell\u0007')).toMatch(/control/)
  })

  it('lets ordinary text, short numbers and the word staff be', () => {
    expect(confidentialityProblem('Orders ship in 3 to 5 days. Our staff checks sizes 24 to 36.')).toBeNull()
  })
})

describe('parseKeywords', () => {
  it('trims, lowercases, drops empties and repeats', () => {
    expect(parseKeywords(' Return , ,EXCHANGE,return,  size  chart ')).toEqual(['return', 'exchange', 'size chart'])
  })
})
