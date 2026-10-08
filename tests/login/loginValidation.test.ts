import { describe, expect, it } from 'vitest'
import { stripEmoji } from '../../src/utils/signUpValidation'
import { validateLogin, validateLoginEmail, validateLoginPassword } from '../../src/utils/loginValidation'

// Emoji fixtures written as escapes so the file encoding cannot change them.
const GRINNING = '\u{1F600}'

describe('validateLoginEmail', () => {
  it('requires an email', () => {
    expect(validateLoginEmail('')).toBe('Email is required.')
    expect(validateLoginEmail('   ')).toBe('Email is required.')
  })

  it.each(['nope', 'a@b', 'a@@b.com', 'a b@c.com', '.a@b.com', 'a@b..com'])('rejects malformed "%s"', (value) => {
    expect(validateLoginEmail(value)).toBe('Enter a valid email like name@example.com.')
  })

  it('rejects emoji', () => {
    expect(validateLoginEmail(`a${GRINNING}@example.com`)).toBe("Email can't contain emoji.")
  })

  it('accepts a normal address, ignoring surrounding spaces and case', () => {
    expect(validateLoginEmail('anne@example.com')).toBeNull()
    expect(validateLoginEmail('  Anne@Example.COM  ')).toBeNull()
  })
})

describe('validateLoginPassword', () => {
  it('requires a password', () => {
    expect(validateLoginPassword('')).toBe('Password is required.')
  })

  it('rejects emoji', () => {
    expect(validateLoginPassword(`Pass${GRINNING}word1`)).toMatch(/emoji/i)
  })

  it('accepts exactly 64 characters and rejects 65', () => {
    expect(validateLoginPassword('a'.repeat(64))).toBeNull()
    expect(validateLoginPassword('a'.repeat(65))).toMatch(/64/)
  })

  it('applies no strength rules: a weak password is still a valid thing to try', () => {
    for (const weak of ['abc', 'a', 'password', '12345678', 'ALLCAPS']) {
      expect(validateLoginPassword(weak)).toBeNull()
    }
  })

  it('does not trim: a password of only spaces is a password', () => {
    expect(validateLoginPassword('   ')).toBeNull()
  })
})

describe('validateLogin', () => {
  it('returns no errors for a valid pair, including a weak password and a padded, mixed-case email', () => {
    expect(validateLogin({ email: '  Anne@Example.COM ', password: 'abc' })).toEqual({})
  })

  it('reports both fields when both are empty', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Email is required.',
      password: 'Password is required.',
    })
  })

  it('reports only the field that is wrong', () => {
    expect(validateLogin({ email: 'nope', password: 'abc' })).toEqual({
      email: 'Enter a valid email like name@example.com.',
    })
    expect(validateLogin({ email: 'anne@example.com', password: '' })).toEqual({
      password: 'Password is required.',
    })
  })
})

describe('stripEmoji on pasted login text', () => {
  it('removes emoji and keeps everything else', () => {
    expect(stripEmoji(`anne${GRINNING}@example.com`)).toBe('anne@example.com')
  })
})
