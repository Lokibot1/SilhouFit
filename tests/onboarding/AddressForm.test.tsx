import { useState } from 'react'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressForm } from '../../src/components/address/AddressForm'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { AddressError, type Address } from '../../src/service/addresses'
import { PsgcError } from '../../src/service/psgc'
import { ReverseGeocodeError } from '../../src/service/reverseGeocode'
import { clearSession, setSession } from '../../src/service/session'
import { ADDRESS, address } from '../fixtures/addresses'
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
  lookupPostal: vi.fn(),
  createAddress: vi.fn(),
  updateAddress: vi.fn(),
}))
vi.mock('../../src/service/addresses', async (original) => ({
  ...(await original<typeof import('../../src/service/addresses')>()),
  createAddress: api.createAddress,
  updateAddress: api.updateAddress,
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
  api.createAddress.mockImplementation(async (input: object) => ({ ...ADDRESS, ...input }))
  api.updateAddress.mockImplementation(async (_id: string, patch: object) => ({ ...ADDRESS, ...patch }))
  api.lookupPostal.mockResolvedValue('')
  api.reverseGeocode.mockResolvedValue({ street: '', postal: '', region: '', city: '', barangays: [] })
  api.getRegions.mockResolvedValue(regions)
  api.getProvinces.mockImplementation(async (code: string) => (code === NCR ? [] : calabarzonProvinces))
  api.getCities.mockImplementation(async (code: string) => sorted(code === NCR ? ncrCities : calabarzonCities))
  api.getBarangays.mockImplementation(async (code: string) => sorted(code === '133900000' ? manilaBarangays : batangasBarangays))
})
afterEach(() => {
  vi.clearAllMocks()
  act(() => clearSession())
})

function setup(props: { initial?: Address | null; existingCount?: number; hideDefault?: boolean } = {}) {
  const onSaved = vi.fn<(a: Address) => void>()
  const onUnauthorized = vi.fn()
  const onGone = vi.fn()
  const onPendingChange = vi.fn<(pending: boolean) => void>()
  const user = userEvent.setup({ delay: null })
  render(
    <ToastProvider>
      <AddressForm
        initial={props.initial ?? null}
        existingCount={props.existingCount}
        hideDefault={props.hideDefault}
        onSaved={onSaved}
        onUnauthorized={onUnauthorized}
        onGone={onGone}
        onPendingChange={onPendingChange}
        footer={(submit) => (
          <div>
            <button type="button">Skip this step</button>
            {submit}
          </div>
        )}
      />
    </ToastProvider>,
  )
  return { user, onSaved, onUnauthorized, onGone, onPendingChange }
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
/** Drops the pin through the stand-in map. It names no place, so the fields stay for the user to fill. */
async function pin(user: User) {
  await user.click(screen.getByRole('button', { name: 'Pin on a map' }))
  await user.click(await screen.findByRole('button', { name: 'Use this location' }))
  await screen.findByText(/Pin placed/)
}
/** Everything a new address needs, in NCR. The recipient name is prefilled from the session. */
async function fillNew(user: User) {
  await pin(user)
  await user.type(screen.getByLabelText('Phone number'), '917 123 4567')
  await pickManila(user)
  await user.type(screen.getByLabelText('Street address'), '12 Rizal Avenue')
  await user.type(screen.getByLabelText('Postal code'), '1000')
}
const save = () => screen.getByRole('button', { name: 'Save address' })
const NEW_BODY = {
  recipientName: 'Anne Santos',
  phone: '+639171234567',
  region: 'NCR',
  cityMunicipality: 'City of Manila',
  barangay: 'Barangay 176',
  streetAddress: '12 Rizal Avenue',
  postalCode: '1000',
  latitude: 14.5995,
  longitude: 120.9842,
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

  it('prefills the recipient from the signed-in user, and opens with the phone and label empty', () => {
    setup()
    expect(screen.getByLabelText('Recipient name')).toHaveValue('Anne Santos')
    expect(screen.getByLabelText('Recipient name')).toHaveAttribute('autocomplete', 'name')
    expect(screen.getByLabelText('Phone number')).toHaveValue('')
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('autocomplete', 'tel-national')
    expect(screen.getByLabelText('Phone number').closest('.field')).toHaveTextContent('+63')
    expect(screen.getByLabelText('Label (optional)')).toHaveValue('')
  })

  it('lists the fields in the order they are validated, with the pin button after the phone', () => {
    setup()
    const order = ['Label (optional)', 'Recipient name', 'Phone number', 'Pin on a map', 'Street address', 'Unit, floor or landmark (optional)', 'Postal code']
    const nodes = order.map((name) => (name === 'Pin on a map' ? screen.getByRole('button', { name }) : screen.getByLabelText(name)))
    nodes.slice(1).forEach((node, i) => expect(nodes[i].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy())
  })

  it('filters emoji from the label, digits only in the phone, and counts the label and line 2', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Label (optional)'), 'Home\u{1F600}')
    expect(screen.getByLabelText('Label (optional)')).toHaveValue('Home')
    expect(screen.getByLabelText('Label (optional)').closest('.field')).toHaveTextContent('4/50')
    expect(screen.getByLabelText('Unit, floor or landmark (optional)').closest('.field')).toHaveTextContent('0/120')
    await user.click(screen.getByLabelText('Phone number'))
    await user.paste('+63 (917) 123-4567')
    expect(screen.getByLabelText('Phone number')).toHaveValue('9171234567')
  })

  it('counts the phone out of 10, the digits after +63, and strips a leading 0 however it arrives', async () => {
    const { user } = setup()
    const phone = screen.getByLabelText('Phone number')
    expect(phone.closest('.field')).toHaveTextContent('0/10')
    await user.type(phone, '09171234567')
    expect(phone).toHaveValue('9171234567')
    expect(phone.closest('.field')).toHaveTextContent('10/10')
    await user.clear(phone)
    await user.click(phone)
    await user.paste('09171234567')
    expect(phone).toHaveValue('9171234567')
    await user.type(phone, '8')
    expect(phone).toHaveValue('9171234567')
  })

  it('uses a tight prefix for +63 and keeps the country picker spacing for checkout', () => {
    setup()
    expect(screen.getByLabelText('Phone number').closest('.field')).toHaveClass('field--prefix-compact')
  })

  it.each([
    ['Label (optional)', 'Label', 'W'.repeat(31)],
    ['Recipient name', 'Recipient name', 'W'.repeat(31)],
    ['Street address', 'Street address', `12 ${'W'.repeat(31)}`],
    ['Unit, floor or landmark (optional)', 'Unit, floor or landmark', 'W'.repeat(31)],
  ])('refuses a single word over 30 characters in %s, inline and on save', async (field, name, word) => {
    const { user } = setup()
    await fillNew(user)
    const input = screen.getByLabelText(field)
    await user.clear(input)
    await user.type(input, word)
    await user.tab()
    expect(await screen.findByText(`Each word in ${name} can be at most 30 characters. Add a space or shorten it.`)).toBeInTheDocument()
    await user.click(save())
    expect(api.createAddress).not.toHaveBeenCalled()
    await user.clear(input)
    await user.type(input, 'W'.repeat(30))
    expect(screen.queryByText(/Each word in/)).not.toBeInTheDocument()
  })

  it('validates the recipient and phone inline, and the phone against the Philippine format', async () => {
    const { user } = setup()
    await user.clear(screen.getByLabelText('Recipient name'))
    await user.tab()
    expect(await screen.findByText('Recipient name is required.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Phone number'), '12345')
    await user.tab()
    expect(await screen.findByText('Enter a Philippine mobile number like 917 123 4567.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Phone number'))
    await user.tab()
    expect(await screen.findByText('Phone number is required.')).toBeInTheDocument()
  })

  it('shows an inline error after a field is left, and on every missing field at submit, focusing the first one on screen', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Street address'), 'ab')
    await user.tab()
    expect(await screen.findByText('Enter the house number, street and barangay, at least 5 characters.')).toBeInTheDocument()

    await user.click(save())
    expect(await screen.findByText('Phone number is required.')).toBeInTheDocument()
    expect(screen.getByText('Choose your region.')).toBeInTheDocument()
    expect(screen.getByText('Choose your city or municipality.')).toBeInTheDocument()
    expect(screen.getByText('Choose your barangay.')).toBeInTheDocument()
    expect(screen.getByText('Postal code is required.')).toBeInTheDocument()
    expect(api.createAddress).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Phone number')).toHaveFocus()

    await user.type(screen.getByLabelText('Phone number'), '9171234567')
    await user.click(save())
    // The pin comes before the places it fills, so a missing pin is asked for first.
    expect(screen.getByRole('button', { name: 'Pin on a map' })).toHaveFocus()
    await pin(user)
    await user.click(save())
    expect(screen.getByRole('button', { name: /^Region/ })).toHaveFocus()
  })

  it('will not save a new address without a pin, and says why', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Phone number'), '917 123 4567')
    await pickManila(user)
    await user.type(screen.getByLabelText('Street address'), '12 Rizal Avenue')
    await user.type(screen.getByLabelText('Postal code'), '1000')
    await user.click(save())
    expect(await screen.findByText('Pin your address on the map so we can deliver.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pin on a map' })).toHaveFocus()
    expect(api.createAddress).not.toHaveBeenCalled()
  })

  it('creates the address with exactly the API keys, a +63 phone and no PSGC codes', async () => {
    const { user, onSaved } = setup({ existingCount: 2 })
    await fillNew(user)
    await user.click(save())

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(api.createAddress).toHaveBeenCalledTimes(1)
    expect(api.createAddress).toHaveBeenCalledWith(NEW_BODY)
    const body = api.createAddress.mock.calls[0][0]
    expect(body).not.toHaveProperty('regionCode')
    expect(body).not.toHaveProperty('cityCode')
    expect(onSaved).toHaveBeenCalledWith({ ...ADDRESS, ...NEW_BODY })
  })

  it('sends the optional label, line 2, province and default only when they have a value', async () => {
    const { user } = setup({ existingCount: 1 })
    await pin(user)
    await user.type(screen.getByLabelText('Label (optional)'), 'Office')
    await user.type(screen.getByLabelText('Phone number'), '09171234567')
    await pick(user, /^Region/, /CALABARZON/)
    await pick(user, /^City or municipality/, 'Batangas City')
    await pick(user, /^Barangay/, 'Alangilan')
    await user.type(screen.getByLabelText('Street address'), '5 Seaside Drive')
    await user.type(screen.getByLabelText('Unit, floor or landmark (optional)'), 'Unit 4B')
    await user.type(screen.getByLabelText('Postal code'), '4200')
    await waitFor(() => expect(screen.getByLabelText('Province')).toHaveValue('Batangas'))
    await user.click(screen.getByRole('checkbox', { name: 'Set as default address' }))
    await user.click(save())

    await waitFor(() => expect(api.createAddress).toHaveBeenCalled())
    expect(api.createAddress.mock.calls[0][0]).toMatchObject({
      label: 'Office',
      phone: '+639171234567',
      region: 'CALABARZON',
      province: 'Batangas',
      cityMunicipality: 'Batangas City',
      streetAddress: '5 Seaside Drive',
      addressLine2: 'Unit 4B',
      postalCode: '4200',
      isDefault: true,
    })
  })

  it('lets the user type the place instead, saving it without codes', async () => {
    const { user } = setup()
    await pin(user)
    await user.click(await screen.findByRole('button', { name: 'Type it instead' }))
    expect(screen.queryByRole('button', { name: /^Region/ })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Phone number'), '9171234567')
    await user.type(screen.getByLabelText('Region'), 'Region 7 (Central Visayas)')
    await user.type(screen.getByLabelText('City or municipality'), 'Mandaue City')
    await user.type(screen.getByLabelText('Barangay'), 'Subangdaku')
    await user.type(screen.getByLabelText('Street address'), '5 Seaside Drive')
    await user.type(screen.getByLabelText('Postal code'), '6014')
    await user.click(save())

    await waitFor(() => expect(api.createAddress).toHaveBeenCalled())
    expect(api.createAddress).toHaveBeenCalledWith({
      ...NEW_BODY,
      region: 'Region 7 (Central Visayas)',
      cityMunicipality: 'Mandaue City',
      barangay: 'Subangdaku',
      streetAddress: '5 Seaside Drive',
      postalCode: '6014',
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

  describe('the default checkbox', () => {
    const box = () => screen.getByRole('checkbox', { name: 'Set as default address' })

    it('is checked, locked and explained for the first address', () => {
      setup({ existingCount: 0 })
      expect(box()).toBeChecked()
      expect(box()).toBeDisabled()
      expect(screen.getByText('Your first address is always your default.')).toBeInTheDocument()
    })

    it('is checked, locked and explained when editing the current default', async () => {
      setup({ initial: ADDRESS, existingCount: 2 })
      await screen.findByLabelText('Street address')
      expect(box()).toBeChecked()
      expect(box()).toBeDisabled()
      expect(screen.getByText('To change your default, set another address as default.')).toBeInTheDocument()
    })

    it('is unchecked and free when editing a non-default address', async () => {
      const { user } = setup({ initial: address({ isDefault: false }), existingCount: 2 })
      await screen.findByLabelText('Street address')
      expect(box()).not.toBeChecked()
      expect(box()).toBeEnabled()
      await user.click(box())
      expect(box()).toBeChecked()
    })

    it('is left out when hidden', () => {
      setup({ existingCount: 0, hideDefault: true })
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })
  })

  it('disables Save while saving, so it cannot be sent twice, and reports pending true then false', async () => {
    let finish: (a: Address) => void = () => {}
    api.createAddress.mockReturnValue(new Promise<Address>((resolve) => (finish = resolve)))
    const { user, onSaved, onPendingChange } = setup()
    await fillNew(user)
    await user.click(save())
    await waitFor(() => expect(save()).toBeDisabled())
    expect(save().querySelector('svg')).not.toBeNull()
    await user.click(save())
    expect(api.createAddress).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onPendingChange.mock.calls).toEqual([[true]])
    finish(ADDRESS)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onPendingChange.mock.calls).toEqual([[true], [false]])
  })

  describe('a save that fails', () => {
    async function submitWith(error: AddressError) {
      api.createAddress.mockRejectedValueOnce(error)
      const view = setup()
      await fillNew(view.user)
      await view.user.click(save())
      return view
    }

    it.each([
      ['network', /connection dropped.*try Save address again/i],
      ['rate-limit', /limiting requests.*Wait a minute.*try Save address again/i],
      ['server', /went wrong on our side.*try Save address again/i],
    ] as const)('explains a %s failure and lets the user try again', async (kind, text) => {
      const { user, onSaved, onPendingChange } = await submitWith(new AddressError(kind))
      expect(await screen.findByRole('alert')).toHaveTextContent(text)
      expect(screen.getByRole('alert')).toHaveTextContent("We couldn't save your address.")
      expect(save()).toBeEnabled()
      expect(onPendingChange.mock.calls).toEqual([[true], [false]])
      await user.click(save())
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows what the server said for a rejected address', async () => {
      await submitWith(new AddressError('invalid', 'phone must be a valid Philippine phone number'))
      expect(await screen.findByRole('alert')).toHaveTextContent('The server said: phone must be a valid Philippine phone number')
    })

    it('tells the caller when the address is gone', async () => {
      const { onGone } = await submitWith(new AddressError('not-found'))
      expect(await screen.findByRole('alert')).toHaveTextContent('deleted from another device')
      expect(onGone).toHaveBeenCalledTimes(1)
    })

    it('hands an expired session to the caller without an inline message', async () => {
      const { onUnauthorized } = await submitWith(new AddressError('unauthorized'))
      await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
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


  describe('postal code lookup', () => {
    it('fills the postal code when a barangay is picked', async () => {
      api.lookupPostal.mockResolvedValue('1003')
      const { user } = setup()
      await pickManila(user)
      await waitFor(() => expect(screen.getByLabelText('Postal code')).toHaveValue('1003'))
      expect(api.lookupPostal).toHaveBeenCalledWith({ barangay: 'Barangay 176', city: 'City of Manila', area: 'NCR' }, expect.anything())
    })

    it('never replaces a postal code the user typed', async () => {
      api.lookupPostal.mockResolvedValue('1003')
      const { user } = setup()
      await user.type(screen.getByLabelText('Postal code'), '1000')
      await pickManila(user)
      expect(screen.getByLabelText('Postal code')).toHaveValue('1000')
      expect(api.lookupPostal).not.toHaveBeenCalled()
    })

    it('says so when no postal code is found, and leaves the field empty', async () => {
      const { user } = setup()
      await pickManila(user)
      expect(await screen.findByText("We couldn't find a postal code for this address. Enter it above.")).toBeInTheDocument()
      expect(screen.getByLabelText('Postal code')).toHaveValue('')
    })
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

    it('looks the postal code up from the address when the map has none, and keeps what was typed', async () => {
      api.reverseGeocode.mockResolvedValue({ ...manila, postal: '' })
      api.lookupPostal.mockResolvedValue('1001')
      const first = setup()
      await usePin(first.user)
      expect(await screen.findByText(/Postal code filled in from your address/)).toBeInTheDocument()
      expect(screen.getByLabelText('Postal code')).toHaveValue('1001')
      expect(api.lookupPostal).toHaveBeenCalledWith({ barangay: 'Barangay 307', city: 'City of Manila', area: 'NCR' }, expect.anything())
      cleanup()

      const second = setup()
      await second.user.type(screen.getByLabelText('Postal code'), '1000')
      await usePin(second.user)
      expect(await screen.findByText('Filled in from your pin. Check each field, then save.')).toBeInTheDocument()
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

  describe('editing an existing address', () => {
    it('shows a skeleton while the places are matched, then the saved values with the lists resolved', async () => {
      let release: (r: typeof regions) => void = () => {}
      api.getRegions.mockReturnValue(new Promise((resolve) => (release = resolve)))
      setup({ initial: ADDRESS, existingCount: 2 })
      expect(screen.getByRole('status', { name: 'Loading your address' })).toBeInTheDocument()
      expect(screen.queryByLabelText('Street address')).not.toBeInTheDocument()
      release(regions)

      expect(await screen.findByRole('button', { name: /^City or municipality/ })).toHaveTextContent('City of Manila')
      expect(screen.getByRole('button', { name: /^Region/ })).toHaveTextContent('NCR')
      expect(screen.getByRole('button', { name: /^Barangay/ })).toHaveTextContent('Barangay 176')
      expect(screen.getByLabelText('Street address')).toHaveValue('12 Rizal Avenue')
      expect(screen.getByLabelText('Label (optional)')).toHaveValue('Home')
      expect(screen.getByLabelText('Recipient name')).toHaveValue('Anne Santos')
      expect(screen.getByLabelText('Phone number')).toHaveValue('9171234567')
      expect(screen.getByLabelText('Postal code')).toHaveValue('1000')
      expect(await screen.findByLabelText('Province')).toHaveValue('Not applicable')
    })

    it('leaves a city the list does not know empty, keeps the region, and says so', async () => {
      setup({ initial: address({ cityMunicipality: 'Atlantis' }) })
      expect(await screen.findByText("We couldn't match your city or municipality to our list. Pick it again.")).toBeInTheDocument()
      expect(await screen.findByRole('button', { name: /^Region/ })).toHaveTextContent('NCR')
      expect(await screen.findByRole('button', { name: /^City or municipality/ })).toHaveTextContent('Select your city or municipality')
      expect(screen.getByRole('button', { name: /^Barangay/ })).toBeDisabled()
    })

    it('leaves a barangay the list does not know empty, keeps the city, and says so', async () => {
      setup({ initial: address({ barangay: 'Nowhere Quarter' }) })
      expect(await screen.findByText("We couldn't match your barangay to our list. Pick it again.")).toBeInTheDocument()
      expect(await screen.findByRole('button', { name: /^City or municipality/ })).toHaveTextContent('City of Manila')
      expect(await screen.findByRole('button', { name: /^Barangay/ })).toHaveTextContent('Select your barangay')
    })

    it('shows the saved names as text when the region is not in the list', async () => {
      setup({ initial: address({ region: 'Atlantis Region' }) })
      expect(await screen.findByLabelText('Region')).toHaveValue('Atlantis Region')
      expect(screen.getByLabelText('City or municipality')).toHaveValue('City of Manila')
      expect(screen.getByLabelText('Barangay')).toHaveValue('Barangay 176')
      expect(screen.getByText(/couldn't match your region to our list/)).toBeInTheDocument()
    })

    it('never blocks editing when the lists cannot load: the saved names show as text', async () => {
      api.getRegions.mockRejectedValue(new PsgcError('network'))
      setup({ initial: ADDRESS })
      expect(await screen.findByLabelText('Region')).toHaveValue('NCR')
      expect(screen.getByLabelText('Barangay')).toHaveValue('Barangay 176')
      expect(screen.getByText(/couldn't load the address lists/)).toBeInTheDocument()
    })

    it('sends only what changed, and nulls for what was cleared', async () => {
      const { user, onSaved } = setup({ initial: address({ addressLine2: 'Unit 4B' }), existingCount: 1 })
      await screen.findByRole('button', { name: /^Region/ })
      await user.clear(screen.getByLabelText('Street address'))
      await user.type(screen.getByLabelText('Street address'), '99 Quezon Avenue')
      await user.clear(screen.getByLabelText('Label (optional)'))
      await user.clear(screen.getByLabelText('Unit, floor or landmark (optional)'))
      await user.click(save())

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      expect(api.updateAddress).toHaveBeenCalledWith(ADDRESS.id, { streetAddress: '99 Quezon Avenue', label: null, addressLine2: null })
      expect(api.createAddress).not.toHaveBeenCalled()
    })

    it('treats a legacy 09181234567 phone as unchanged: no phone is sent, and a street edit sends only the street', async () => {
      const legacy = address({ phone: '09171234567' })
      const { user, onSaved } = setup({ initial: legacy, existingCount: 1 })
      await screen.findByRole('button', { name: /^Region/ })
      await screen.findByDisplayValue('Not applicable')
      expect(screen.getByLabelText('Phone number')).toHaveValue('9171234567')
      await user.click(save())
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      expect(onSaved.mock.calls[0][0]).toBe(legacy)
      expect(api.updateAddress).not.toHaveBeenCalled()
    })

    it('sends only the street when a legacy-phone address has just its street edited', async () => {
      const { user, onSaved } = setup({ initial: address({ phone: '09171234567' }), existingCount: 1 })
      await screen.findByRole('button', { name: /^Region/ })
      await screen.findByDisplayValue('Not applicable')
      await user.clear(screen.getByLabelText('Street address'))
      await user.type(screen.getByLabelText('Street address'), '99 Quezon Avenue')
      await user.click(save())
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      expect(api.updateAddress).toHaveBeenCalledWith(ADDRESS.id, { streetAddress: '99 Quezon Avenue' })
    })

    it('still sends a phone that really changed', async () => {
      const { user } = setup({ initial: address({ phone: '09171234567' }), existingCount: 1 })
      await screen.findByDisplayValue('Not applicable')
      await user.clear(screen.getByLabelText('Phone number'))
      await user.type(screen.getByLabelText('Phone number'), '9187654321')
      await user.click(save())
      await waitFor(() => expect(api.updateAddress).toHaveBeenCalledWith(ADDRESS.id, { phone: '+639187654321' }))
    })

    it('sends isDefault true only when a non-default address is made the default', async () => {
      const { user } = setup({ initial: address({ isDefault: false }), existingCount: 2 })
      await screen.findByRole('button', { name: /^Region/ })
      await user.click(screen.getByRole('checkbox', { name: 'Set as default address' }))
      await user.click(save())
      await waitFor(() => expect(api.updateAddress).toHaveBeenCalled())
      expect(api.updateAddress).toHaveBeenCalledWith(ADDRESS.id, { isDefault: true })
    })

    it('sends no request when nothing changed, and hands back the same address', async () => {
      const { user, onSaved } = setup({ initial: ADDRESS, existingCount: 1 })
      await screen.findByRole('button', { name: /^Region/ })
      await screen.findByDisplayValue('Not applicable')
      await user.click(save())
      await waitFor(() => expect(onSaved).toHaveBeenCalledWith(ADDRESS))
      expect(onSaved.mock.calls[0][0]).toBe(ADDRESS)
      expect(api.updateAddress).not.toHaveBeenCalled()
      expect(api.createAddress).not.toHaveBeenCalled()
    })
  })
})
