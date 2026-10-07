import { describe, expect, it } from 'vitest'
import {
  FIELD_ORDER,
  LIMITS,
  getPasswordRequirements,
  getPasswordStrength,
  isSignUpValid,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeSignUp,
  sanitizeName,
  sanitizePhoneDigits,
  sanitizeSuffix,
  stripEmoji,
  validateConfirmPassword,
  validateConsent,
  validateEmail,
  validateField,
  validateMiddleName,
  validateName,
  validatePassword,
  validatePhone,
  validateSignUp,
  validateSuffix,
  type SignUpValues,
} from './signUpValidation'

// Emoji fixtures written as escapes so the file encoding cannot change them.
const GRINNING = '\u{1F600}'
const FAMILY_ZWJ = '\u{1F468}‍\u{1F469}‍\u{1F467}' // man + woman + girl joined by ZWJ
const FLAG_PH = '\u{1F1F5}\u{1F1ED}' // regional indicators P + H
const THUMB_TONE = '\u{1F44D}\u{1F3FD}' // thumbs up + medium skin tone
const HEART_VS16 = '❤️' // red heart + variation selector-16

const validValues: SignUpValues = {
  firstName: 'Anne',
  lastName: 'Santos',
  middleName: '',
  suffix: '',
  email: 'anne@example.com',
  phoneCountry: 'PH',
  phone: '9171234567',
  consent: true,
}

const with_ = (patch: Partial<SignUpValues>): SignUpValues => ({ ...validValues, ...patch })

describe('LIMITS', () => {
  it('exposes the documented limits', () => {
    expect(LIMITS).toEqual({
      nameMaxLength: 40,
      nameWordMaxLength: 20,
      suffixMaxLength: 5,
      phoneMinDigits: 7,
      phoneMaxDigits: 11,
      emailMaxLength: 254,
      passwordMinLength: 8,
      passwordMaxLength: 64,
    })
  })
})

describe('stripEmoji', () => {
  it('returns an empty string unchanged', () => {
    expect(stripEmoji('')).toBe('')
  })

  it('removes simple emoji and keeps surrounding text', () => {
    expect(stripEmoji(`a${GRINNING}b`)).toBe('ab')
  })

  it('removes ZWJ sequences completely, leaving no joiner behind', () => {
    expect(stripEmoji(`Hi ${FAMILY_ZWJ} there`)).toBe('Hi  there')
  })

  it('removes flags', () => {
    expect(stripEmoji(`x${FLAG_PH}y`)).toBe('xy')
  })

  it('removes skin-tone modifiers with their base emoji', () => {
    expect(stripEmoji(`x${THUMB_TONE}y`)).toBe('xy')
  })

  it('removes variation selectors with their base emoji', () => {
    expect(stripEmoji(`x${HEART_VS16}y`)).toBe('xy')
  })

  it('keeps accented letters, hash and digits', () => {
    expect(stripEmoji('é ñ # 123')).toBe('é ñ # 123')
  })

  it('is idempotent', () => {
    const once = stripEmoji(`a${FAMILY_ZWJ}${FLAG_PH}${THUMB_TONE}${HEART_VS16}b#1`)
    expect(stripEmoji(once)).toBe(once)
    expect(once).toBe('ab#1')
  })
})

describe('sanitizeName', () => {
  it('drops digits, symbols and emoji', () => {
    expect(sanitizeName(`J0hn${GRINNING}!`)).toBe('Jhn')
  })

  it('keeps letters, hyphens, apostrophes (straight and curly) and spaces', () => {
    expect(sanitizeName('Jean-Luc')).toBe('Jean-Luc')
    expect(sanitizeName("O'Brien")).toBe("O'Brien")
    expect(sanitizeName('D’Angelo')).toBe('D’Angelo')
    expect(sanitizeName('Mary Ann')).toBe('Mary Ann')
  })

  it('keeps non-ASCII letters and combining marks', () => {
    expect(sanitizeName('Núñez')).toBe('Núñez')
    expect(sanitizeName('李')).toBe('李')
    expect(sanitizeName('é')).toBe('é')
  })

  it('collapses runs of spaces to one space', () => {
    expect(sanitizeName('Mary     Ann')).toBe('Mary Ann')
  })

  it('does not trim a trailing space (user is mid-typing)', () => {
    expect(sanitizeName('Anne ')).toBe('Anne ')
  })

  it('truncates to 40 characters', () => {
    expect(sanitizeName('a'.repeat(50))).toBe('a'.repeat(40))
  })

  it('never throws on an empty string', () => {
    expect(sanitizeName('')).toBe('')
  })

  it('is idempotent', () => {
    for (const sample of [`J0hn${GRINNING}!`, 'Mary     Ann ', "O'Brien", 'a'.repeat(60), '  --x']) {
      const once = sanitizeName(sample)
      expect(sanitizeName(once)).toBe(once)
    }
  })
})

describe('sanitizeSuffix', () => {
  it('keeps letters and periods', () => {
    for (const suffix of ['Jr.', 'Sr.', 'II', 'III', 'IV', 'PhD']) expect(sanitizeSuffix(suffix)).toBe(suffix)
  })

  it('drops digits, spaces, symbols and emoji', () => {
    expect(sanitizeSuffix(`J r.1-${GRINNING}`)).toBe('Jr.')
  })

  it('truncates to 5 characters', () => {
    expect(sanitizeSuffix('abcdefgh')).toBe('abcde')
  })

  it('is idempotent', () => {
    for (const sample of ['Jr.1', 'Ph.D.xyz', '', GRINNING]) {
      const once = sanitizeSuffix(sample)
      expect(sanitizeSuffix(once)).toBe(once)
    }
  })
})

describe('sanitizePhoneDigits', () => {
  it('keeps digits only', () => {
    expect(sanitizePhoneDigits('+63 (917) 123-4567')).toBe('63917123456')
    expect(sanitizePhoneDigits(`09a1${GRINNING}7#`)).toBe('0917')
    expect(sanitizePhoneDigits('')).toBe('')
  })

  it('hard-caps at 11 digits', () => {
    expect(sanitizePhoneDigits('1'.repeat(30))).toBe('1'.repeat(11))
  })

  it('is idempotent', () => {
    for (const sample of ['+63+9a17 (12)-3.4', '1'.repeat(40), `${GRINNING}+1`, '']) {
      const once = sanitizePhoneDigits(sample)
      expect(sanitizePhoneDigits(once)).toBe(once)
    }
  })
})

describe('normalizePhone', () => {
  it('prefixes the dial code', () => {
    expect(normalizePhone('9171234567', '+63')).toBe('+639171234567')
  })

  it('removes a single leading trunk zero', () => {
    expect(normalizePhone('09171234567', '+63')).toBe('+639171234567')
    expect(normalizePhone('0044123456', '+44')).toBe('+44044123456')
  })

  it('leaves zeros that are not leading alone', () => {
    expect(normalizePhone('9100234567', '+63')).toBe('+639100234567')
  })
})

describe('normalizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  Mary   Ann  ')).toBe('Mary Ann')
  })

  it('preserves casing', () => {
    expect(normalizeName('mcDONALD')).toBe('mcDONALD')
  })
})

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Anne.Santos@Example.COM ')).toBe('anne.santos@example.com')
  })
})

describe('validateName', () => {
  it('accepts valid names', () => {
    for (const name of ['Anne', 'Mary Ann', 'Jean-Luc', "O'Brien", 'Núñez', '李', 'D’Angelo']) {
      expect(validateName(name)).toBeNull()
    }
  })

  it('requires a value, using the supplied label', () => {
    expect(validateName('', 'First name')).toBe('First name is required.')
    expect(validateName('', 'Last name')).toBe('Last name is required.')
  })

  it('defaults the label to "First name"', () => {
    expect(validateName('')).toBe('First name is required.')
  })

  it('treats whitespace-only input as missing', () => {
    expect(validateName('    ', 'Last name')).toBe('Last name is required.')
  })

  it('rejects digits, symbols and emoji', () => {
    const expected = 'First name can only contain letters, spaces, hyphens and apostrophes.'
    expect(validateName('Ann3')).toBe(expected)
    expect(validateName('Ann!')).toBe(expected)
    expect(validateName(`Ann${GRINNING}`)).toBe(expected)
    expect(validateName('Ann', 'Last name')).toBeNull()
    expect(validateName('Ann3', 'Last name')).toBe(
      'Last name can only contain letters, spaces, hyphens and apostrophes.',
    )
  })

  it('rejects leading, trailing and doubled hyphens or apostrophes', () => {
    const expected = 'First name has misplaced punctuation.'
    for (const name of ['-Anne', 'Anne-', "'Anne", "Anne'", 'Jean--Luc', "O''Brien", "Jean-'Luc"]) {
      expect(validateName(name)).toBe(expected)
    }
  })

  it('accepts a 20-letter word and rejects a 21-letter word', () => {
    expect(validateName('a'.repeat(20))).toBeNull()
    expect(validateName('a'.repeat(21))).toBe('Each word in First name can be at most 20 letters.')
    expect(validateName('b'.repeat(21), 'Last name')).toBe(
      'Each word in Last name can be at most 20 letters.',
    )
  })

  it('accepts 40 characters in total and rejects 41', () => {
    const forty = `${'a'.repeat(20)} ${'b'.repeat(19)}`
    const fortyOne = `${'a'.repeat(20)} ${'b'.repeat(20)}`
    expect(forty).toHaveLength(40)
    expect(fortyOne).toHaveLength(41)
    expect(validateName(forty)).toBeNull()
    expect(validateName(fortyOne)).toBe('First name can be at most 40 characters.')
  })
})

describe('validateEmail', () => {
  it('accepts valid emails', () => {
    expect(validateEmail('a@b.co')).toBeNull()
    expect(validateEmail('first.last+tag@mail.example.com')).toBeNull()
  })

  it('trims before validating', () => {
    expect(validateEmail('  a@b.co  ')).toBeNull()
  })

  it('requires a value', () => {
    expect(validateEmail('')).toBe('Email is required.')
  })

  it('rejects emoji', () => {
    expect(validateEmail(`a${GRINNING}@b.com`)).toBe("Email can't contain emoji.")
  })

  it('rejects malformed addresses with the format message', () => {
    const expected = 'Enter a valid email like name@example.com.'
    for (const email of [
      'a@b',
      'a@@b.com',
      'a b@c.com',
      'a..b@c.com',
      'a@b.c',
      '.a@b.com',
      'a.@b.com',
      'a@-b.com',
      'a@b-.com',
      'plainaddress',
    ]) {
      expect(validateEmail(email), email).toBe(expected)
    }
  })

  it('accepts 254 characters and rejects 255', () => {
    const at254 = `${'a'.repeat(249)}@b.co`
    const at255 = `${'a'.repeat(250)}@b.co`
    expect(at254).toHaveLength(254)
    expect(at255).toHaveLength(255)
    expect(validateEmail(at254)).toBeNull()
    const message = validateEmail(at255)
    expect(message).not.toBeNull()
    expect(message).not.toBe('Enter a valid email like name@example.com.')
  })
})

describe('validateMiddleName', () => {
  it('may be empty', () => {
    expect(validateMiddleName('')).toBeNull()
    expect(validateMiddleName('   ')).toBeNull()
  })

  it('follows the other name rules', () => {
    const invalid = 'Middle name can only contain letters, spaces, hyphens and apostrophes.'
    expect(validateMiddleName('Dela Cruz')).toBeNull()
    expect(validateMiddleName("D'Arcy-Lee")).toBeNull()
    expect(validateMiddleName('R2D2')).toBe(invalid)
    expect(validateMiddleName(`Ann${GRINNING}`)).toBe(invalid)
    expect(validateMiddleName('a'.repeat(21))).toBe('Each word in Middle name can be at most 20 letters.')
    expect(validateMiddleName('a'.repeat(20) + ' ' + 'b'.repeat(20))).toBe(
      'Middle name can be at most 40 characters.',
    )
    expect(validateMiddleName('-Ann')).toBe('Middle name has misplaced punctuation.')
  })
})

describe('validateSuffix', () => {
  it('is optional', () => {
    expect(validateSuffix('')).toBeNull()
  })

  it('accepts common suffixes', () => {
    for (const suffix of ['Jr.', 'Sr.', 'II', 'III', 'IV', 'PhD']) expect(validateSuffix(suffix)).toBeNull()
  })

  it('rejects digits, spaces, symbols, emoji and a lone period', () => {
    const message = 'Suffix can only contain letters and periods.'
    expect(validateSuffix('J1')).toBe(message)
    expect(validateSuffix('Jr .')).toBe(message)
    expect(validateSuffix('Jr-')).toBe(message)
    expect(validateSuffix(`Jr${GRINNING}`)).toBe(message)
    expect(validateSuffix('.')).toBe(message)
  })

  it('allows 5 characters and rejects 6', () => {
    expect(validateSuffix('Ph.D.')).toBeNull()
    expect(validateSuffix('abcdef')).toBe('Suffix can be at most 5 characters.')
  })
})

describe('validatePhone', () => {
  const lengthMessage = 'Enter a phone number with 7 to 11 digits.'

  it('is required', () => {
    expect(validatePhone('')).toBe('Phone number is required.')
    expect(validatePhone('   ')).toBe('Phone number is required.')
  })

  it('accepts 7 to 11 digits', () => {
    expect(validatePhone('1234567')).toBeNull()
    expect(validatePhone('09171234567')).toBeNull()
  })

  it('rejects 6 and 12 digits', () => {
    expect(validatePhone('123456')).toBe(lengthMessage)
    expect(validatePhone('123456789012')).toBe(lengthMessage)
  })

  it('rejects anything that is not a digit', () => {
    expect(validatePhone('+639171234567')).toBe(lengthMessage)
    expect(validatePhone('0917 123 4567')).toBe(lengthMessage)
    expect(validatePhone(`0917${GRINNING}12345`)).toBe(lengthMessage)
  })
})

describe('validatePassword', () => {
  it('accepts a password meeting every rule', () => {
    expect(validatePassword('Aa1!aaaa')).toBeNull()
    expect(validatePassword('Str0ng!Pass')).toBeNull()
  })

  it('reports the first unmet rule, in priority order', () => {
    expect(validatePassword('')).toBe('Password is required.')
    expect(validatePassword(`Aa1!aaaa${GRINNING}`)).toBe("Password can't contain emoji.")
    expect(validatePassword('aaaaaaa')).toBe('Use at least 8 characters.')
    expect(validatePassword('a'.repeat(65))).toBe('Use at most 64 characters.')
    expect(validatePassword('aaaaaaaa')).toBe('Add an uppercase letter.')
    expect(validatePassword('AAAAAAAA')).toBe('Add a lowercase letter.')
    expect(validatePassword('Aaaaaaaa')).toBe('Add a number.')
    expect(validatePassword('Aaaaaaa1')).toBe('Add a special character, like ! or #.')
  })

  it('reports emoji before length', () => {
    expect(validatePassword(GRINNING)).toBe("Password can't contain emoji.")
  })

  it('accepts exactly 8 characters and rejects 7', () => {
    expect(validatePassword('Aa1!aaaa')).toBeNull()
    expect(validatePassword('Aa1!aaa')).toBe('Use at least 8 characters.')
  })

  it('accepts exactly 64 characters and rejects 65', () => {
    const sixtyFour = `Aa1!${'a'.repeat(60)}`
    const sixtyFive = `Aa1!${'a'.repeat(61)}`
    expect(sixtyFour).toHaveLength(64)
    expect(validatePassword(sixtyFour)).toBeNull()
    expect(validatePassword(sixtyFive)).toBe('Use at most 64 characters.')
  })

  it('does not treat a space as a special character, but allows it inside', () => {
    expect(validatePassword('Aa1 aaaaa')).toBe('Add a special character, like ! or #.')
    expect(validatePassword('Aa1 aaaa!')).toBeNull()
  })

  it('counts Unicode letters as upper or lower case', () => {
    expect(validatePassword('Éa1!aaaa')).toBeNull()
  })
})

describe('validateConfirmPassword', () => {
  it('requires a value', () => {
    expect(validateConfirmPassword('Str0ng!Pass', '')).toBe('Confirm your password.')
  })

  it('reports a mismatch, case-sensitively', () => {
    expect(validateConfirmPassword('Str0ng!Pass', 'Str0ng!Pas')).toBe("Passwords don't match.")
    expect(validateConfirmPassword('Str0ng!Pass', 'str0ng!pass')).toBe("Passwords don't match.")
  })

  it('accepts a match', () => {
    expect(validateConfirmPassword('Str0ng!Pass', 'Str0ng!Pass')).toBeNull()
  })
})

describe('validateConsent', () => {
  it('requires consent', () => {
    expect(validateConsent(false)).toBe(
      'Please read and accept the Terms of Service and Privacy Policy to create an account.',
    )
  })

  it('accepts consent', () => {
    expect(validateConsent(true)).toBeNull()
  })
})

describe('getPasswordRequirements', () => {
  it('always returns the five requirements in order with the documented labels', () => {
    const result = getPasswordRequirements('')
    expect(result).toEqual([
      { id: 'length', label: 'At least 8 characters', met: false },
      { id: 'upper', label: 'One uppercase letter', met: false },
      { id: 'lower', label: 'One lowercase letter', met: false },
      { id: 'number', label: 'One number', met: false },
      { id: 'special', label: 'One special character', met: false },
    ])
  })

  it('marks every requirement met for a compliant password', () => {
    expect(getPasswordRequirements('Aa1!aaaa').map((r) => r.met)).toEqual([true, true, true, true, true])
  })

  it('marks only the satisfied requirements', () => {
    expect(getPasswordRequirements('abc').map((r) => r.met)).toEqual([false, false, true, false, false])
    expect(getPasswordRequirements('ABCDEFGH1').map((r) => r.met)).toEqual([true, true, false, true, false])
  })

  it('requires 8 characters for the length item', () => {
    expect(getPasswordRequirements('1234567')[0].met).toBe(false)
    expect(getPasswordRequirements('12345678')[0].met).toBe(true)
  })

  it('does not count a space as special', () => {
    expect(getPasswordRequirements('a b')[4].met).toBe(false)
  })
})

describe('getPasswordStrength', () => {
  it('rates an empty password as level 0, "Too weak"', () => {
    expect(getPasswordStrength('')).toEqual({ level: 0, label: 'Too weak' })
  })

  it('never rates a short password above level 1', () => {
    expect(getPasswordStrength('Aa1!').level).toBeLessThanOrEqual(1)
  })

  it('caps a common-word password at level 2', () => {
    expect(getPasswordStrength('password1!A').level).toBeLessThanOrEqual(2)
  })

  it('rates a mixed 12-character password at least Good', () => {
    expect(getPasswordStrength('Tr0ub4dor&3x').level).toBeGreaterThanOrEqual(3)
  })

  it('rates 16+ characters with all five classes as level 4, "Strong"', () => {
    expect(getPasswordStrength('Xk9#mQ2$vL7!pR4z')).toEqual({ level: 4, label: 'Strong' })
  })

  it('maps every level to its label', () => {
    const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
    for (const pw of ['', 'Aa1!', 'password1!A', 'Tr0ub4dor&3x', 'Xk9#mQ2$vL7!pR4z', 'abc', 'aaaaaaaaaa']) {
      const { level, label } = getPasswordStrength(pw)
      expect(label).toBe(labels[level])
    }
  })

  it('does not decrease as a password gains length and variety', () => {
    const ladder = ['', 'Aa1!', 'Tr0ub4dor&3x', 'Xk9#mQ2$vL7!pR4z']
    const levels = ladder.map((pw) => getPasswordStrength(pw).level)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })

  it('lowers the level by one when the email local part is contained', () => {
    const password = 'Xk9#plmzkQ2$vL7!'
    expect(getPasswordStrength(password).level).toBe(4)
    expect(getPasswordStrength(password, { email: 'plmzk@example.com' }).level).toBe(3)
  })

  it('lowers the level by one when the first name is contained', () => {
    const password = 'Xk9#AnnezQ2$vL7!'
    expect(getPasswordStrength(password).level).toBe(4)
    expect(getPasswordStrength(password, { firstName: 'Anne' }).level).toBe(3)
  })

  it('never goes below level 0', () => {
    expect(getPasswordStrength('Aa1!', { firstName: 'Aa1' }).level).toBe(0)
    expect(getPasswordStrength('', { firstName: 'Anne', email: 'anne@x.com' }).level).toBe(0)
  })

  it('is deterministic', () => {
    expect(getPasswordStrength('Tr0ub4dor&3x')).toEqual(getPasswordStrength('Tr0ub4dor&3x'))
  })

  it('handles very long input without throwing', () => {
    expect(() => getPasswordStrength('Aa1!'.repeat(2500))).not.toThrow()
  })
})

describe('validateField', () => {
  it('delegates to the matching field validator', () => {
    expect(validateField('firstName', with_({ firstName: '' }))).toBe('First name is required.')
    expect(validateField('lastName', with_({ lastName: '' }))).toBe('Last name is required.')
    expect(validateField('email', with_({ email: 'a@b' }))).toBe('Enter a valid email like name@example.com.')
    expect(validateField('phone', with_({ phone: '123' }))).toBe('Enter a phone number with 7 to 11 digits.')
    expect(validateField('phone', with_({ phone: '' }))).toBe('Phone number is required.')
    expect(validateField('middleName', with_({ middleName: '9' }))).toBe(
      'Middle name can only contain letters, spaces, hyphens and apostrophes.',
    )
    expect(validateField('suffix', with_({ suffix: 'J1' }))).toBe('Suffix can only contain letters and periods.')
    expect(validateField('phoneCountry', with_({ phoneCountry: 'ZZ' }))).toBe('Choose a country calling code.')
    expect(validateField('consent', with_({ consent: false }))).toBe(
      'Please read and accept the Terms of Service and Privacy Policy to create an account.',
    )
  })

  it('returns null for valid fields', () => {
    for (const field of Object.keys(validValues) as (keyof SignUpValues)[]) {
      expect(validateField(field, validValues), field).toBeNull()
    }
  })
})

describe('FIELD_ORDER', () => {
  it('lists every field exactly once, in on-screen order', () => {
    expect(FIELD_ORDER).toEqual(Object.keys(validValues))
  })
})

describe('validateSignUp and isSignUpValid', () => {
  it('returns an empty object for valid values', () => {
    expect(validateSignUp(validValues)).toEqual({})
    expect(isSignUpValid(validValues)).toBe(true)
  })

  it('accepts a middle name, a suffix and another country', () => {
    const values = with_({ middleName: 'Dela Cruz', suffix: 'Jr.', phoneCountry: 'GB', phone: '07911123456' })
    expect(validateSignUp(values)).toEqual({})
    expect(isSignUpValid(values)).toBe(true)
  })

  it('collects errors from both steps keyed by field', () => {
    const values = with_({ lastName: 'Lee9', consent: false })
    expect(validateSignUp(values)).toEqual({
      lastName: 'Last name can only contain letters, spaces, hyphens and apostrophes.',
      consent: 'Please read and accept the Terms of Service and Privacy Policy to create an account.',
    })
    expect(isSignUpValid(values)).toBe(false)
  })

  it('reports an entirely empty form as invalid on every required field', () => {
    const empty: SignUpValues = {
      firstName: '',
      middleName: '',
      lastName: '',
      suffix: '',
      email: '',
      phoneCountry: 'PH',
      phone: '',
      consent: false,
    }
    expect(Object.keys(validateSignUp(empty)).sort()).toEqual(
      ['consent', 'email', 'firstName', 'lastName', 'phone'].sort(),
    )
    expect(isSignUpValid(empty)).toBe(false)
  })
})

describe('normalizeSignUp', () => {
  it('trims and normalises into the payload', () => {
    const payload = normalizeSignUp(
      with_({
        firstName: '  Mary   Ann ',
        middleName: '  Dela   Cruz ',
        lastName: ' Santos ',
        suffix: ' Jr. ',
        email: '  Anne@Example.COM ',
        phone: '09171234567',
      }),
    )
    expect(payload).toEqual({
      firstName: 'Mary Ann',
      middleName: 'Dela Cruz',
      lastName: 'Santos',
      suffix: 'Jr.',
      email: 'anne@example.com',
      phone: '+639171234567',
      consent: true,
    })
  })

  it('maps an empty middle name and suffix to null', () => {
    const payload = normalizeSignUp(with_({ middleName: '  ', suffix: '' }))
    expect(payload.middleName).toBeNull()
    expect(payload.suffix).toBeNull()
  })

  it('uses the selected country dial code', () => {
    expect(normalizeSignUp(with_({ phoneCountry: 'US', phone: '2025550123' })).phone).toBe('+12025550123')
  })

  it('does not include a password', () => {
    expect(normalizeSignUp(validValues)).not.toHaveProperty('password')
  })

  it('throws when the values are invalid', () => {
    expect(() => normalizeSignUp(with_({ email: 'bad' }))).toThrow()
    expect(() => normalizeSignUp(with_({ phone: '' }))).toThrow()
    expect(() => normalizeSignUp(with_({ consent: false }))).toThrow()
  })
})
