import { describe, expect, it } from 'vitest'
import { homeFor, isStaffRole } from '../../src/utils/staffRole'

describe('staff roles', () => {
  it.each(['staff', 'admin', 'superadmin'] as const)('%s lands on its own dashboard', (role) => {
    expect(isStaffRole(role)).toBe(true)
    expect(homeFor(role)).toBe(`/${role}`)
  })

  it.each([undefined, 'customer'] as const)('%s lands on the profile', (role) => {
    expect(isStaffRole(role)).toBe(false)
    expect(homeFor(role)).toBe('/profile')
  })
})
