import { describe, expect, it } from 'vitest'
import { PROFANITY_ERROR } from '../../src/utils/profanity'
import { checkReviewFile, filterReviewText, REVIEW_LIMITS, validateReview } from '../../src/utils/reviewValidation'

const MB = 1024 * 1024
const file = (name: string, type: string, size = 1000) => ({ name, type, size })

describe('validateReview', () => {
  it.each([0, 6, 2.5, NaN])('rejects a rating of %s', (rating) => {
    expect(validateReview({ rating, text: 'Fits very well.' }).rating).toBe('Choose 1 to 5 stars.')
  })
  it.each([1, 5])('accepts a rating of %s', (rating) => {
    expect(validateReview({ rating, text: 'Fits very well.' })).toEqual({})
  })
  it('needs 10 characters of text, counted after trimming', () => {
    expect(validateReview({ rating: 4, text: 'a'.repeat(9) }).text).toMatch(/at least 10 characters/)
    expect(validateReview({ rating: 4, text: `  ${'a'.repeat(9)}  ` }).text).toMatch(/at least 10 characters/)
    expect(validateReview({ rating: 4, text: 'a'.repeat(10) })).toEqual({})
    expect(validateReview({ rating: 4, text: '   ' }).text).toMatch(/Enter a few words/)
  })
  it('blocks profanity without repeating the word', () => {
    expect(validateReview({ rating: 1, text: 'this is fucking terrible' }).text).toBe(PROFANITY_ERROR)
  })
  it('allows emoji', () => {
    expect(validateReview({ rating: 5, text: 'Love it 😍😍😍' })).toEqual({})
  })
})

describe('filterReviewText', () => {
  it('caps at 1000 characters', () => {
    expect(filterReviewText('a'.repeat(1001))).toHaveLength(REVIEW_LIMITS.textMax)
  })
  it('removes control characters but keeps line breaks and emoji', () => {
    expect(filterReviewText('a\u0000b\u0007c\td\ne 😍')).toBe('abcd\ne 😍')
  })
  it('collapses three or more line breaks to one blank line', () => {
    expect(filterReviewText('a\n\n\n\nb')).toBe('a\n\nb')
  })
  it('does not leave half an emoji when it cuts', () => {
    expect(filterReviewText(`${'a'.repeat(999)}😍`)).toBe('a'.repeat(999))
  })
})

describe('checkReviewFile', () => {
  it('accepts JPG, PNG and WebP photos', () => {
    for (const f of [file('a.jpg', 'image/jpeg'), file('a.png', 'image/png'), file('a.webp', 'image/webp')]) {
      expect(checkReviewFile(f, 0), f.name).toBeNull()
    }
  })
  it('rejects a gif, a wrong MIME type and a video, saying what to do', () => {
    expect(checkReviewFile(file('a.gif', 'image/gif'), 0)).toMatch(/a\.gif wasn't added.*choose a different file/)
    expect(checkReviewFile(file('a.jpg', 'application/pdf'), 0)).toMatch(/wasn't added/)
    expect(checkReviewFile(file('a.mp4', 'video/mp4'), 0)).toMatch(/wasn't added/)
  })
  it('rejects a 6 MB photo', () => {
    expect(checkReviewFile(file('big.jpg', 'image/jpeg', 6 * MB), 0)).toMatch(/6\.0 MB.*5 MB/)
  })
  it('rejects a sixth photo', () => {
    expect(checkReviewFile(file('a.jpg', 'image/jpeg'), 4)).toBeNull()
    expect(checkReviewFile(file('a.jpg', 'image/jpeg'), 5)).toMatch(/5 photos at most/)
  })
})
