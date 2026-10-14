import { useState } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressForm } from '../../src/components/address/AddressForm'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { getAddress, type SavedAddress } from '../../src/service/address'
import { PsgcError } from '../../src/service/psgc'
import { ReverseGeocodeError } from '../../src/service/reverseGeocode'
import { clearSession, setSession } from '../../src/service/session'
import regions from '../fixtures/psgc/regions.json'
import ncrCities from '../fixtures/psgc/ncr-cities.json'
import manilaBarangays from '../fixtures/psgc/manila-barangays.json'
import calabarzonProvinces from '../fixtures/psgc/calabarzon-provinces.json'
import calabarzonCities from '../fixtures/psgc/calabarzon-cities.json'
import batangasBarangays from '../fixtures/psgc/batangas-city-barangays.json'

const api = vi.hoisted(() => ({
  getRegions: vi.fn(),
  getProvinces: vi.fn(),
  getCities: vi.fn(),
  getBarangays: vi.fn(),
  reverseGeocode: vi.fn(),
  saveAddress: vi.fn(),
}))
vi.mock('../../src/service/address', async (original) => ({
  ...(await original<typeof import('../../src/service/address')>()),
  saveAddress: api.saveAddress,
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
}))
// The real map is covered in MapPicker.test.tsx; here it only hands a position back.
vi.mock('../../src/components/address/MapPicker', () => ({
  default: function Picker({ onBack, onUse }: { onBack: () => void; onUse: (lat: number, lon: number) => Promise<string | null> }) {
    const [refused, setRefused] = useState<string | null>(null)
    return (
      <div>
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

const NCR = '130000000'
const sorted = (list: { name: string }[]) => [...list].sort((a, b) => a.name.localeCompare(b.name))

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  localStorage.clear()
  act(() => setSession({ name: 'Anne Santos', email: 'anne@example.com' }))
  api.saveAddress.mockImplementation(async (email: string, address: SavedAddress) =>
    (await vi.importActual<typeof import('../../src/service/address')>('../../src/service/address')).saveAddress(email, address),
  )
  api.getRegions.mockResolvedValue(regions)
  api.getProvinces.mockImplementation(async (code: string) => (code === NCR ? [] : calabarzonProvinces))
  api.getCities.mockImplementation(async (code: string) => sorted(code === NCR ? ncrCities : calabarzonCities))
  api.getBarangays.mockImplementation(async (code: string) => sorted(code === '133900000' ? manilaBarangays : batangasBarangays))
})
afterEach(() => {
  vi.clearAllMocks()
  act(() => clearSession())
})

function setup(props: { initial?: SavedAddress | null } = {}) {
  const onSaved = vi.fn<(a: SavedAddress) => void>()
  const user = userEvent.setup({ delay: null })
  render(
    <ToastProvider>
      <AddressForm
        initial={props.initial ?? null}
        onSaved={onSaved}
        footer={(submit) => (
          <div>
            <button type="button">Skip this step</button>
            {submit}
          </div>
        )}
      />
    </ToastProvider>,
  )
  return { user, onSaved }
}

type User = ReturnType<typeof userEvent.setup>
async function pick(user: User, field: RegExp, option: RegExp | string) {
  await user.click(await screen.findByRole('button', { name: field }))
  await user.click(await screen.findByRole('option', { name: option }))
}
async function pickManila(user: User) {
  await pick(user, /^Region/, /NCR/)
  await pick(user, /^City or municipality/, 'City of Manila')
  await pick(user, /^Barangay/, 'Barangay 176')
}

describe('AddressForm', () => {
  it('cascades: a level stays disabled until the one above is chosen, and changing a level clears those below', async () => {
    const { user } = setup()
    expect(await screen.findByRole('button', { name: /^City or municipality/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Barangay/ })).toBeDisabled()

    await pickManila(user)
    expect(screen.getByRole('button', { name: /^City or municipality/ })).toHaveTextContent('City of Manila')
    expect(screen.getByRole('button', { name: /^Barangay/ })).toHaveTextContent('Barangay 176')

    await pick(user, /^Region/, /CALABARZON/)
    expect(screen.getByRole('button', { name: /^City or municipality/ })).toHaveTextContent('Select your city or municipality')
    expect(screen.getByRole('button', { name: /^Barangay/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Barangay/ })).toHaveTextContent('Choose a city or municipality first')
    // Dimming the whole control would drop the instruction under 4.5:1, so it is muted by colour instead.
    expect(screen.getByRole('button', { name: /^Barangay/ })).toHaveClass('disabled:opacity-100!')
  })

  it('shows the province read-only: none for NCR, derived for a province city', async () => {
    const { user } = setup()
    await pick(user, /^Region/, /NCR/)
    await pick(user, /^City or municipality/, 'City of Manila')
    const province = screen.getByLabelText('Province')
    expect(province).toHaveAttribute('readonly')
    expect(province).toHaveAttribute('aria-readonly', 'true')
    expect(province).toHaveAttribute('tabindex', '-1')
    expect(province).toHaveAttribute('inputmode', 'none')
    await waitFor(() => expect(province).toHaveValue('Not applicable'))

    await pick(user, /^Region/, /CALABARZON/)
    await pick(user, /^City or municipality/, 'Batangas City')
    await waitFor(() => expect(screen.getByLabelText('Province')).toHaveValue('Batangas'))
  })

  it('shows counters and keeps digits only in the postal code', async () => {
    const { user } = setup()
    expect(screen.getByLabelText('Street address').closest('.field')).toHaveTextContent('0/120')
    await user.type(screen.getByLabelText('Postal code'), '12ab34567')
    expect(screen.getByLabelText('Postal code')).toHaveValue('1234')
    expect(screen.getByLabelText('Postal code').closest('.field')).toHaveTextContent('4/4')
  })

  it('shows an inline error after a field is left, and on every missing field at submit', async () => {
    const { user, onSaved } = setup()
    await user.type(screen.getByLabelText('Street address'), 'ab')
    await user.tab()
    expect(await screen.findByText('Enter the house number, street and barangay, at least 5 characters.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save address' }))
    expect(await screen.findByText('Choose your region.')).toBeInTheDocument()
    expect(screen.getByText('Choose your city or municipality.')).toBeInTheDocument()
    expect(screen.getByText('Choose your barangay.')).toBeInTheDocument()
    expect(screen.getByText('Postal code is required.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^Region/ })).toHaveFocus()
  })

  it('saves on this device and hands the address back', async () => {
    const { user, onSaved } = setup()
    await pickManila(user)
    await user.type(screen.getByLabelText('Street address'), '12 Rizal Avenue')
    await user.type(screen.getByLabelText('Postal code'), '1000')
    await user.click(screen.getByRole('button', { name: 'Save address' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const saved = {
      regionCode: NCR,
      region: 'NCR',
      province: '',
      cityCode: '133900000',
      city: 'City of Manila',
      barangayCode: '133901176',
      barangay: 'Barangay 176',
      street: '12 Rizal Avenue',
      postal: '1000',
    }
    expect(onSaved).toHaveBeenCalledWith(saved)
    expect(await getAddress('anne@example.com')).toEqual(saved)
  })

  it('lets the user type the place instead, saving it without codes', async () => {
    const { user, onSaved } = setup()
    await user.click(await screen.findByRole('button', { name: 'Type it instead' }))
    expect(screen.queryByRole('button', { name: /^Region/ })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Region'), 'Region 7 (Central Visayas)')
    await user.type(screen.getByLabelText('City or municipality'), 'Mandaue City')
    await user.type(screen.getByLabelText('Barangay'), 'Subangdaku')
    await user.type(screen.getByLabelText('Street address'), '5 Seaside Drive')
    await user.type(screen.getByLabelText('Postal code'), '6014')
    await user.click(screen.getByRole('button', { name: 'Save address' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSaved.mock.calls[0][0]).toMatchObject({
      regionCode: null,
      region: 'Region 7 (Central Visayas)',
      cityCode: null,
      city: 'Mandaue City',
      barangayCode: null,
      barangay: 'Subangdaku',
    })
  })

  it('validates typed places', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Type it instead' }))
    await user.type(screen.getByLabelText('Barangay'), '12345')
    await user.tab()
    expect(await screen.findByText('Barangay needs at least one letter.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('City or municipality'), 'Cebu 2')
    expect(screen.getByLabelText('City or municipality')).toHaveValue('Cebu ')
  })

  it('disables Save while saving, so it cannot be sent twice', async () => {
    api.saveAddress.mockReturnValue(new Promise(() => {}))
    const { user, onSaved } = setup()
    await pickManila(user)
    await user.type(screen.getByLabelText('Street address'), '12 Rizal Avenue')
    await user.type(screen.getByLabelText('Postal code'), '1000')
    const save = screen.getByRole('button', { name: 'Save address' })
    await user.click(save)
    await waitFor(() => expect(save).toBeDisabled())
    expect(save.querySelector('svg')).not.toBeNull()
    await user.click(save)
    expect(api.saveAddress).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('explains a save that failed and lets the user try again', async () => {
    const { user, onSaved } = setup()
    await pickManila(user)
    await user.type(screen.getByLabelText('Street address'), '12 Rizal Avenue')
    await user.type(screen.getByLabelText('Postal code'), '1000')
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await user.click(screen.getByRole('button', { name: 'Save address' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save your address.*blocking storage.*try Save address/i)
    expect(screen.getByRole('button', { name: 'Save address' })).toBeEnabled()
    spy.mockRestore()
    await user.click(screen.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('explains a list that failed to load, retries it, and offers typing instead', async () => {
    api.getRegions.mockRejectedValueOnce(new PsgcError('timeout'))
    const { user } = setup()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the list of regions. The address list took too long to answer.")
    expect(within(alert).getByRole('button', { name: 'Type it instead' })).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: /^Region/ })).toBeInTheDocument()
    expect(api.getRegions).toHaveBeenCalledTimes(2)
  })

  it('shows a skeleton for a list that is still loading', async () => {
    api.getRegions.mockReturnValue(new Promise(() => {}))
    setup()
    expect(await screen.findByRole('status', { name: 'Loading regions' })).toBeInTheDocument()
  })

  it('shows an empty state when a list has no entries', async () => {
    api.getBarangays.mockResolvedValue([])
    const { user } = setup()
    await pick(user, /^Region/, /NCR/)
    await pick(user, /^City or municipality/, 'City of Manila')
    expect(await screen.findByText(/No barangays are listed for this city or municipality/)).toBeInTheDocument()
  })

  describe('pin on a map', () => {
    const manila = {
      street: '718 P. Paterno Street',
      postal: '1001',
      region: 'Metro Manila',
      city: 'Manila',
      barangays: ['Barangay 307', 'Quiapo', 'Barangay 383'],
    }

    async function usePin(user: User) {
      await user.click(screen.getByRole('button', { name: 'Pin on a map' }))
      await user.click(await screen.findByRole('button', { name: 'Use this location' }))
    }

    it('fills the fields from the pin, matching Metro Manila to NCR', async () => {
      api.reverseGeocode.mockResolvedValue(manila)
      const { user } = setup()
      await usePin(user)

      expect(await screen.findByText('Filled in from your pin. Check each field, then save.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Region/ })).toHaveTextContent('NCR')
      expect(screen.getByRole('button', { name: /^City or municipality/ })).toHaveTextContent('City of Manila')
      expect(screen.getByRole('button', { name: /^Barangay/ })).toHaveTextContent('Barangay 307')
      expect(screen.getByLabelText('Street address')).toHaveValue('718 P. Paterno Street')
      expect(screen.getByLabelText('Postal code')).toHaveValue('1001')
      expect(api.reverseGeocode).toHaveBeenCalledWith(14.5995, 120.9842, expect.anything())
    })

    it('never guesses: a level that is not in the list stays empty, with a note', async () => {
      api.reverseGeocode.mockResolvedValue({
        street: 'Sample Road',
        postal: '4200',
        region: 'Calabarzon',
        city: 'Atlantis City',
        barangays: ['Sample Quarter'],
      })
      const { user } = setup()
      await usePin(user)

      expect(await screen.findByText('The map says "Atlantis City", but it isn\'t in the list. Pick it below.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Region/ })).toHaveTextContent('CALABARZON')
      expect(screen.getByRole('button', { name: /^City or municipality/ })).toHaveTextContent('Select your city or municipality')
      expect(screen.getByRole('button', { name: /^Barangay/ })).toBeDisabled()
    })

    it('says so when the map has no postal code, and keeps what was typed', async () => {
      api.reverseGeocode.mockResolvedValue({ ...manila, postal: '' })
      const { user } = setup()
      await user.type(screen.getByLabelText('Postal code'), '1000')
      await usePin(user)
      expect(await screen.findByText('The map has no postal code for this spot. Enter it below.')).toBeInTheDocument()
      expect(screen.getByLabelText('Postal code')).toHaveValue('1000')
    })

    it('says what went wrong with the lookup and tries again', async () => {
      api.reverseGeocode.mockRejectedValueOnce(new ReverseGeocodeError('network')).mockResolvedValue(manila)
      const { user } = setup()
      await usePin(user)
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent("We couldn't look up that spot. The connection to OpenStreetMap dropped.")
      await user.click(within(alert).getByRole('button', { name: 'Try again' }))
      expect(await screen.findByText('Filled in from your pin. Check each field, then save.')).toBeInTheDocument()
    })

    it('keeps the map open when the spot is outside the Philippines, with no retry', async () => {
      api.reverseGeocode.mockRejectedValue(new ReverseGeocodeError('outside'))
      const { user } = setup()
      await usePin(user)
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('outside the Philippines')
      expect(within(alert).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Back to form' })).toBeInTheDocument()
      expect(screen.queryByLabelText('Street address')).not.toBeInTheDocument()
    })

    it('returns to the form with Back to form and keeps what was typed', async () => {
      const { user } = setup()
      await user.type(screen.getByLabelText('Street address'), '12 Rizal Avenue')
      await user.click(screen.getByRole('button', { name: 'Pin on a map' }))
      await user.click(await screen.findByRole('button', { name: 'Back to form' }))
      expect(screen.getByLabelText('Street address')).toHaveValue('12 Rizal Avenue')
      expect(api.reverseGeocode).not.toHaveBeenCalled()
    })
  })

  it('opens an existing address for editing', async () => {
    const initial: SavedAddress = {
      regionCode: NCR,
      region: 'NCR',
      province: '',
      cityCode: '133900000',
      city: 'City of Manila',
      barangayCode: '133901176',
      barangay: 'Barangay 176',
      street: '12 Rizal Avenue',
      postal: '1000',
    }
    setup({ initial })
    expect(await screen.findByRole('button', { name: /^City or municipality/ })).toHaveTextContent('City of Manila')
    expect(screen.getByLabelText('Street address')).toHaveValue('12 Rizal Avenue')
    expect(await screen.findByLabelText('Province')).toHaveValue('Not applicable')
  })
})
