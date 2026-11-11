import { describe, expect, it } from 'vitest'
import type { PublicHelpAnswer } from '../../src/service/helpAnswers'
import { matchAnswers } from '../../src/utils/helpMatch'

const entry = (id: string, question: string, answer: string, keywords: string[] = []): PublicHelpAnswer => ({ id, question, answer, keywords, category: 'orders', link: null })

const ANSWERS = [
  entry('returns', 'Can I return an item?', 'Returns follow the refund policy.', ['return', 'exchange']),
  entry('shipping', 'How long does delivery take?', 'Orders are delivered to the address you give at checkout.', ['shipping', 'courier']),
  entry('sizing', 'How accurate is the sizing?', 'A fit check compares your measurements with the size chart.', ['size', 'fit']),
  entry('pay-gcash', 'Which payments do you accept?', 'You can pay by card or GCash at checkout.', ['payment']),
  entry('pay-cod', 'Do you accept cash on delivery?', 'Payment on delivery is not offered yet.', ['payment']),
]

describe('matchAnswers', () => {
  it('finds the answer for its exact question', () => {
    expect(matchAnswers('Can I return an item?', ANSWERS).best?.id).toBe('returns')
  })

  it('treats refund as return', () => {
    expect(matchAnswers('how do I get a refund', ANSWERS).best?.id).toBe('returns')
  })

  it('ignores case, accents, punctuation and plural endings', () => {
    expect(matchAnswers('SIZES!!', ANSWERS).best?.id).toBe('sizing')
    expect(matchAnswers('Déliveries?', ANSWERS).best?.id).toBe('shipping')
  })

  it('lets a keyword beat a question word', () => {
    // "courier" is only a keyword of shipping; "accept" is a question word of two payment answers.
    const result = matchAnswers('courier accept', ANSWERS)
    expect(result.best?.id).toBe('shipping')
  })

  it('finds nothing for empty text, filler words only, or unknown words', () => {
    for (const text of ['', '   ', 'how do i the', 'zebra giraffe']) expect(matchAnswers(text, ANSWERS)).toEqual({ best: null, related: [] })
  })

  it('offers the tied answers instead of guessing', () => {
    const result = matchAnswers('payment', ANSWERS)
    expect(result.best).toBeNull()
    expect(result.related.map((a) => a.id)).toEqual(['pay-gcash', 'pay-cod'])
  })

  it('does not guess from a word that only appears inside an answer', () => {
    expect(matchAnswers('address', ANSWERS)).toEqual({ best: null, related: [] })
  })

  it('only sees the answers it is given, so a draft left out is never returned', () => {
    const published = ANSWERS.filter((a) => a.id !== 'returns')
    expect(matchAnswers('Can I return an item?', published).best?.id).not.toBe('returns')
  })
})
