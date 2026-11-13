import { hasProfanity, PROFANITY_ERROR } from './profanity'
import { checkImageFile, IMAGE_TYPES } from './productValidation'

export const REVIEW_LIMITS = { textMin: 10, textMax: 1000, photosMax: 5 } as const
/** The picker's `accept` list. */
export const REVIEW_ACCEPT = IMAGE_TYPES.join(',')

export type ReviewField = 'rating' | 'text'
export type ReviewErrors = Partial<Record<ReviewField, string>>

// Control characters other than the line break are what this removes, on purpose.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/g

/** Live typing filter for the review: no control characters, at most one blank line in a row, capped. Emoji and line breaks stay. */
export const filterReviewText = (input: string) =>
  input
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, REVIEW_LIMITS.textMax)
    .replace(/[\uD800-\uDBFF]$/, '') // a cut can leave half an emoji

export function validateReview(values: { rating: number; text: string }): ReviewErrors {
  const errors: ReviewErrors = {}
  const { textMin, textMax } = REVIEW_LIMITS
  if (!Number.isInteger(values.rating) || values.rating < 1 || values.rating > 5) errors.rating = 'Choose 1 to 5 stars.'

  const text = values.text.trim()
  if (!text) errors.text = 'Enter a few words about your order. A review needs some text.'
  else if (text.length < textMin) errors.text = `Your review is too short. Use at least ${textMin} characters so it helps other shoppers.`
  else if (text.length > textMax) errors.text = `Your review is too long. It can be at most ${textMax} characters, so shorten it.`
  else if (hasProfanity(text)) errors.text = PROFANITY_ERROR
  return errors
}

/** Why a chosen file can't be added, or null. `photos` is how many the review already holds. */
export function checkReviewFile(file: { name: string; type: string; size: number }, photos: number): string | null {
  const problem = checkImageFile(file)
  if (problem) return problem
  return photos >= REVIEW_LIMITS.photosMax ? `${file.name} wasn't added. A review holds ${REVIEW_LIMITS.photosMax} photos at most, so remove one first.` : null
}
