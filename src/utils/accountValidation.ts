import { LIMITS, sanitizeName, stripEmoji, validateName } from './signUpValidation'

export interface AccountFormValues {
  firstName: string
  lastName: string
  phone: string
}
export type AccountFormField = keyof AccountFormValues
export type AccountFormErrors = Partial<Record<AccountFormField, string>>

export const ACCOUNT_FIELD_ORDER: AccountFormField[] = ['firstName', 'lastName', 'phone']

/** The phone box keeps digits, "+" and the separators people type; the cap counts what is kept after normalizing. */
export const PHONE_MAX = 13

export const sanitizeAccountName = (value: string) => sanitizeName(stripEmoji(value))
export const sanitizeAccountPhone = (value: string) => stripEmoji(value).replace(/[^\d+\s()-]/g, '').slice(0, 24)

/** "+63 (917) 123-4567" is "+639171234567". Spaces, dashes and brackets go; a "+" counts only at the start. */
export function normalizeAccountPhone(value: string): string {
  const plus = value.trim().startsWith('+') ? '+' : ''
  return plus + value.replace(/\D/g, '')
}

export function validateAccountPhone(value: string): string | null {
  const text = value.trim()
  if (!text) return null
  if (!/^\+?[\d\s()-]+$/.test(text)) return 'Phone can only contain numbers and a "+" at the start. Spaces, dashes and brackets are fine.'
  const normalized = normalizeAccountPhone(value)
  const digits = normalized.replace(/\D/g, '').length
  if (digits < LIMITS.phoneMinDigits) return `Enter at least ${LIMITS.phoneMinDigits} digits.`
  if (normalized.length > PHONE_MAX) return `A phone number can be at most ${PHONE_MAX} characters, including the "+".`
  return null
}

export function validateAccountForm(values: AccountFormValues): AccountFormErrors {
  const errors: AccountFormErrors = {}
  const firstName = validateName(values.firstName, 'First name')
  const lastName = validateName(values.lastName, 'Last name')
  const phone = validateAccountPhone(values.phone)
  if (firstName) errors.firstName = firstName
  if (lastName) errors.lastName = lastName
  if (phone) errors.phone = phone
  return errors
}
