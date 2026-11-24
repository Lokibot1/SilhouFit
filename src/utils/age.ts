import { validateBirthday } from './accountValidation'

export const MIN_AGE = 18

export const UNDERAGE_MESSAGE = `You must be at least ${MIN_AGE} years old to create a KRAL account. Come back once you turn ${MIN_AGE}.`

/** Whole years lived on `now`, from a "YYYY-MM-DD" birthday. */
export function ageFrom(birthday: string, now = new Date()): number {
  const [year, month, day] = birthday.split('-').map(Number)
  const had = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day)
  return now.getFullYear() - year - (had ? 0 : 1)
}

/** Required birthday of someone old enough to register, or the message that says why not. */
export function validateAdultBirthday(value: string): string | null {
  if (!value) return 'Enter your birthday. You must be 18 or older to sign up.'
  return validateBirthday(value) ?? (ageFrom(value) < MIN_AGE ? UNDERAGE_MESSAGE : null)
}
