import { stripEmoji } from './signUpValidation'

export const REFUND_LIMITS = { referenceMax: 128, notesMax: 500 } as const

/** No emoji, one space between words, none at the start, at most `max` characters. */
export const sanitizeText = (value: string, max: number) => stripEmoji(value).replace(/\s+/g, ' ').replace(/^ /, '').slice(0, max)

const notesError = (notes: string) => (notes.trim().length > REFUND_LIMITS.notesMax ? `The notes can be at most ${REFUND_LIMITS.notesMax} characters.` : undefined)

/** Marking a refund as paid outside the gateway: the reference of that payment is required, the notes are not. */
export function validateResolution({ manualReference, notes }: { manualReference: string; notes: string }): { manualReference?: string; notes?: string } {
  const errors: { manualReference?: string; notes?: string } = {}
  const reference = manualReference.trim()
  if (!reference) errors.manualReference = 'Enter the reference of the payment that returned the money, such as a bank transfer number.'
  else if (reference.length > REFUND_LIMITS.referenceMax) errors.manualReference = `The reference can be at most ${REFUND_LIMITS.referenceMax} characters.`
  const notesProblem = notesError(notes)
  if (notesProblem) errors.notes = notesProblem
  return errors
}
