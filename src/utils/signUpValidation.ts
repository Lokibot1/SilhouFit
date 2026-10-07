import { findCountry } from '../data/countries'

export const LIMITS = {
  nameMaxLength: 40,
  nameWordMaxLength: 20,
  suffixMaxLength: 5,
  phoneMinDigits: 7,
  phoneMaxDigits: 11,
  emailMaxLength: 254,
  passwordMinLength: 8,
  passwordMaxLength: 64,
} as const

export interface SignUpValues {
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  email: string
  /** ISO 3166-1 alpha-2 code of the selected calling country. */
  phoneCountry: string
  /** National number, digits only. */
  phone: string
  consent: boolean
}
export type FieldName = keyof SignUpValues
export type SignUpErrors = Partial<Record<FieldName, string>>

export interface SignUpPayload {
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  email: string
  /** E.164 style: calling code plus the national number without its trunk 0. */
  phone: string
  consent: true
}

/** Every field in on-screen order; validation and first-invalid focus both follow it. */
export const FIELD_ORDER: FieldName[] = [
  'firstName',
  'lastName',
  'middleName',
  'suffix',
  'email',
  'phoneCountry',
  'phone',
  'consent',
]

// Pictographs, ZWJ, variation selectors, skin tones, regional-indicator flags and keycap marks.
// \p{Emoji} is avoided on purpose: it also matches digits and "#".
const EMOJI_SOURCE =
  '[\\p{Extended_Pictographic}\\p{Emoji_Presentation}\\u200D\\uFE0E\\uFE0F\\u20E3\\u{1F3FB}-\\u{1F3FF}\\u{1F1E6}-\\u{1F1FF}]'
const EMOJI_ALL = new RegExp(EMOJI_SOURCE, 'gu')
const EMOJI_ANY = new RegExp(EMOJI_SOURCE, 'u')

const NAME_INVALID = /[^\p{L}\p{M} '’-]/u
const NAME_MISPLACED = /^[-'’]|[-'’]$|[-'’]{2}/

export function stripEmoji(input: string): string {
  return input.replace(EMOJI_ALL, '')
}

export function sanitizeName(input: string): string {
  return input
    .replace(/[^\p{L}\p{M} '’-]/gu, '')
    .replace(/ {2,}/g, ' ')
    .slice(0, LIMITS.nameMaxLength)
}

export function sanitizeSuffix(input: string): string {
  return input.replace(/[^\p{L}.]/gu, '').slice(0, LIMITS.suffixMaxLength)
}

export function sanitizePhoneDigits(input: string): string {
  return input.replace(/\D/g, '').slice(0, LIMITS.phoneMaxDigits)
}

/** `${dial}${digits}` with a single leading trunk 0 removed: 09171234567 + "+63" => +639171234567. */
export function normalizePhone(digits: string, dial: string): string {
  return dial + digits.replace(/^0/, '')
}

export function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase()
}

export function validateName(value: string, label: 'First name' | 'Middle name' | 'Last name' = 'First name'): string | null {
  const name = normalizeName(value)
  if (!name) return `${label} is required.`
  if (NAME_INVALID.test(name)) return `${label} can only contain letters, spaces, hyphens and apostrophes.`
  if (!/\p{L}/u.test(name)) return `${label} is required.`
  const words = name.split(' ')
  if (words.some((word) => NAME_MISPLACED.test(word))) return `${label} has misplaced punctuation.`
  if (words.some((word) => word.length > LIMITS.nameWordMaxLength)) {
    return `Each word in ${label} can be at most ${LIMITS.nameWordMaxLength} letters.`
  }
  if (name.length > LIMITS.nameMaxLength) return `${label} can be at most ${LIMITS.nameMaxLength} characters.`
  return null
}

export function validateEmail(value: string): string | null {
  const email = value.trim()
  if (!email) return 'Email is required.'
  if (EMOJI_ANY.test(email)) return "Email can't contain emoji."
  if (email.length > LIMITS.emailMaxLength) return `Email can be at most ${LIMITS.emailMaxLength} characters.`

  const invalid = 'Enter a valid email like name@example.com.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.includes('..')) return invalid
  const [local, domain] = email.split('@')
  if (local.startsWith('.') || local.endsWith('.')) return invalid
  if (domain.split('.').some((label) => label.startsWith('-') || label.endsWith('-'))) return invalid
  return null
}

export function validateMiddleName(value: string): string | null {
  return normalizeName(value) ? validateName(value, 'Middle name') : null
}

export function validateSuffix(value: string): string | null {
  const suffix = value.trim()
  if (!suffix) return null
  if (!/^[\p{L}.]+$/u.test(suffix) || !/\p{L}/u.test(suffix)) return 'Suffix can only contain letters and periods.'
  if (suffix.length > LIMITS.suffixMaxLength) return `Suffix can be at most ${LIMITS.suffixMaxLength} characters.`
  return null
}

export function validatePhone(value: string): string | null {
  if (!value.trim()) return 'Phone number is required.'
  const digits = value.replace(/\D/g, '').length
  if (digits !== value.length || digits < LIMITS.phoneMinDigits || digits > LIMITS.phoneMaxDigits) {
    return `Enter a phone number with ${LIMITS.phoneMinDigits} to ${LIMITS.phoneMaxDigits} digits.`
  }
  return null
}

export interface PasswordRequirement {
  id: 'length' | 'upper' | 'lower' | 'number' | 'special'
  label: string
  met: boolean
}

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { id: 'length', label: 'At least 8 characters', met: password.length >= LIMITS.passwordMinLength },
    { id: 'upper', label: 'One uppercase letter', met: /\p{Lu}/u.test(password) },
    { id: 'lower', label: 'One lowercase letter', met: /\p{Ll}/u.test(password) },
    { id: 'number', label: 'One number', met: /\d/.test(password) },
    { id: 'special', label: 'One special character', met: /[^\p{L}\p{M}\p{N}\s]/u.test(stripEmoji(password)) },
  ]
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Password is required.'
  if (EMOJI_ANY.test(value)) return "Password can't contain emoji."
  if (value.length < LIMITS.passwordMinLength) return `Use at least ${LIMITS.passwordMinLength} characters.`
  if (value.length > LIMITS.passwordMaxLength) return `Use at most ${LIMITS.passwordMaxLength} characters.`
  const [, upper, lower, number, special] = getPasswordRequirements(value)
  if (!upper.met) return 'Add an uppercase letter.'
  if (!lower.met) return 'Add a lowercase letter.'
  if (!number.met) return 'Add a number.'
  if (!special.met) return 'Add a special character, like ! or #.'
  return null
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return 'Confirm your password.'
  if (confirm !== password) return "Passwords don't match."
  return null
}

export const CONSENT_ERROR = 'Please read and accept the Terms of Service and Privacy Policy to create an account.'

export function validateConsent(checked: boolean): string | null {
  return checked ? null : CONSENT_ERROR
}

export type PasswordStrengthLevel = 0 | 1 | 2 | 3 | 4
const STRENGTH_LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const
const COMMON_WORDS = /password|qwerty|letmein|welcome|admin|12345/i

// Heuristic: character classes plus length steps. Not a substitute for a breached-password check.
export function getPasswordStrength(
  password: string,
  context: { email?: string; firstName?: string } = {},
): { level: PasswordStrengthLevel; label: (typeof STRENGTH_LABELS)[number] } {
  if (!password) return { level: 0, label: 'Too weak' }

  const [, upper, lower, number, special] = getPasswordRequirements(password)
  const classes = [upper, lower, number, special].filter((r) => r.met).length
  const lengthSteps = [8, 12, 16].filter((n) => password.length >= n).length
  let level = Math.max(0, Math.min(4, classes + lengthSteps - 3))

  if (password.length < LIMITS.passwordMinLength || COMMON_WORDS.test(password)) level = Math.min(level, 1)

  const lowered = password.toLowerCase()
  const personal = [context.email?.split('@')[0], context.firstName]
    .map((part) => part?.trim().toLowerCase() ?? '')
    .filter((part) => part.length >= 3)
  if (personal.some((part) => lowered.includes(part))) level -= 1

  const final = Math.max(0, level) as PasswordStrengthLevel
  return { level: final, label: STRENGTH_LABELS[final] }
}

export function validateField(name: FieldName, values: SignUpValues): string | null {
  switch (name) {
    case 'firstName':
      return validateName(values.firstName, 'First name')
    case 'middleName':
      return validateMiddleName(values.middleName)
    case 'lastName':
      return validateName(values.lastName, 'Last name')
    case 'suffix':
      return validateSuffix(values.suffix)
    case 'email':
      return validateEmail(values.email)
    case 'phoneCountry':
      return findCountry(values.phoneCountry) ? null : 'Choose a country calling code.'
    case 'phone':
      return validatePhone(values.phone)
    case 'consent':
      return validateConsent(values.consent)
  }
}

export function validateSignUp(values: SignUpValues): SignUpErrors {
  const errors: SignUpErrors = {}
  for (const field of FIELD_ORDER) {
    const message = validateField(field, values)
    if (message) errors[field] = message
  }
  return errors
}

export function isSignUpValid(values: SignUpValues): boolean {
  return Object.keys(validateSignUp(values)).length === 0
}

export function normalizeSignUp(values: SignUpValues): SignUpPayload {
  if (!isSignUpValid(values)) throw new Error('Invalid sign-up values')
  return {
    firstName: normalizeName(values.firstName),
    middleName: normalizeName(values.middleName) || null,
    lastName: normalizeName(values.lastName),
    suffix: values.suffix.trim() || null,
    email: normalizeEmail(values.email),
    phone: normalizePhone(values.phone, findCountry(values.phoneCountry)!.dial),
    consent: true,
  }
}
