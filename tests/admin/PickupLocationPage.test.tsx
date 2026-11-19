import { useState } from 'react'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { ProductListError } from '../../src/service/fetchProductList'
import type { PickupLocation } from '../../src/service/pickupLocation'
import { clearSession, setSession } from '../../src/service/session'
import { PickupLocationPage } from '../../src/views/admin/PickupLocationPage'
import regions from '../fixtures/psgc/regions.json'
import ncrCities from '../fixtures/psgc/ncr-cities.json'
import manilaBarangays from '../fixtures/psgc/manila-barangays.json'

const api = vi.hoisted(() => ({
  fetchPickupLocation: vi.fn(),
  savePickupLocation: vi.fn(),
  getRegions: vi.fn(),
  getProvinces: vi.fn(),
  getCities: vi.fn(),
  getBarangays: vi.fn(),
  reverseGeocode: vi.fn(),
  lookupPostal: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../../src/service/pickupLocation', async (original) => ({
  ...(await original<typeof import('../../src/service/pickupLocation')>()),
  fetchPickupLocation: api.fetchPickupLocation,
  savePickupLocation: api.savePickupLocation,
}))
vi.mock('../../src/service/psgc', async (original) => ({
  ...(await original<typeof import('../../src/service/psgc')>()),
  getRegions: api.getRegions,
  getProvinces: api.getProvinces,
  getCities: api.getCities,
  getBarangays: api.getBarangays,
}))
vi.mock('../../src/service/reverseGeocode', async (original) => ({
  ...(await original<typeof import('../../src/service/reverseGeocode')>()),
  reverseGeocode: api.reverseGeocode,
  lookupPostal: api.lookupPostal,
}))
vi.mock('../../src/service/signOut', () => ({ signOut: api.signOut }))
// The real map is covered in MapPicker.test.tsx; here it only hands a position back.
vi.mock('../../src/components/address/MapPicker', () => ({
  default: function Picker({ onBack, onUse, note }: { onBack: () => void; onUse: (lat: number, lon: number) => Promise<string | null>; note?: string }) {
    const [refused, setRefused] = useState<string | null>(null)
    return (
      <div>
        <p>{note}</p>
        <button type="button" onClick={() => void onUse(14.5995, 120.9842).then(setRefused)}>
          Use this location
        </button>
        <button type="button" onClick={onBack}>
          Back to form
        </button>
        {refused && <p role="alert">{refused}</p>}
      </div>
    )
  },
}))

const SAVED: PickupLocation = {
  label: 'Main store',
  contactName: 'Anne Santos',
  contactPhone: '+639171234567',
  region: 'NCR',
  province: null,
  cityMunicipality: 'City of Manila',
  barangay: 'Barangay 176',
  streetAddress: '12 Rizal Avenue',
  addressLine2: null,
  postalCode: '1000',
  latitude: 14.5995,
  longitude: 120.9842,
  updatedAt: '2026-11-19T07:05:00.000Z',
  updatedBy: { id: 'u1', fullName: 'Ben Cruz' },
}

const sorted = (list: { name: string }[]) => [...list].sort((a, b) => a.name.localeCompare(b.name))

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  localStorage.clear()
  act(() => setSession({ name: 'Ben Cruz', email: 'ben@example.com' }))
  api.fetchPickupLocation.mockResolvedValue(null)
  api.savePickupLocation.mockImplementation(async (input: object) => ({ ...input, updatedAt: '2026-11-19T07:05:00.000Z', updatedBy: { id: 'u1', fullName: 'Ben Cruz' } }))
  api.lookupPostal.mockResolvedValue('')
  api.reverseGeocode.mockResolvedValue({ street: '', postal: '', region: '', city: '', barangays: [] })
  api.getRegions.mockResolvedValue(regions)
  api.getProvinces.mockResolvedValue([])
  api.getCities.mockImplementation(async () => sorted(ncrCities))
  api.getBarangays.mockImplementation(async () => sorted(manilaBarangays))
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  act(() => clearSession())
  document.title = ''
})

function setup() {
  const user = userEvent.setup({ delay: null })
  render(
    <ToastProvider>
      <PickupLocationPage />
    </ToastProvider>,
  )
  return user
}

type User = ReturnType<typeof userEvent.setup>
async function pick(user: User, field: RegExp, option: RegExp | string) {
  await user.click(await screen.findByRole('button', { name: field }))
  await user.click(await screen.findByRole('option', { name: option }))
}
/** A first pickup location, through the stand-in map. */
async function fillNew(user: User) {
  await user.click(screen.getByRole('button', { name: 'Pin on a map' }))
  await user.click(await screen.findByRole('button', { name: 'Use this location' }))
  await screen.findByText(/Pin placed/)
  await user.type(screen.getByLabelText('Contact name'), 'Anne Santos')
  await user.type(screen.getByLabelText('Phone number'), '917 123 4567')
  await pick(user, /^Region/, /NCR/)
  await pick(user, /^City or municipality/, 'City of Manila')
  await pick(user, /^Barangay/, 'Barangay 176')
  await user.type(screen.getByLabelText('House No., Street Name'), '12 Rizal Avenue')
  await user.type(screen.getByLabelText('Postal code'), '1000')
}
const saveButton = () => screen.getByRole('button', { name: 'Save pickup location' })

describe('PickupLocationPage', () => {
  it('sets a short, unique title and a 150-160 character description', () => {
    setup()
    expect(document.title).toBe('Pickup location — SilhouFit')
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
    expect(description.length).toBeGreaterThanOrEqual(150)
    expect(description.length).toBeLessThanOrEqual(160)
    expect(screen.getByRole('heading', { level: 1, name: 'Pickup location' })).toBeInTheDocument()
    expect(screen.getByText('Where Lalamove riders collect orders.')).toBeInTheDocument()
    expect(screen.getByText('Sample data')).toBeInTheDocument()
  })

  it('shows a skeleton, then the empty state with a way to set the location', async () => {
    let finish: (value: null) => void = () => {}
    api.fetchPickupLocation.mockReturnValue(new Promise<null>((resolve) => (finish = resolve)))
    setup()
    expect(screen.getByRole('status', { name: 'Loading the pickup location' })).toBeInTheDocument()
    await act(async () => finish(null))
    expect(screen.queryByRole('status', { name: 'Loading the pickup location' })).not.toBeInTheDocument()
    expect(screen.getByText(/No pickup location is saved here yet\. Until you save one, riders go to the address in the server settings\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set pickup location' })).toBeInTheDocument()
  })

  it('shows the error with Retry, then the location once the retry works', async () => {
    api.fetchPickupLocation.mockRejectedValueOnce(new ProductListError('network'))
    const user = setup()
    expect(await screen.findByText("We couldn't load the pickup location.")).toBeInTheDocument()
    api.fetchPickupLocation.mockResolvedValue(SAVED)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Change pickup location' })).toBeInTheDocument()
  })

  it('shows the saved location as a summary with the time in 12-hour Manila time', async () => {
    api.fetchPickupLocation.mockResolvedValue(SAVED)
    setup()
    const list = (await screen.findByText('Main store')).closest('dl') as HTMLElement
    expect(within(list).getByText('12 Rizal Avenue, Barangay 176, City of Manila, NCR, 1000')).toBeInTheDocument()
    expect(within(list).getByText('14.599500, 120.984200')).toHaveClass('tabular-nums')
    expect(within(list).getByText('+639171234567')).toBeInTheDocument()
    expect(within(list).getByText(/Nov 19, 2026, 3:05 PM by Ben Cruz/)).toBeInTheDocument()
  })

  it('saves a first location without a confirmation, then toasts, updates the summary and focuses the heading', async () => {
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Set pickup location' }))
    expect(screen.getByLabelText('Contact name')).toBeInTheDocument()
    expect(screen.queryByLabelText('Recipient name')).not.toBeInTheDocument()
    expect(screen.queryByText('Set as default address')).not.toBeInTheDocument()
    await fillNew(user)
    await user.click(saveButton())

    expect(await screen.findByText('Pickup location saved')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.savePickupLocation).toHaveBeenCalledWith({
      label: null,
      contactName: 'Anne Santos',
      contactPhone: '+639171234567',
      region: 'NCR',
      province: null,
      cityMunicipality: 'City of Manila',
      barangay: 'Barangay 176',
      streetAddress: '12 Rizal Avenue',
      addressLine2: null,
      postalCode: '1000',
      latitude: 14.5995,
      longitude: 120.9842,
    })
    expect(await screen.findByRole('button', { name: 'Change pickup location' })).toBeInTheDocument()
    expect(screen.getByText('14.599500, 120.984200')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Pickup address' })).toHaveFocus()
  })

  it('says the pin is not a delivery address, in the hint and on the map', async () => {
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Set pickup location' }))
    expect(screen.getByText(/Riders are sent to this exact spot/)).toBeInTheDocument()
    expect(screen.queryByText(/We need it to deliver/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pin on a map' }))
    expect(await screen.findByText(/The pin is saved as the pickup spot/)).toBeInTheDocument()
  })

  it('asks before replacing a saved location, showing Now and New; Cancel keeps the old one and the form', async () => {
    api.fetchPickupLocation.mockResolvedValue(SAVED)
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Change pickup location' }))
    await screen.findByDisplayValue('Not applicable')
    expect(screen.getByLabelText('Contact name')).toHaveValue('Anne Santos')
    await user.clear(screen.getByLabelText('House No., Street Name'))
    await user.type(screen.getByLabelText('House No., Street Name'), '99 Taft Avenue')
    await user.click(saveButton())

    const dialog = await screen.findByRole('dialog', { name: 'Replace the pickup location?' })
    expect(within(dialog).getByText('Now')).toBeInTheDocument()
    expect(within(dialog).getByText(/12 Rizal Avenue/)).toBeInTheDocument()
    expect(within(dialog).getByText('New')).toBeInTheDocument()
    expect(within(dialog).getByText(/99 Taft Avenue/)).toBeInTheDocument()
    expect(within(dialog).getByText('Riders booked after this go to the new spot. Orders already handed to a rider are not affected.')).toBeInTheDocument()
    expect(api.savePickupLocation).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Replace the pickup location?' })).not.toBeInTheDocument())
    expect(api.savePickupLocation).not.toHaveBeenCalled()
    expect(screen.getByLabelText('House No., Street Name')).toHaveValue('99 Taft Avenue')
    expect(saveButton()).toBeEnabled()

    // Confirming saves the new one and updates the summary in place.
    await user.click(saveButton())
    await user.click(within(await screen.findByRole('dialog', { name: 'Replace the pickup location?' })).getByRole('button', { name: 'Replace pickup location' }))
    expect(await screen.findByText('Pickup location saved')).toBeInTheDocument()
    expect(api.savePickupLocation).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/99 Taft Avenue/)).toBeInTheDocument()
  })

  it('returns focus to the button that opened the form when it is cancelled', async () => {
    api.fetchPickupLocation.mockResolvedValue(SAVED)
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Change pickup location' }))
    await screen.findByDisplayValue('Not applicable')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Change pickup location' })).toHaveFocus()
  })

  it('keeps the buttons disabled while a replacement is saving', async () => {
    api.fetchPickupLocation.mockResolvedValue(SAVED)
    let finish: (value: object) => void = () => {}
    api.savePickupLocation.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Change pickup location' }))
    await screen.findByDisplayValue('Not applicable')
    await user.click(saveButton())
    const dialog = await screen.findByRole('dialog', { name: 'Replace the pickup location?' })
    await user.click(within(dialog).getByRole('button', { name: 'Replace pickup location' }))
    expect(within(dialog).getByRole('button', { name: 'Replace pickup location' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await act(async () => finish({ ...SAVED, updatedAt: '2026-11-19T08:00:00.000Z' }))
    expect(await screen.findByText('Pickup location saved')).toBeInTheDocument()
  })

  it.each([
    [new ProductListError('validation', 'postalCode must be 4 digits', 400), /The server said: postalCode must be 4 digits/],
    [new ProductListError('rate-limit', undefined, 429), /Our servers are limiting requests/],
    [new ProductListError('network'), /The connection dropped/],
    [new ProductListError('server'), /Something went wrong on our side/],
  ])('shows a failed save inside the form and keeps what was typed (%#)', async (error, message) => {
    api.savePickupLocation.mockRejectedValue(error)
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Set pickup location' }))
    await fillNew(user)
    await user.click(saveButton())
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText('Postal code')).toHaveValue('1000')
    expect(saveButton()).toBeEnabled()
  })

  it('ends the session when the save is refused with 403', async () => {
    api.savePickupLocation.mockRejectedValue(new ProductListError('forbidden', undefined, 403))
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Set pickup location' }))
    await fillNew(user)
    await user.click(saveButton())
    await waitFor(() => expect(api.signOut).toHaveBeenCalled())
  })

  it('warns before the tab closes only while the form is open and edited', async () => {
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Set pickup location' }))
    const untouched = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(untouched)
    expect(untouched.defaultPrevented).toBe(false)
    await user.type(screen.getByLabelText('Label (optional)'), 'Main')
    const edited = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(edited)
    expect(edited.defaultPrevented).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    const closed = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(closed)
    expect(closed.defaultPrevented).toBe(false)
  })
})
