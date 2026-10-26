import type { Address } from '../../src/service/addresses'

/** A saved address in the shape the API returns, in NCR so the PSGC fixtures resolve it. */
export const ADDRESS: Address = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Home',
  recipientName: 'Anne Santos',
  phone: '+639171234567',
  region: 'NCR',
  province: null,
  cityMunicipality: 'City of Manila',
  barangay: 'Barangay 176',
  streetAddress: '12 Rizal Avenue',
  addressLine2: null,
  postalCode: '1000',
  country: 'PH',
  isDefault: true,
  createdAt: '2026-03-01T08:00:00.000Z',
  updatedAt: '2026-03-01T08:00:00.000Z',
}

/** ADDRESS with some fields changed; give a different `id` for a second address. */
export const address = (over: Partial<Address> = {}): Address => ({ ...ADDRESS, ...over })
