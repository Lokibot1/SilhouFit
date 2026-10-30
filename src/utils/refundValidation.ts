import { formatPeso } from './format'
import { stripEmoji } from './signUpValidation'

export const REFUND_LIMITS = { noteMax: 200, reasonMin: 10, reasonMax: 300 } as const

/** No emoji, one space between words, none at the start, at most `max` characters. */
export const sanitizeText = (value: string, max: number) => stripEmoji(value).replace(/\s+/g, ' ').replace(/^ /, '').slice(0, max)

export interface ApprovalValues {
  /** Pesos, still text while it is typed. */
  amount: string
  note: string
}
export type ApprovalErrors = Partial<Record<keyof ApprovalValues, string>>

const MONEY = /^\d+(\.\d{1,2})?$/

/** The amount must be pesos and centavos, more than 0 and no more than what the order cost. */
export function validateApproval({ amount, note }: ApprovalValues, orderTotal: number): ApprovalErrors {
  const errors: ApprovalErrors = {}
  const text = amount.trim()
  if (!text) errors.amount = 'Enter the amount to refund.'
  else if (!MONEY.test(text)) errors.amount = 'Use pesos with at most 2 decimals, such as 1250 or 1250.50.'
  else if (Number(text) <= 0) errors.amount = 'The refund must be more than ₱0.00.'
  else if (Number(text) > orderTotal) errors.amount = `Enter an amount of at most ${formatPeso(orderTotal)}, the order total.`
  if (note.trim().length > REFUND_LIMITS.noteMax) errors.note = `The note can be at most ${REFUND_LIMITS.noteMax} characters.`
  return errors
}

/** The reason a request is turned down: the customer is told it, so it must say something. */
export function validateRejection({ reason }: { reason: string }): { reason?: string } {
  const text = reason.trim()
  if (!text) return { reason: 'Enter why this request is rejected, so the customer knows what happened.' }
  if (text.length < REFUND_LIMITS.reasonMin) return { reason: `Use at least ${REFUND_LIMITS.reasonMin} characters so the reason is clear.` }
  if (text.length > REFUND_LIMITS.reasonMax) return { reason: `The reason can be at most ${REFUND_LIMITS.reasonMax} characters.` }
  return {}
}
