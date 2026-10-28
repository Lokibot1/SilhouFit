import { describe, expect, it } from 'vitest'
import { generatePassword, generateUsername } from '../../src/service/credentials'
import { validatePassword } from '../../src/utils/signUpValidation'

describe('generateUsername', () => {
  it('joins first and last name in lower case', () => {
    expect(generateUsername('Maria', 'Santos', [])).toBe('maria.santos')
  })

  it('drops spaces, punctuation and accents inside a name', () => {
    expect(generateUsername('José', 'Dela Cruz', [])).toBe('jose.delacruz')
    expect(generateUsername("Ana-Liza", "O'Brien", [])).toBe('analiza.obrien')
  })

  it('adds a number when the username is taken, case-insensitively', () => {
    expect(generateUsername('Maria', 'Santos', ['Maria.Santos'])).toBe('maria.santos2')
    expect(generateUsername('Maria', 'Santos', ['maria.santos', 'maria.santos2'])).toBe('maria.santos3')
  })
})

describe('generatePassword', () => {
  it('is 12 characters and passes the password rules every time', () => {
    for (let n = 0; n < 200; n++) {
      const password = generatePassword()
      expect(password).toHaveLength(12)
      expect(validatePassword(password)).toBeNull()
      expect(password).not.toMatch(/[Il1O0o]/)
    }
  })

  it('differs between calls', () => {
    expect(new Set(Array.from({ length: 20 }, generatePassword)).size).toBe(20)
  })
})
