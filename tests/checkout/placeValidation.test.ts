import { describe, expect, it } from 'vitest'
import {
  cleanPlaceName,
  filterCity,
  filterPlace,
  validateCity,
  validatePlace,
} from '../../src/utils/checkoutValidation'

describe('city', () => {
  it('still drops digits and symbols, and now keeps periods, hyphens and apostrophes', () => {
    expect(filterCity('Pio V. Corpuz')).toBe('Pio V. Corpuz')
    expect(filterCity("Sta. Rosa-Nuevo's 12!")).toBe("Sta. Rosa-Nuevo's ")
    expect(filterCity('Cebu 😀')).toBe('Cebu ')
  })

  it('accepts PSGC style names and rejects other characters', () => {
    expect(validateCity('City of Las Piñas')).toBeNull()
    expect(validateCity('Pio V. Corpuz')).toBeNull()
    expect(validateCity('')).toBe('City is required.')
    expect(validateCity('Manila 1')).toBe('City can only contain letters, spaces, periods, hyphens and apostrophes.')
  })

  it('keeps the 40 character limit', () => {
    expect(filterCity('a'.repeat(60))).toHaveLength(40)
  })
})

describe('place (typed region or barangay)', () => {
  it('keeps letters, marks, digits, spaces and . \' ’ ( ) -', () => {
    expect(filterPlace("Barangay 176-A (Pob.) O'Brien’s")).toBe("Barangay 176-A (Pob.) O'Brien’s")
    expect(filterPlace('Poblacion <script>')).toBe('Poblacion script')
    expect(filterPlace('Cebu 😀')).toBe('Cebu ')
    expect(filterPlace('a'.repeat(120))).toHaveLength(80)
  })

  it('needs a letter and names the field in its message', () => {
    expect(validatePlace('Poblacion', 'Barangay')).toBeNull()
    expect(validatePlace('176-A', 'Barangay')).toBeNull()
    expect(validatePlace('  ', 'Barangay')).toBe('Barangay is required.')
    expect(validatePlace('12345', 'Barangay')).toBe('Barangay needs at least one letter.')
    expect(validatePlace('Zone #4', 'Region')).toMatch(/^Region can only contain letters, numbers, spaces/)
  })
})

describe('cleanPlaceName', () => {
  it('drops a parenthetical qualifier', () => {
    expect(cleanPlaceName('Pio V. Corpuz (Limbuhan)')).toBe('Pio V. Corpuz')
    expect(cleanPlaceName('Bacolod City (Capital)')).toBe('Bacolod City')
    expect(cleanPlaceName('Poblacion')).toBe('Poblacion')
  })
})
