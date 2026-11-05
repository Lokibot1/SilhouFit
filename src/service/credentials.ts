import { ACCOUNT_EMAIL_DOMAIN, GENERATED_PASSWORD_LENGTH } from '../config/accountPolicy'
import type { Credentials } from '../types/accounts'

// No look-alikes (I, l, 1, O, 0) so a password read off a printout is typed right the first time.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%&*?'
const ALL = UPPER + LOWER + DIGITS + SYMBOLS

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** firstname.lastname, with a number added (2, 3, ...) when `taken` already has it. Spaces and punctuation inside a name are dropped: "Dela Cruz" is "delacruz". */
export function generateUsername(first: string, last: string, taken: Iterable<string>): string {
  const base = [slug(first), slug(last)].filter(Boolean).join('.') || 'user'
  const used = new Set([...taken].map((name) => name.toLowerCase()))
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}${n}`)) n++
  return `${base}${n}`
}

// Rejection sampling keeps every character equally likely.
function randomIndex(size: number): number {
  const limit = 0x100000000 - (0x100000000 % size)
  const buffer = new Uint32Array(1)
  do crypto.getRandomValues(buffer)
  while (buffer[0] >= limit)
  return buffer[0] % size
}

const pick = (set: string) => set[randomIndex(set.length)]

/** 12 characters with at least one uppercase letter, lowercase letter, digit and symbol, so it passes the password rules. */
export function generatePassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)]
  while (chars.length < GENERATED_PASSWORD_LENGTH) chars.push(pick(ALL))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export const emailFor = (username: string) => `${username}@${ACCOUNT_EMAIL_DOMAIN}`

export const formatCredentials = ({ username, email, password }: Pick<Credentials, 'username' | 'email' | 'password'>, withUsername = true) =>
  `${withUsername ? `Username: ${username}\n` : ''}Sign-in email: ${email}\nTemporary password: ${password}`
