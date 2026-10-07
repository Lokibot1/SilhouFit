import { describe, expect, it } from 'vitest'
import { COUNTRIES, findCountry } from '../data/countries'
import { searchCountries } from './countrySearch'

const codes = (query: string) => searchCountries(query).map((country) => country.code)

describe('countries dataset', () => {
  it('has unique ISO codes, valid dial codes and is sorted by name', () => {
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length)
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/)
      expect(country.dial).toMatch(/^\+\d{1,3}$/)
    }
    const names = COUNTRIES.map((c) => c.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')))
  })

  it('has the default country and shared +1', () => {
    expect(findCountry('PH')).toMatchObject({ name: 'Philippines', dial: '+63' })
    expect(COUNTRIES.filter((c) => c.dial === '+1').length).toBeGreaterThan(10)
    expect(findCountry('ZZ')).toBeUndefined()
  })
})

describe('searchCountries', () => {
  it('returns everything for an empty or blank query', () => {
    expect(searchCountries('')).toHaveLength(COUNTRIES.length)
    expect(searchCountries('   ')).toHaveLength(COUNTRIES.length)
  })

  it('matches names case-insensitively', () => {
    expect(codes('philippines')).toEqual(['PH'])
    expect(codes('PHILIP')).toEqual(['PH'])
  })

  it('matches the ISO code', () => {
    expect(codes('ph')[0]).toBe('PH')
    expect(codes('jp')[0]).toBe('JP')
  })

  it('matches dial codes with or without the plus', () => {
    expect(codes('+63')).toContain('PH')
    expect(codes('63')).toContain('PH')
    expect(codes('+44')).toEqual(expect.arrayContaining(['GB', 'JE', 'GG', 'IM']))
    expect(codes('44')).not.toContain('PH')
    expect(codes('+1')).toEqual(expect.arrayContaining(['US', 'CA', 'JM']))
  })

  it('treats dial queries as exact first, then prefix', () => {
    const result = codes('+9')
    expect(result.length).toBeGreaterThan(5)
    expect(codes('+99')).toEqual(expect.arrayContaining(['AZ', 'KG', 'UZ']))
  })

  it('ignores diacritics and apostrophes', () => {
    expect(codes('cote')).toEqual(['CI'])
    expect(codes("cote d'ivoire")).toEqual(['CI'])
    expect(codes('curacao')).toEqual(['CW'])
    expect(codes('turkiye')).toEqual(['TR'])
    expect(codes('reunion')).toEqual(['RE'])
    expect(codes('Ålan')[0]).toBe('AX')
  })

  it('ranks prefix matches before contains matches', () => {
    const result = searchCountries('guin').map((c) => c.name)
    const firstContains = result.findIndex((name) => !name.toLowerCase().startsWith('guin'))
    expect(firstContains).toBeGreaterThan(0)
    expect(result.slice(0, firstContains).every((n) => n.toLowerCase().startsWith('guin'))).toBe(true)
    expect(result).toContain('Papua New Guinea')
    expect(result.indexOf('Papua New Guinea')).toBeGreaterThanOrEqual(firstContains)
  })

  it('ranks an exact ISO code ahead of name matches', () => {
    expect(codes('in')[0]).toBe('IN')
    expect(codes('us')[0]).toBe('US')
  })

  it('returns an empty list when nothing matches', () => {
    expect(searchCountries('xyz')).toEqual([])
    expect(searchCountries('+0000')).toEqual([])
  })
})
