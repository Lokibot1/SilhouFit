import { LIMITS, sanitizePhoneDigits, stripEmoji } from './signUpValidation'

export const ADDRESS_LIMITS = { name: 60, street: 120, city: 40, postal: 4, note: 200 } as const

export interface AddressValues {
  fullName: string
  phone: string
  street: string
  city: string
  postal: string
}
export type AddressField = keyof AddressValues
export type AddressErrors = Partial<Record<AddressField, string>>
export const ADDRESS_FIELD_ORDER: AddressField[] = ['fullName', 'phone', 'street', 'city', 'postal']

// Control characters are what this removes, on purpose.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F]/g

/** Trim, turn control characters into spaces and collapse runs of whitespace (newlines included). */
export function cleanText(input: string) {
  return input.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()
}

// Live typing filters: they drop what the field can never hold, and leave trimming to cleanText on save.
export const filterFullName = (input: string) =>
  input.replace(/[^\p{L}\p{M} '’-]/gu, '').replace(/ {2,}/g, ' ').slice(0, ADDRESS_LIMITS.name)
export const filterStreet = (input: string) =>
  stripEmoji(input.replace(CONTROL, '')).replace(/ {2,}/g, ' ').slice(0, ADDRESS_LIMITS.street)
export const filterCity = (input: string) =>
  input.replace(/[^\p{L}\p{M} ]/gu, '').replace(/ {2,}/g, ' ').slice(0, ADDRESS_LIMITS.city)
export const filterPostal = (input: string) => input.replace(/\D/g, '').slice(0, ADDRESS_LIMITS.postal)
/**
 * The national number from what was typed or pasted, given the selected country's dial code ("+63"). A pasted
 * "+63 (912) 345-6789" or "639123456789" drops the dial code; while the code is still being typed ("+", "+6") the
 * lead-in is kept so the next digit can finish it. Everything else is digits, capped like the sign-up phone field.
 * A trunk 0 ("0917...") is dropped once more digits follow it, so every way of typing the same number gives the same
 * national number; the sign-up field and normalizePhone keep working on that form.
 */
export function filterPhone(raw: string, dial: string): string {
  const dialDigits = dial.replace(/\D/g, '')
  const digits = raw.replace(/\D/g, '')
  const plus = raw.trim().startsWith('+')
  if (plus && digits.length < dialDigits.length && dialDigits.startsWith(digits)) return `+${digits}`
  const national =
    digits.startsWith(dialDigits) && (plus || digits.length > LIMITS.phoneMaxDigits) ? digits.slice(dialDigits.length) : digits
  return sanitizePhoneDigits(national.length > 1 ? national.replace(/^0/, '') : national)
}

/** Emoji are fine in a note (it is not a credential field); only control characters go. */
export const filterNote = (input: string) => input.replace(CONTROL, '').slice(0, ADDRESS_LIMITS.note)

export function validateFullName(value: string): string | null {
  const name = cleanText(value)
  if (!name) return 'Full name is required.'
  if (!/^[\p{L}\p{M} '’-]+$/u.test(name) || !/\p{L}/u.test(name)) {
    return 'Full name can only contain letters, spaces, hyphens and apostrophes.'
  }
  if (name.length < 2) return 'Enter your full name, at least 2 letters.'
  if (name.length > ADDRESS_LIMITS.name) return `Full name can be at most ${ADDRESS_LIMITS.name} characters.`
  return null
}

export function validateStreet(value: string): string | null {
  const street = cleanText(value)
  if (!street) return 'Street address is required.'
  if (street.length < 5) return 'Enter the house number, street and barangay, at least 5 characters.'
  if (street.length > ADDRESS_LIMITS.street) return `Street address can be at most ${ADDRESS_LIMITS.street} characters.`
  return null
}

export function validateCity(value: string): string | null {
  const city = cleanText(value)
  if (!city) return 'City is required.'
  if (!/^[\p{L}\p{M} ]+$/u.test(city)) return 'City can only contain letters and spaces.'
  return null
}

export function validatePostal(value: string): string | null {
  if (!value) return 'Postal code is required.'
  if (!/^\d{4}$/.test(value)) return 'Postal code is 4 digits, like 1100.'
  return null
}
