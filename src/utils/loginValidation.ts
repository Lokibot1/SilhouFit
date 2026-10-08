import { LIMITS, stripEmoji, validateEmail } from './signUpValidation'

export interface LoginValues {
  email: string
  password: string
}
export type LoginField = keyof LoginValues
export type LoginErrors = Partial<Record<LoginField, string>>

export const LOGIN_FIELD_ORDER: LoginField[] = ['email', 'password']

export const validateLoginEmail = validateEmail

// Sign-in checks the shape only. Strength rules belong to sign-up; an old, weak password must still be typeable.
export function validateLoginPassword(value: string): string | null {
  if (!value) return 'Password is required.'
  if (stripEmoji(value) !== value) return "Password can't contain emoji."
  if (value.length > LIMITS.passwordMaxLength) return `Password can be at most ${LIMITS.passwordMaxLength} characters.`
  return null
}

export function validateLogin(values: LoginValues): LoginErrors {
  const errors: LoginErrors = {}
  const email = validateLoginEmail(values.email)
  const password = validateLoginPassword(values.password)
  if (email) errors.email = email
  if (password) errors.password = password
  return errors
}
