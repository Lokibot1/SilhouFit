import { describe, expect, it } from 'vitest'
import { matchPlace, matchRegion, normalizePlace } from '../../src/utils/psgcMatch'
import regions from '../fixtures/psgc/regions.json'
import ncrCities from '../fixtures/psgc/ncr-cities.json'

const named = (...names: string[]) => names.map((name, i) => ({ code: String(i), name }))

describe('normalizePlace', () => {
  it('lowercases, drops accents, labels, qualifiers and punctuation', () => {
    expect(normalizePlace('City of Las Piñas')).toBe('las pinas')
    expect(normalizePlace('Barangay 176-A')).toBe('176 a')
    expect(normalizePlace('Brgy. 176')).toBe('176')
    expect(normalizePlace('Bacolod City (Capital)')).toBe('bacolod city')
    expect(normalizePlace('Poblacion (Pob.)')).toBe('poblacion')
    expect(normalizePlace('Municipality of Pateros')).toBe('pateros')
  })
})

describe('matchPlace', () => {
  it('matches "Manila" to "City of Manila" and "Las Piñas" with or without the accent', () => {
    expect(matchPlace(ncrCities, 'Manila')?.name).toBe('City of Manila')
    expect(matchPlace(ncrCities, 'Las Piñas')?.name).toBe('City of Las Piñas')
    expect(matchPlace(ncrCities, 'Las Pinas')?.name).toBe('City of Las Piñas')
    expect(matchPlace(ncrCities, 'Quezon City')?.name).toBe('Quezon City')
  })

  it('matches a numbered barangay however it is written', () => {
    const list = named('Barangay 1', 'Barangay 17', 'Barangay 176', 'Barangay 176-A')
    expect(matchPlace(list, 'Barangay 176')?.name).toBe('Barangay 176')
    expect(matchPlace(list, 'Brgy. 17')?.name).toBe('Barangay 17')
    expect(matchPlace(list, '176-A')?.name).toBe('Barangay 176-A')
  })

  it('takes a unique prefix, and refuses an ambiguous one', () => {
    expect(matchPlace(named('Pasay City', 'Pateros'), 'Pasay')?.name).toBe('Pasay City')
    expect(matchPlace(named('San Juan', 'San Pedro'), 'San')).toBeNull()
  })

  it('matches inside a longer name only for a real word, and only once', () => {
    expect(matchPlace(named('Pio V. Corpuz (Limbuhan)', 'Poblacion'), 'Corpuz')?.name).toContain('Corpuz')
    expect(matchPlace(named('Barangay 117', 'Barangay 1170'), '17')).toBeNull()
  })

  it('returns null rather than guess', () => {
    expect(matchPlace(ncrCities, 'Atlantis')).toBeNull()
    expect(matchPlace(ncrCities, '')).toBeNull()
  })
})

describe('matchRegion', () => {
  it('maps OpenStreetMap region names onto PSGC regions', () => {
    expect(matchRegion(regions, 'Metro Manila')?.name).toBe('NCR')
    expect(matchRegion(regions, 'National Capital Region')?.name).toBe('NCR')
    expect(matchRegion(regions, 'Calabarzon')?.name).toBe('CALABARZON')
    expect(matchRegion(regions, 'Region IV-A')?.name).toBe('CALABARZON')
    expect(matchRegion(regions, 'Mimaropa')?.name).toBe('MIMAROPA Region')
    expect(matchRegion(regions, 'Cordillera Administrative Region')?.name).toBe('CAR')
  })

  it('returns null for a region that is not in the list', () => {
    expect(matchRegion(regions, 'Singapore')).toBeNull()
  })
})
