import { sanitizeName, sanitizeSuffix, stripEmoji, validateEmail, validateMiddleName, validateName, validateSuffix } from './signUpValidation'

/** '' is "not given"; the rest are every value the backend's Gender enum accepts. */
export type AccountGender = '' | 'male' | 'female' | 'other' | 'unisex'

export interface AccountFormValues {
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  email: string
  birthday: string
  gender: AccountGender
}
export type AccountFormField = keyof AccountFormValues
export type AccountFormErrors = Partial<Record<AccountFormField, string>>

/** On-screen order; validation and first-invalid focus both follow it. Gender is a pick from a list, so it is never invalid. */
export const ACCOUNT_FIELD_ORDER: AccountFormField[] = ['firstName', 'middleName', 'lastName', 'suffix', 'email', 'birthday']

export const sanitizeAccountName = (value: string) => sanitizeName(stripEmoji(value))
export const sanitizeAccountSuffix = (value: string) => sanitizeSuffix(stripEmoji(value))
/** Spaces and emoji never belong in an address; the address is lowercased when sent. */
export const sanitizeAccountEmail = (value: string) => stripEmoji(value).replace(/\s/g, '')

const pad = (n: number) => String(n).padStart(2, '0')

/** Yesterday as YYYY-MM-DD in the user's own time zone: the latest birthday the form accepts (today and later are not past dates). */
export function latestBirthday(now = new Date()): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

function validateBirthday(value: string): string | null {
  if (!value) return null
  if (value > latestBirthday()) return 'Birthday must be a past date. Pick a day before today.'
  const [year, month, day] = value.split('-').map(Number)
  const real = new Date(year, month - 1, day)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || real.getMonth() !== month - 1 || real.getDate() !== day) return 'Enter a valid date, like 1998-04-23.'
  return null
}

export function validateAccountForm(values: AccountFormValues): AccountFormErrors {
  const errors: AccountFormErrors = {}
  const found = {
    firstName: validateName(values.firstName, 'First name'),
    middleName: validateMiddleName(values.middleName),
    lastName: validateName(values.lastName, 'Last name'),
    suffix: validateSuffix(values.suffix),
    email: validateEmail(values.email),
    birthday: validateBirthday(values.birthday),
  }
  for (const [name, message] of Object.entries(found)) if (message) errors[name as keyof typeof found] = message
  return errors
}
