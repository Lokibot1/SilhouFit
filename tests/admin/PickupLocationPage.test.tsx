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
  fetchPickupLocations: vi.fn(),
  createPickupLocation: vi.fn(),
  updatePickupLocation: vi.fn(),
  deletePickupLocation: vi.fn(),
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
  fetchPickupLocations: api.fetchPickupLocations,
  createPickupLocation: api.createPickupLocation,
  updatePickupLocation: api.updatePickupLocation,
  deletePickupLocation: api.deletePickupLocation,
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
// Leaflet is covered by the browser tests; here the preview only shows where it was asked to look.
vi.mock('../../src/components/admin/pickup/PickupMapPreview', () => ({
  default: ({ lat, lon }: { lat: number; lon: number }) => <div data-testid="map-preview">{`${lat},${lon}`}</div>,
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
  id: '7d1f6c0e-1b7a-4c53-9a0e-5f1c2d3e4a5b',
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
  isDefault: true,
  updatedAt: '2026-11-19T07:05:00.000Z',
}
const SPARE: PickupLocation = { ...SAVED, id: 'spare-id', label: 'Makati hub', contactName: 'Ben Cruz', streetAddress: '8 Ayala Avenue', cityMunicipality: 'City of Makati', latitude: 14.5547, longitude: 121.0244, isDefault: false }

const sorted = (list: { name: string }[]) => [...list].sort((a, b) => a.name.localeCompare(b.name))

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  localStorage.clear()
  act(() => setSession({ name: 'Ben Cruz', email: 'ben@example.com' }))
  api.fetchPickupLocations.mockResolvedValue([])
  // A write is followed by a read of the list, which sees the row the write made.
  api.createPickupLocation.mockImplementation(async (input: object) => {
    const row = { ...input, id: 'new-id', isDefault: true, updatedAt: '2026-11-19T07:05:00.000Z' }
    api.fetchPickupLocations.mockResolvedValue([row])
    return row
  })
  api.updatePickupLocation.mockImplementation(async (id: string, body: object) => {
    const row = { ...SAVED, ...body, id, updatedAt: '2026-11-19T07:05:00.000Z' }
    api.fetchPickupLocations.mockResolvedValue([row])
    return row
  })
  api.deletePickupLocation.mockResolvedValue(undefined)
  api.lookupPostal.mockResolvedValue('')
  api.reverseGeocode.mockResolvedValue({ street: '', postal: '', region: '', city: '', barangays: [] })
  api.getRegions.mockResolvedValue(regions)
  api.getProvinces.mockResolvedValue([])
  api.getCities.mockImplementation(async () => sorted(ncrCities))
  api.getBarangays.mockImplementation(async () => sorted(manilaBarangays))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'execCommand')
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
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument()
  })

  it('shows a skeleton, then the empty state with a way to set the location', async () => {
    let finish: (value: PickupLocation[]) => void = () => {}
    api.fetchPickupLocations.mockReturnValue(new Promise<PickupLocation[]>((resolve) => (finish = resolve)))
    setup()
    expect(screen.getByRole('status', { name: 'Loading the pickup location' })).toBeInTheDocument()
    await act(async () => finish([]))
    expect(screen.queryByRole('status', { name: 'Loading the pickup location' })).not.toBeInTheDocument()
    expect(screen.getByText(/No pickup location is set\. Checkout can't quote delivery and riders can't be booked until you set one\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set pickup location' })).toHaveClass('bg-success')
    expect(screen.getByRole('heading', { level: 2, name: 'No pickup location yet' })).toBeInTheDocument()
    const steps = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(steps.map((step) => step.textContent)).toEqual(['1Pin the spot on the map', '2Add the rider contact', '3Save and riders are sent there'])
  })

  it('styles Edit on the default card as the update action', async () => {
    api.fetchPickupLocations.mockResolvedValue([SAVED])
    setup()
    expect(await screen.findByRole('button', { name: /^Edit/ })).toHaveClass('bg-info', 'min-h-9')
  })

  it('shows the error with Retry, then the location once the retry works', async () => {
    api.fetchPickupLocations.mockRejectedValueOnce(new ProductListError('network'))
    const user = setup()
    expect(await screen.findByText("We couldn't load the pickup location.")).toBeInTheDocument()
    api.fetchPickupLocations.mockResolvedValue([SAVED])
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: /^Edit/ })).toBeInTheDocument()
  })

  it('shows the saved location as a summary with the time in 12-hour Manila time', async () => {
    api.fetchPickupLocations.mockResolvedValue([SAVED])
    setup()
    expect(await screen.findByText('Main store', { selector: 'p' })).toBeInTheDocument()
    const list = screen.getByText('12 Rizal Avenue, Barangay 176, City of Manila, NCR, 1000').closest('dl') as HTMLElement
    expect(within(list).getByText('14.599500, 120.984200')).toHaveClass('tabular-nums', 'font-mono')
    expect(within(list).getByText('+639171234567')).toHaveClass('tabular-nums')
    expect(within(list).getByText('Shared with assigned Lalamove riders upon pickup arrival.')).toBeInTheDocument()
    expect(screen.getByText(/Nov 19, 2026, 3:05 PM/).closest('p')).toHaveTextContent('Updated Nov 19, 2026, 3:05 PM')
    expect(screen.getByText(/Used for all new Lalamove rider bookings and checkout quotes\./)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Rider pin preview' })).toBeInTheDocument()
    expect(await screen.findByTestId('map-preview')).toHaveTextContent('14.5995,120.9842')
  })

  it('falls back to the city when the location has no label', async () => {
    api.fetchPickupLocations.mockResolvedValue([{ ...SAVED, label: null }])
    setup()
    expect(await screen.findByRole('button', { name: /^Edit/ })).toBeInTheDocument()
    expect(screen.getByText('City of Manila', { selector: 'p' })).toBeInTheDocument()
  })

  it('shows the Active for dispatch pill only once a location is saved, and a muted Not set when empty', async () => {
    let finish: (value: PickupLocation[]) => void = () => {}
    api.fetchPickupLocations.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    setup()
    expect(screen.queryByText('Active for dispatch')).not.toBeInTheDocument()
    expect(screen.queryByText('Not set')).not.toBeInTheDocument()
    await act(async () => finish([SAVED]))
    expect(await screen.findByText('Active for dispatch')).toBeInTheDocument()
    expect(screen.queryByText('Not set')).not.toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
    cleanup()

    api.fetchPickupLocations.mockResolvedValue([])
    setup()
    expect(await screen.findByText('Not set')).toBeInTheDocument()
    expect(screen.queryByText('Active for dispatch')).not.toBeInTheDocument()
  })

  it('names the dispatch zone: city and province, the region for NCR without one, or the city alone', async () => {
    api.fetchPickupLocations.mockResolvedValue([SAVED])
    setup()
    const zone = async () => (await screen.findByText('Dispatch zone')).nextElementSibling as HTMLElement
    expect(await zone()).toHaveTextContent(/^City of Manila, NCR$/)
    cleanup()

    api.fetchPickupLocations.mockResolvedValue([{ ...SAVED, province: 'Metro Manila', cityMunicipality: 'Makati City' }])
    setup()
    expect(await zone()).toHaveTextContent(/^Makati City, Metro Manila$/)
    cleanup()

    api.fetchPickupLocations.mockResolvedValue([{ ...SAVED, region: 'Central Luzon', province: null, cityMunicipality: 'Angeles City' }])
    setup()
    expect(await zone()).toHaveTextContent(/^Angeles City$/)
  })

  it('opens the saved coordinates in OpenStreetMap in a new tab, announced to screen readers', async () => {
    api.fetchPickupLocations.mockResolvedValue([SAVED])
    setup()
    const link = await screen.findByRole('link', { name: /^Open map/ })
    expect(link).toHaveAccessibleName('Open map, opens in a new tab')
    expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=14.5995&mlon=120.9842#map=17/14.5995/120.9842')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  describe('copy buttons', () => {
    const rows = [
      ['Copy address', '12 Rizal Avenue, Barangay 176, City of Manila, NCR, 1000', 'Address copied'],
      ['Copy rider phone number', '+639171234567', 'Rider phone number copied'],
      ['Copy coordinates', '14.599500, 120.984200', 'Coordinates copied'],
    ] as const

    it.each(rows)('%s puts the value on the clipboard and says so', async (name, text, message) => {
      api.fetchPickupLocations.mockResolvedValue([SAVED])
      const user = setup()
      await user.click(await screen.findByRole('button', { name }))
      expect(await navigator.clipboard.readText()).toBe(text)
      expect(await screen.findByText(message)).toBeInTheDocument()
    })

    it('swaps its icon for a check in the button that was copied', async () => {
      api.fetchPickupLocations.mockResolvedValue([SAVED])
      const user = setup()
      const button = await screen.findByRole('button', { name: 'Copy address' })
      expect(button.querySelector('rect')).not.toBeNull()
      await user.click(button)
      await waitFor(() => expect(button.querySelector('rect')).toBeNull())
    })

    it('falls back to selecting and copying when the Clipboard API refuses, keeping focus on the button', async () => {
      api.fetchPickupLocations.mockResolvedValue([SAVED])
      const user = setup()
      const button = await screen.findByRole('button', { name: 'Copy coordinates' })
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
      const exec = vi.fn().mockReturnValue(true)
      Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
      await user.click(button)
      expect(exec).toHaveBeenCalledWith('copy')
      expect(await screen.findByText('Coordinates copied')).toBeInTheDocument()
      expect(button).toHaveFocus()
      expect(document.querySelector('textarea')).toBeNull()
    })

    it('says plainly what to do when nothing can copy', async () => {
      api.fetchPickupLocations.mockResolvedValue([SAVED])
      const user = setup()
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
      Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) })
      await user.click(await screen.findByRole('button', { name: 'Copy address' }))
      expect(await screen.findByText(/Couldn't copy the address\. Your browser blocked clipboard access, so select the text and copy it by hand\./)).toBeInTheDocument()
      expect(screen.queryByText('Address copied')).not.toBeInTheDocument()
    })
  })

  it('saves a first location without a confirmation, then toasts, updates the summary and focuses the heading', async () => {
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Set pickup location' }))
    expect(screen.getByLabelText('Contact name')).toBeInTheDocument()
    expect(screen.queryByLabelText('Recipient name')).not.toBeInTheDocument()
    expect(screen.queryByText('Set as default address')).not.toBeInTheDocument()
    await fillNew(user)
    await user.click(saveButton())

    expect(await screen.findByText('Pickup location added')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.createPickupLocation).toHaveBeenCalledWith(
      {
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
      },
    )
    expect(await screen.findByRole('button', { name: /^Edit/ })).toBeInTheDocument()
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
    api.fetchPickupLocations.mockResolvedValue([SAVED])
    const user = setup()
    await user.click(await screen.findByRole('button', { name: /^Edit/ }))
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
    expect(api.updatePickupLocation).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Replace the pickup location?' })).not.toBeInTheDocument())
    expect(api.updatePickupLocation).not.toHaveBeenCalled()
    expect(screen.getByLabelText('House No., Street Name')).toHaveValue('99 Taft Avenue')
    expect(saveButton()).toBeEnabled()

    // Confirming saves the new one and updates the summary in place.
    await user.click(saveButton())
    await user.click(within(await screen.findByRole('dialog', { name: 'Replace the pickup location?' })).getByRole('button', { name: 'Replace pickup location' }))
    expect(await screen.findByText('Pickup location saved')).toBeInTheDocument()
    expect(api.updatePickupLocation).toHaveBeenCalledTimes(1)
    expect(api.updatePickupLocation).toHaveBeenCalledWith(SAVED.id, expect.objectContaining({ streetAddress: '99 Taft Avenue' }))
    expect(api.updatePickupLocation.mock.calls[0][1]).not.toHaveProperty('isDefault')
    expect(await screen.findByText(/99 Taft Avenue/)).toBeInTheDocument()
  })

  it('returns focus to the button that opened the form when it is cancelled', async () => {
    api.fetchPickupLocations.mockResolvedValue([SAVED])
    const user = setup()
    await user.click(await screen.findByRole('button', { name: /^Edit/ }))
    await screen.findByDisplayValue('Not applicable')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: /^Edit/ })).toHaveFocus()
  })

  it('keeps the buttons disabled while a replacement is saving', async () => {
    api.fetchPickupLocations.mockResolvedValue([SAVED])
    let finish: (value: object) => void = () => {}
    api.updatePickupLocation.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const user = setup()
    await user.click(await screen.findByRole('button', { name: /^Edit/ }))
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
    api.createPickupLocation.mockRejectedValue(error)
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Set pickup location' }))
    await fillNew(user)
    await user.click(saveButton())
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText('Postal code')).toHaveValue('1000')
    expect(saveButton()).toBeEnabled()
  })

  it('ends the session when the save is refused with 403', async () => {
    api.createPickupLocation.mockRejectedValue(new ProductListError('forbidden', undefined, 403))
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

  describe('several locations', () => {
    const both = () => api.fetchPickupLocations.mockResolvedValue([SAVED, SPARE])
    const spareCard = () => screen.getByRole('region', { name: 'Makati hub' })

    it('lists the default first with a Default pill, and the others under their own heading', async () => {
      both()
      setup()
      const main = await screen.findByRole('region', { name: 'Pickup address' })
      expect(within(main).getByText('Default')).toBeInTheDocument()
      expect(within(main).getByText(/Used for all new Lalamove rider bookings and checkout quotes\./)).toBeInTheDocument()
      expect(within(main).getByRole('button', { name: 'Edit Main store' })).toBeInTheDocument()
      expect(within(main).getByRole('button', { name: 'Delete Main store' })).toBeInTheDocument()
      expect(within(main).queryByRole('button', { name: /^Set as default/ })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: 'Other pickup locations' })).toBeInTheDocument()
      const spare = spareCard()
      expect(within(spare).queryByText('Default')).not.toBeInTheDocument()
      expect(within(spare).getByText('14.554700, 121.024400')).toHaveClass('tabular-nums', 'font-mono')
      expect(within(spare).getByRole('button', { name: 'Set as default Makati hub' })).toBeInTheDocument()
      expect(within(spare).getByRole('button', { name: 'Edit Makati hub' })).toBeInTheDocument()
      expect(within(spare).getByRole('button', { name: 'Delete Makati hub' })).toBeInTheDocument()
    })

    it('has no Delete and no Other locations list for the only location', async () => {
      api.fetchPickupLocations.mockResolvedValue([SAVED])
      setup()
      await screen.findByRole('button', { name: 'Edit Main store' })
      expect(screen.queryByRole('button', { name: 'Delete Main store' })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Other pickup locations' })).not.toBeInTheDocument()
    })

    it('adds a later location as a spare unless it is made the default', async () => {
      api.fetchPickupLocations.mockResolvedValue([SAVED])
      const user = setup()
      await user.click(await screen.findByRole('button', { name: 'Add pickup location' }))
      const box = screen.getByLabelText('Make this the default location')
      expect(box).not.toBeChecked()
      expect(box).toBeEnabled()
      expect(screen.getByText(/Leave this off to keep it saved as a spare/)).toBeInTheDocument()
      await fillNew(user)
      await user.click(saveButton())
      expect(await screen.findByText('Pickup location added')).toBeInTheDocument()
      expect(api.createPickupLocation.mock.calls[0][0]).not.toHaveProperty('isDefault')
      expect(screen.getByRole('heading', { level: 2, name: 'Pickup address' })).toHaveFocus()
    })

    it('makes the new location the default when the box is ticked', async () => {
      api.fetchPickupLocations.mockResolvedValue([SAVED])
      const user = setup()
      await user.click(await screen.findByRole('button', { name: 'Add pickup location' }))
      await fillNew(user)
      await user.click(screen.getByLabelText('Make this the default location'))
      await user.click(saveButton())
      await screen.findByText('Pickup location added')
      expect(api.createPickupLocation).toHaveBeenCalledWith(expect.objectContaining({ isDefault: true }))
    })

    it('says the first location is always the default, with the box locked on', async () => {
      const user = setup()
      await user.click(await screen.findByRole('button', { name: 'Set pickup location' }))
      expect(screen.getByLabelText('Make this the default location')).toBeChecked()
      expect(screen.getByLabelText('Make this the default location')).toBeDisabled()
      expect(screen.getByText('Your first pickup location is always the default.')).toBeInTheDocument()
    })

    it('edits a spare without the Replace dialog, and can make it the default from the form', async () => {
      both()
      const user = setup()
      await user.click(await screen.findByRole('button', { name: 'Edit Makati hub' }))
      await screen.findByDisplayValue('Not applicable')
      await user.clear(screen.getByLabelText('House No., Street Name'))
      await user.type(screen.getByLabelText('House No., Street Name'), '99 Taft Avenue')
      await user.click(screen.getByLabelText('Make this the default location'))
      await user.click(saveButton())
      expect(await screen.findByText('Pickup location saved')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(api.updatePickupLocation).toHaveBeenCalledWith(SPARE.id, expect.objectContaining({ streetAddress: '99 Taft Avenue', isDefault: true }))
    })

    it('asks before changing the default, showing Now and New; Cancel sends nothing and returns focus to the button', async () => {
      both()
      const user = setup()
      const opener = await screen.findByRole('button', { name: 'Set as default Makati hub' })
      await user.click(opener)
      const dialog = await screen.findByRole('dialog', { name: 'Change the default pickup location?' })
      expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument()
      expect(within(dialog).getByText('Now')).toBeInTheDocument()
      expect(within(dialog).getByText('Main store')).toBeInTheDocument()
      expect(within(dialog).getByText('New')).toBeInTheDocument()
      expect(within(dialog).getByText('Makati hub')).toBeInTheDocument()
      expect(within(dialog).getByText(/Riders are booked from the new location for all orders dispatched from now on/)).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(api.updatePickupLocation).not.toHaveBeenCalled()
      expect(opener).toHaveFocus()
    })

    it('sets the default on confirm, shows the swap, toasts and puts focus on the heading', async () => {
      both()
      api.updatePickupLocation.mockImplementation(async (id: string) => {
        api.fetchPickupLocations.mockResolvedValue([{ ...SPARE, isDefault: true }, { ...SAVED, isDefault: false }])
        return { ...SPARE, id, isDefault: true }
      })
      const user = setup()
      await user.click(await screen.findByRole('button', { name: 'Set as default Makati hub' }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Set as default' }))
      expect(await screen.findByText('Default pickup location changed')).toBeInTheDocument()
      expect(api.updatePickupLocation).toHaveBeenCalledWith(SPARE.id, { isDefault: true })
      const main = await screen.findByRole('region', { name: 'Pickup address' })
      expect(within(main).getByText('Makati hub', { selector: 'p' })).toBeInTheDocument()
      expect(within(screen.getByRole('region', { name: 'Main store' })).getByRole('button', { name: 'Delete Main store' })).toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Pickup address' })).toHaveFocus())
    })

    it('deletes the default after a dialog that says another location takes over', async () => {
      both()
      api.deletePickupLocation.mockImplementation(async () => {
        api.fetchPickupLocations.mockResolvedValue([{ ...SPARE, isDefault: true }])
      })
      const user = setup()
      await user.click(await screen.findByRole('button', { name: 'Delete Main store' }))
      const dialog = await screen.findByRole('dialog', { name: 'Delete this pickup location?' })
      expect(within(dialog).getByText(/This is the default location/)).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Delete pickup location' }))
      expect(await screen.findByText('Pickup location deleted')).toBeInTheDocument()
      expect(api.deletePickupLocation).toHaveBeenCalledWith(SAVED.id)
    })

    it('deletes a spare only after the Are you sure? dialog, then toasts', async () => {
      both()
      api.deletePickupLocation.mockImplementation(async () => {
        api.fetchPickupLocations.mockResolvedValue([SAVED])
      })
      const user = setup()
      await user.click(await screen.findByRole('button', { name: 'Delete Makati hub' }))
      const dialog = await screen.findByRole('dialog', { name: 'Delete this pickup location?' })
      expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(api.deletePickupLocation).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Delete Makati hub' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete pickup location' }))
      expect(await screen.findByText('Pickup location deleted')).toBeInTheDocument()
      expect(api.deletePickupLocation).toHaveBeenCalledWith(SPARE.id)
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Makati hub' })).not.toBeInTheDocument())
      await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Pickup address' })).toHaveFocus())
    })

    it('keeps both buttons disabled while the delete is in flight', async () => {
      both()
      let finish: () => void = () => {}
      api.deletePickupLocation.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
      const user = setup()
      await user.click(await screen.findByRole('button', { name: 'Delete Makati hub' }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Delete pickup location' }))
      expect(within(dialog).getByRole('button', { name: 'Delete pickup location' })).toBeDisabled()
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
      await act(async () => finish())
      expect(await screen.findByText('Pickup location deleted')).toBeInTheDocument()
    })

    it('explains a 400 on the last location, with what to do, and keeps the list', async () => {
      both()
      api.deletePickupLocation.mockRejectedValue(new ProductListError('validation', 'Cannot delete the only pickup location', 400))
      const user = setup()
      await user.click(await screen.findByRole('button', { name: 'Delete Makati hub' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete pickup location' }))
      expect(await screen.findByText(/We couldn't delete the pickup location\. It is the only pickup location, and riders need somewhere to collect orders\. Add another one first\./)).toBeInTheDocument()
      expect(screen.queryByText('Pickup location deleted')).not.toBeInTheDocument()
      expect(spareCard()).toBeInTheDocument()
    })

    it('says the location is gone on a 404 and reloads the list', async () => {
      both()
      api.updatePickupLocation.mockRejectedValue(new ProductListError('not-found', 'Pickup location with ID "x" not found', 404))
      const user = setup()
      await user.click(await screen.findByRole('button', { name: 'Set as default Makati hub' }))
      api.fetchPickupLocations.mockResolvedValue([SAVED])
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Set as default' }))
      expect(await screen.findByText(/We couldn't change the default pickup location\. That pickup location no longer exists, probably deleted on another device\. We reloaded the list\./)).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Makati hub' })).not.toBeInTheDocument())
    })

    it('ends the session when an action is refused with 403', async () => {
      both()
      api.deletePickupLocation.mockRejectedValue(new ProductListError('forbidden', undefined, 403))
      const user = setup()
      await user.click(await screen.findByRole('button', { name: 'Delete Makati hub' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete pickup location' }))
      await waitFor(() => expect(api.signOut).toHaveBeenCalled())
    })

    it('returns focus to the Add button when the form is cancelled', async () => {
      api.fetchPickupLocations.mockResolvedValue([SAVED])
      const user = setup()
      await user.click(await screen.findByRole('button', { name: 'Add pickup location' }))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('button', { name: 'Add pickup location' })).toHaveFocus()
    })

    it('shows no Add button in the empty state, where Set pickup location is the call to action', async () => {
      setup()
      await screen.findByRole('button', { name: 'Set pickup location' })
      expect(screen.queryByRole('button', { name: 'Add pickup location' })).not.toBeInTheDocument()
    })
  })
})
