import { formatFileSize } from './fileSize'
import { hasProfanity, PROFANITY_ERROR } from './profanity'
import { checkImageFile, IMAGE_TYPES } from './productValidation'

export const REVIEW_LIMITS = { textMin: 10, textMax: 1000, photosMax: 5, videosMax: 1, videoBytes: 50 * 1024 * 1024 } as const
export const VIDEO_TYPES = ['video/mp4', 'video/webm']
/** The picker's `accept` list. */
export const REVIEW_ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(',')
const VIDEO_EXTENSIONS = /\.(mp4|webm)$/i

export type ReviewField = 'rating' | 'text' | 'media'
export type ReviewErrors = Partial<Record<ReviewField, string>>

export const isVideoFile = (file: { type: string }) => file.type.startsWith('video/')

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

/** Why a chosen file can't be added, or null. `counts` is what the review already holds. */
export function checkReviewFile(file: { name: string; type: string; size: number }, counts: { photos: number; videos: number }): string | null {
  if (!isVideoFile(file)) {
    const problem = checkImageFile(file)
    if (problem) return problem.replace('Only JPG, PNG or WebP images work', 'Only JPG, PNG or WebP photos and MP4 or WebM videos work')
    return counts.photos >= REVIEW_LIMITS.photosMax ? `${file.name} wasn't added. A review holds ${REVIEW_LIMITS.photosMax} photos at most, so remove one first.` : null
  }
  if (!VIDEO_TYPES.includes(file.type) || !VIDEO_EXTENSIONS.test(file.name)) return `${file.name} wasn't added. Only MP4 or WebM videos work, so choose a different file.`
  if (file.size > REVIEW_LIMITS.videoBytes)
    return `${file.name} wasn't added. It is ${formatFileSize(file.size)} and the limit is ${formatFileSize(REVIEW_LIMITS.videoBytes)}, so choose a shorter clip or compress it.`
  return counts.videos >= REVIEW_LIMITS.videosMax ? `${file.name} wasn't added. A review holds ${REVIEW_LIMITS.videosMax} video at most, so remove the current one first.` : null
}
