import { LIMITS, normalizePhone, sanitizePhoneDigits, stripEmoji } from './signUpValidation'

export const ADDRESS_LIMITS = { name: 60, street: 120, city: 40, place: 80, postal: 4, note: 200, label: 50, line2: 120, word: 30 } as const
/** Digits after +63 (no trunk 0): a mobile is 10, and no landline with its area code is longer. */
export const NATIONAL_PHONE_MAX = 10

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
/** A label ("Home", "Office") or an optional second line: like a street, with its own cap. */
export const filterLabel = (input: string) =>
  stripEmoji(input.replace(CONTROL, '')).replace(/ {2,}/g, ' ').slice(0, ADDRESS_LIMITS.label)
export const filterLine2 = (input: string) =>
  stripEmoji(input.replace(CONTROL, '')).replace(/ {2,}/g, ' ').slice(0, ADDRESS_LIMITS.line2)
export const filterCity = (input: string) =>
  input.replace(/[^\p{L}\p{M} .'’-]/gu, '').replace(/ {2,}/g, ' ').slice(0, ADDRESS_LIMITS.city)
/** A region or barangay typed by hand: letters, marks, digits and the punctuation PSGC names use ("Barangay 176-A"). */
export const filterPlace = (input: string) =>
  stripEmoji(input.replace(/[^\p{L}\p{M}\p{N} .'’()-]/gu, '')).replace(/ {2,}/g, ' ').slice(0, ADDRESS_LIMITS.place)
/** A PSGC name without its "(…)" qualifier: "Pio V. Corpuz (Limbuhan)" becomes "Pio V. Corpuz". */
export const cleanPlaceName = (name: string) => cleanText(name.replace(/\([^)]*\)/g, ''))
export const filterPostal = (input: string) => input.replace(/\D/g, '').slice(0, ADDRESS_LIMITS.postal)
/**
 * The national number from what was typed or pasted, given the selected country's dial code ("+63"). A pasted
 * "+63 (912) 345-6789" or "639123456789" drops the dial code; while the code is still being typed ("+", "+6") the
 * lead-in is kept so the next digit can finish it. Everything else is digits, capped like the sign-up phone field.
 * A trunk 0 ("0917...") is dropped once more digits follow it, so every way of typing the same number gives the same
 * national number; the sign-up field and normalizePhone keep working on that form. `max` caps the national digits.
 */
export function filterPhone(raw: string, dial: string, max: number = LIMITS.phoneMaxDigits): string {
  const dialDigits = dial.replace(/\D/g, '')
  const digits = raw.replace(/\D/g, '')
  const plus = raw.trim().startsWith('+')
  if (plus && digits.length < dialDigits.length && dialDigits.startsWith(digits)) return `+${digits}`
  const national =
    digits.startsWith(dialDigits) && (plus || digits.length > max) ? digits.slice(dialDigits.length) : digits
  return (national.length > 1 ? national.replace(/^0/, '') : national).slice(0, max)
}

/** Emoji are fine in a note (it is not a credential field); only control characters go. */
export const filterNote = (input: string) => input.replace(CONTROL, '').slice(0, ADDRESS_LIMITS.note)

/** One unbroken run longer than the cap would overflow a narrow card, so it is refused with a message. */
function longWord(text: string, label: string): string | null {
  return text.split(' ').some((word) => word.length > ADDRESS_LIMITS.word)
    ? `Each word in ${label} can be at most ${ADDRESS_LIMITS.word} characters. Add a space or shorten it.`
    : null
}

export function validateFullName(value: string): string | null {
  const name = cleanText(value)
  if (!name) return 'Full name is required.'
  if (!/^[\p{L}\p{M} '’-]+$/u.test(name) || !/\p{L}/u.test(name)) {
    return 'Full name can only contain letters, spaces, hyphens and apostrophes.'
  }
  if (name.length < 2) return 'Enter your full name, at least 2 letters.'
  if (name.length > ADDRESS_LIMITS.name) return `Full name can be at most ${ADDRESS_LIMITS.name} characters.`
  return longWord(name, 'Full name')
}

export function validateStreet(value: string): string | null {
  const street = cleanText(value)
  if (!street) return 'Street address is required.'
  if (street.length < 5) return 'Enter the house number, street and barangay, at least 5 characters.'
  if (street.length > ADDRESS_LIMITS.street) return `Street address can be at most ${ADDRESS_LIMITS.street} characters.`
  return longWord(street, 'Street address')
}

export function validateCity(value: string): string | null {
  const city = cleanText(value)
  if (!city) return 'City is required.'
  if (!/^[\p{L}\p{M} .'’-]+$/u.test(city)) return 'City can only contain letters, spaces, periods, hyphens and apostrophes.'
  return null
}

/** `label` names the field in the message ("Region", "Barangay"). */
export function validatePlace(value: string, label: string): string | null {
  const place = cleanText(value)
  if (!place) return `${label} is required.`
  if (!/^[\p{L}\p{M}\p{N} .'’()-]+$/u.test(place)) {
    return `${label} can only contain letters, numbers, spaces and . ' ’ ( ) -`
  }
  if (!/\p{L}/u.test(place)) return `${label} needs at least one letter.`
  if (place.length > ADDRESS_LIMITS.place) return `${label} can be at most ${ADDRESS_LIMITS.place} characters.`
  return null
}

export function validatePostal(value: string): string | null {
  if (!value) return 'Postal code is required.'
  if (!/^\d{4}$/.test(value)) return 'Postal code is 4 digits, like 1100.'
  return null
}

/** Optional. Emoji are filtered as typed; this catches a paste that got past it. */
export function validateLabel(value: string): string | null {
  const label = cleanText(value)
  if (stripEmoji(label) !== label) return 'Label cannot contain emoji.'
  if (label.length > ADDRESS_LIMITS.label) return `Label can be at most ${ADDRESS_LIMITS.label} characters.`
  return longWord(label, 'Label')
}

/** Optional. */
export function validateLine2(value: string): string | null {
  const line2 = cleanText(value)
  if (line2.length > ADDRESS_LIMITS.line2) return `Unit, floor or landmark can be at most ${ADDRESS_LIMITS.line2} characters.`
  return longWord(line2, 'Unit, floor or landmark')
}

// A copy of the API's PH_PHONE_REGEX (silhoufit-api/src/addresses/dto/address.constants.ts): the server is the authority.
const PH_PHONE_REGEX =
  /^(?:(?:\+63|0)[\s.-]?9(?:[\s.-]?\d){9}|(?:\+63|0)[\s.-]?[2-8]\d{0,2}(?:[\s.-]?\d{3,4}){2}|\(0[2-8]\d{0,2}\)[\s.-]?(?:\d{3,4}[\s.-]?){1,2}\d{4})$/

/** `national` is what follows the fixed "+63". */
export function validateAddressPhone(national: string): string | null {
  if (!national.trim()) return 'Phone number is required.'
  return PH_PHONE_REGEX.test(normalizePhone(national, '+63')) ? null : 'Enter a Philippine mobile number like 917 123 4567.'
}

/** The digits after +63 (or the trunk 0) of a saved phone, however it was written. */
export function toNationalPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return sanitizePhoneDigits(phone.trim().startsWith('+63') ? digits.slice(2) : digits.replace(/^0/, ''))
}
