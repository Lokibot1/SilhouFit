import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { AddressError, type Address } from '../../src/service/addresses'
import { fetchMe, type Me } from '../../src/service/fetchMe'
import { clearSession, getSession, setSession } from '../../src/service/session'
import { ProfilePage } from '../../src/views/private/ProfilePage'
import { ADDRESS, address } from '../fixtures/addresses'
import regions from '../fixtures/psgc/regions.json'
import ncrCities from '../fixtures/psgc/ncr-cities.json'
import manilaBarangays from '../fixtures/psgc/manila-barangays.json'

const api = vi.hoisted(() => ({
  loadAddresses: vi.fn(),
  getAddressById: vi.fn(),
  createAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
  onAddressesChanged: vi.fn(),
}))
vi.mock('../../src/service/addresses', async (original) => ({
  ...(await original<typeof import('../../src/service/addresses')>()),
  ...api,
}))
vi.mock('../../src/service/fetchMe', async (original) => ({
  ...(await original<typeof import('../../src/service/fetchMe')>()),
  fetchMe: vi.fn(),
}))
// The body measurements section loads on its own; it is covered separately.
vi.mock('../../src/service/bodyProfile', async (original) => ({
  ...(await original<typeof import('../../src/service/bodyProfile')>()),
  getBodyProfile: () => Promise.resolve(null),
}))
// The lists for the saved NCR address resolve; the form's own behaviour is covered in AddressForm.test.tsx.
vi.mock('../../src/service/psgc', async (original) => ({
  ...(await original<typeof import('../../src/service/psgc')>()),
  getRegions: async () => regions,
  getProvinces: async () => [],
  getCities: async () => ncrCities,
  getBarangays: async () => manilaBarangays,
}))

// The real map is covered in MapPicker.test.tsx; here it only hands a position back.
vi.mock('../../src/components/address/MapPicker', () => ({
  default: function Picker({ onUse }: { onUse: (lat: number, lon: number) => Promise<string | null> }) {
    return (
      <button type="button" onClick={() => void onUse(14.5995, 120.9842)}>
        Use this location
      </button>
    )
  },
}))
vi.mock('../../src/service/reverseGeocode', async (original) => ({
  ...(await original<typeof import('../../src/service/reverseGeocode')>()),
  reverseGeocode: async () => ({ street: '', postal: '', region: '', city: '', barangays: [] }),
}))

const ME: Me = {
  id: 'user-1',
  email: 'anne@example.com',
  role: 'customer',
  firstName: 'Anne',
  middleName: null,
  lastName: 'Santos',
  suffix: null,
  fullName: 'Anne Santos',
  avatarUrl: null,
  birthday: null,
  gender: null,
  createdAt: '2026-01-15T08:30:00.000Z',
  updatedAt: '2026-01-15T08:30:00.000Z',
}
const OFFICE = address({
  id: '22222222-2222-4222-8222-222222222222',
  label: null,
  recipientName: 'Anne Santos',
  phone: '+639181234567',
  streetAddress: '9 Ayala Avenue',
  addressLine2: 'Floor 5',
  isDefault: false,
  createdAt: '2026-02-01T08:00:00.000Z',
})

// A tiny stand-in for the API: the list the mocks read and write, and the change listeners the component subscribes.
let store: Address[] = []
let listeners: Array<() => void> = []
const emit = () => listeners.forEach((run) => run())

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  localStorage.clear()
  store = []
  listeners = []
  act(() => setSession({ name: 'Anne Santos', email: ME.email }))
  vi.mocked(fetchMe).mockResolvedValue(ME)
  api.loadAddresses.mockImplementation(async () => store)
  api.getAddressById.mockImplementation(async (id: string) => store.find((a) => a.id === id))
  api.onAddressesChanged.mockImplementation((run: () => void) => {
    listeners.push(run)
    return () => {
      listeners = listeners.filter((l) => l !== run)
    }
  })
  api.createAddress.mockImplementation(async (input: object) => {
    const row = { ...ADDRESS, id: 'new-id', label: null, ...input, isDefault: store.length === 0 }
    store = [...store, row]
    emit()
    return row
  })
  api.updateAddress.mockImplementation(async (id: string, patch: Partial<Address>) => {
    const row = { ...store.find((a) => a.id === id)!, ...patch }
    store = store.map((a) => (patch.isDefault ? { ...a, isDefault: false } : a)).map((a) => (a.id === id ? row : a))
    emit()
    return row
  })
  api.deleteAddress.mockImplementation(async (id: string) => {
    store = store.filter((a) => a.id !== id)
    emit()
  })
})
afterEach(() => {
  vi.clearAllMocks()
  act(() => clearSession())
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <ToastProvider>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

const section = async () => within(await screen.findByRole('region', { name: 'Delivery address' }))
const user = () => userEvent.setup({ delay: null })

describe('Profile delivery addresses: the four states', () => {
  it('shows a loading status while the list is read, without holding up the rest of the page', async () => {
    api.loadAddresses.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(await screen.findByRole('status', { name: 'Loading your delivery addresses' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Anne Santos' })).toBeInTheDocument()
  })

  it('shows an empty state with a way to add one', async () => {
    renderPage()
    const addresses = await section()
    expect(await addresses.findByText(/You have not saved a delivery address yet. Add one and checkout fills it in for you./)).toBeInTheDocument()
    expect(addresses.getByRole('button', { name: 'Add address' })).toBeInTheDocument()
  })

  it('lists the addresses as sent, default first, with the actions that apply to each', async () => {
    store = [ADDRESS, OFFICE]
    renderPage()
    const addresses = await section()
    const cards = await addresses.findAllByRole('listitem')
    expect(cards).toHaveLength(2)

    const home = within(cards[0])
    expect(home.getByText('Home')).toBeInTheDocument()
    expect(home.getByText('Default')).toBeInTheDocument()
    expect(home.getByText('Anne Santos')).toBeInTheDocument()
    expect(home.getByText('+639171234567')).toBeInTheDocument()
    expect(home.getByText('12 Rizal Avenue')).toBeInTheDocument()
    expect(home.getByText('Barangay 176, City of Manila')).toBeInTheDocument()
    expect(home.getByText('NCR 1000')).toBeInTheDocument()
    expect(home.getByRole('button', { name: 'Edit address Home' })).toBeInTheDocument()
    expect(home.getByRole('button', { name: 'Delete address Home' })).toBeInTheDocument()
    expect(home.queryByRole('button', { name: 'Set as default' })).not.toBeInTheDocument()

    const office = within(cards[1])
    expect(office.getByText('Address')).toBeInTheDocument()
    expect(office.queryByText('Default')).not.toBeInTheDocument()
    expect(office.getByText('Floor 5')).toBeInTheDocument()
    expect(office.getByRole('button', { name: 'Edit address 9 Ayala Avenue' })).toBeInTheDocument()
    expect(office.getByRole('button', { name: 'Set as default' })).toBeInTheDocument()
    expect(addresses.queryByText(/saved on this device/i)).not.toBeInTheDocument()
  })

  it('says what went wrong and tries again with a fresh read, without taking the page down', async () => {
    api.loadAddresses.mockRejectedValueOnce(new AddressError('network'))
    store = [ADDRESS]
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load your delivery addresses.*connection dropped.*try again/i)
    expect(screen.getByRole('heading', { level: 1, name: 'Anne Santos' })).toBeInTheDocument()
    await user().click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('12 Rizal Avenue')).toBeInTheDocument()
    expect(api.loadAddresses).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }))
  })

  it.each([
    ['rate-limit', /limiting requests/],
    ['server', /went wrong on our side/],
  ] as const)('explains a %s failure', async (kind, text) => {
    api.loadAddresses.mockRejectedValue(new AddressError(kind))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })

  it('ends the session when the token is rejected', async () => {
    api.loadAddresses.mockRejectedValue(new AddressError('unauthorized'))
    renderPage()
    await waitFor(() => expect(getSession()).toBeNull())
    expect(screen.queryByRole('region', { name: 'Delivery address' })).not.toBeInTheDocument()
  })

  it('keeps the meta description between 150 and 160 characters', async () => {
    renderPage()
    await screen.findByRole('region', { name: 'Delivery address' })
    const content = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
    expect(content.length).toBeGreaterThanOrEqual(150)
    expect(content.length).toBeLessThanOrEqual(160)
  })
})

describe('adding', () => {
  async function fillTyped(dialog: ReturnType<typeof within>, u: ReturnType<typeof user>) {
    await u.click(dialog.getByRole('button', { name: 'Pin on a map' }))
    await u.click(await dialog.findByRole('button', { name: 'Use this location' }))
    await dialog.findByText(/Pin placed/)
    await u.click(dialog.getByRole('button', { name: 'Type it instead' }))
    await u.type(dialog.getByLabelText('Phone number'), '9171234567')
    await u.type(dialog.getByLabelText('Region'), 'NCR')
    await u.type(dialog.getByLabelText('City or municipality'), 'City of Manila')
    await u.type(dialog.getByLabelText('Barangay'), 'Barangay 176')
    await u.type(dialog.getByLabelText('Street address'), '12 Rizal Avenue')
    await u.type(dialog.getByLabelText('Postal code'), '1000')
  }

  it('adds the first address from the empty state, then shows it with a Default badge and moves focus to Add address', async () => {
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Add address' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add a delivery address' }))
    expect(dialog.getByRole('checkbox', { name: 'Set as default address' })).toBeChecked()
    await fillTyped(dialog, u)
    await u.click(dialog.getByRole('button', { name: 'Save address' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.createAddress).toHaveBeenCalledWith({
      recipientName: 'Anne Santos',
      phone: '+639171234567',
      region: 'NCR',
      cityMunicipality: 'City of Manila',
      barangay: 'Barangay 176',
      streetAddress: '12 Rizal Avenue',
      postalCode: '1000',
      latitude: 14.5995,
      longitude: 120.9842,
      isDefault: true,
    })
    expect(await screen.findByText('Address saved.')).toBeInTheDocument()
    const addresses = await section()
    expect(await addresses.findByText('Default')).toBeInTheDocument()
    await waitFor(() => expect(addresses.getByRole('button', { name: 'Add address' })).toHaveFocus())
  })

  it('adds another from the header button, and closes with Cancel without saving', async () => {
    store = [ADDRESS]
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Add address' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add a delivery address' }))
    expect(dialog.getByRole('checkbox', { name: 'Set as default address' })).not.toBeChecked()
    await u.click(dialog.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.createAddress).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add address' })).toHaveFocus())
  })

  it('keeps the dialog open while the save is in flight', async () => {
    api.createAddress.mockReturnValue(new Promise(() => {}))
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Add address' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add a delivery address' }))
    await fillTyped(dialog, u)
    await u.click(dialog.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Save address' })).toBeDisabled())
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await u.keyboard('{Escape}')
    await u.click(dialog.getByRole('button', { name: 'Close Add a delivery address' }))
    expect(screen.getByRole('dialog', { name: 'Add a delivery address' })).toBeInTheDocument()
  })

  it('ends the session when the save is rejected as unauthorized', async () => {
    api.createAddress.mockRejectedValue(new AddressError('unauthorized'))
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Add address' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add a delivery address' }))
    await fillTyped(dialog, u)
    await u.click(dialog.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(getSession()).toBeNull())
  })
})

describe('editing', () => {
  it('re-reads the address, opens it already matched to the lists, and sends only what changed', async () => {
    store = [ADDRESS, OFFICE]
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Edit address Home' }))
    expect(api.getAddressById).toHaveBeenCalledWith(ADDRESS.id)
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit your delivery address' }))
    expect(await dialog.findByRole('button', { name: /^City or municipality/ })).toHaveTextContent('City of Manila')
    expect(dialog.getByLabelText('Street address')).toHaveValue('12 Rizal Avenue')

    await u.clear(dialog.getByLabelText('Street address'))
    await u.type(dialog.getByLabelText('Street address'), '99 Quezon Avenue')
    await u.click(dialog.getByRole('button', { name: 'Save address' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.updateAddress).toHaveBeenCalledWith(ADDRESS.id, { streetAddress: '99 Quezon Avenue' })
    expect(await screen.findByText('Address updated.')).toBeInTheDocument()
    expect(await screen.findByText('99 Quezon Avenue')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit address Home' })).toHaveFocus())
  })

  it('closes without a request or a toast when nothing was changed', async () => {
    store = [ADDRESS]
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Edit address Home' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit your delivery address' }))
    await dialog.findByDisplayValue('Not applicable')
    await u.click(dialog.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.updateAddress).not.toHaveBeenCalled()
    expect(screen.queryByText('Address updated.')).not.toBeInTheDocument()
  })

  it('returns focus to the Edit button after Cancel', async () => {
    store = [ADDRESS]
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Edit address Home' }))
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit address Home' })).toHaveFocus())
  })

  it('keeps the focus on Edit while the address is read, so the dialog gives it back on Escape and on a silent save', async () => {
    store = [ADDRESS, OFFICE]
    let arrive: (a: Address) => void = () => {}
    api.getAddressById.mockReturnValueOnce(new Promise((resolve) => (arrive = resolve)))
    const u = user()
    renderPage()
    const edit = await screen.findByRole('button', { name: 'Edit address Home' })
    await u.click(edit)
    await waitFor(() => expect(edit).toHaveAttribute('aria-disabled', 'true'))
    expect(edit).toBeEnabled()
    expect(edit).toHaveFocus()
    await u.click(edit)
    expect(api.getAddressById).toHaveBeenCalledTimes(1)
    arrive(ADDRESS)
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit your delivery address' }))
    await dialog.findByDisplayValue('Not applicable')
    await u.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(edit).toHaveFocus()

    await u.click(edit)
    const again = within(await screen.findByRole('dialog', { name: 'Edit your delivery address' }))
    await again.findByDisplayValue('Not applicable')
    await u.click(again.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.updateAddress).not.toHaveBeenCalled()
    expect(edit).toHaveFocus()
  })

  it('treats a legacy-format saved phone as unchanged: a no-op edit sends nothing, a street edit sends only the street', async () => {
    store = [address({ phone: '09171234567' })]
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Edit address Home' }))
    let dialog = within(await screen.findByRole('dialog', { name: 'Edit your delivery address' }))
    await dialog.findByDisplayValue('Not applicable')
    await u.click(dialog.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.updateAddress).not.toHaveBeenCalled()

    await u.click(screen.getByRole('button', { name: 'Edit address Home' }))
    dialog = within(await screen.findByRole('dialog', { name: 'Edit your delivery address' }))
    await dialog.findByDisplayValue('Not applicable')
    await u.clear(dialog.getByLabelText('Street address'))
    await u.type(dialog.getByLabelText('Street address'), '99 Quezon Avenue')
    await u.click(dialog.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(api.updateAddress).toHaveBeenCalledWith(ADDRESS.id, { streetAddress: '99 Quezon Avenue' }))
  })

  it('does not open an address that was deleted elsewhere: it says so and refreshes the list', async () => {
    store = [ADDRESS, OFFICE]
    api.getAddressById.mockRejectedValue(new AddressError('not-found'))
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Edit address Home' }))
    expect(await screen.findByText('That address was already deleted.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(api.loadAddresses).toHaveBeenCalledTimes(2))
  })

  it('tells the user in a toast when the address cannot be opened', async () => {
    store = [ADDRESS]
    api.getAddressById.mockRejectedValue(new AddressError('network'))
    renderPage()
    await user().click(await screen.findByRole('button', { name: 'Edit address Home' }))
    expect(await screen.findByText(/couldn't open that address/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the dialog, refreshes and says so when the save finds the address gone', async () => {
    store = [ADDRESS]
    api.updateAddress.mockRejectedValue(new AddressError('not-found'))
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Edit address Home' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit your delivery address' }))
    await dialog.findByDisplayValue('Not applicable')
    await u.type(dialog.getByLabelText('Unit, floor or landmark (optional)'), 'Unit 4B')
    await u.click(dialog.getByRole('button', { name: 'Save address' }))
    expect(await screen.findByText('That address was already deleted.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.loadAddresses).toHaveBeenCalledTimes(2)
  })
})

describe('long unbroken words', () => {
  it('lets the card text break anywhere and shrink with its column, so nothing pushes the page wider', async () => {
    store = [address({ label: 'W'.repeat(50), streetAddress: 'W'.repeat(120), addressLine2: 'W'.repeat(120) })]
    renderPage()
    const card = (await (await section()).findAllByRole('listitem'))[0]
    expect(within(card).getByText('W'.repeat(50))).toHaveClass('wrap-anywhere', 'min-w-0')
    expect(card.querySelector('address')).toHaveClass('wrap-anywhere')
    expect(screen.getByRole('region', { name: 'Delivery address' })).toHaveClass('min-w-0')
  })
})

describe('deleting', () => {
  const open = async (u: ReturnType<typeof user>, name: string) => {
    await u.click(await screen.findByRole('button', { name }))
    return within(await screen.findByRole('dialog', { name: 'Delete this address?' }))
  }

  it('asks first, names the address, and does nothing on Cancel', async () => {
    store = [ADDRESS, OFFICE]
    const u = user()
    renderPage()
    const dialog = await open(u, 'Delete address 9 Ayala Avenue')
    expect(dialog.getByText(/Are you sure\? 9 Ayala Avenue will be removed from your saved addresses\./)).toBeInTheDocument()
    expect(dialog.queryByText(/becomes the default/)).not.toBeInTheDocument()
    await u.click(dialog.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.deleteAddress).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete address 9 Ayala Avenue' })).toHaveFocus())
  })

  it('deletes after confirming, refreshes the list, says so, and moves focus to Add address', async () => {
    store = [ADDRESS, OFFICE]
    const u = user()
    renderPage()
    const dialog = await open(u, 'Delete address 9 Ayala Avenue')
    await u.click(dialog.getByRole('button', { name: 'Delete Address' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.deleteAddress).toHaveBeenCalledWith(OFFICE.id)
    expect(await screen.findByText('Address deleted.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('9 Ayala Avenue')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add address' })).toHaveFocus())
  })

  it('explains that the newest address becomes the default when deleting the default one', async () => {
    store = [ADDRESS, OFFICE]
    const u = user()
    renderPage()
    const dialog = await open(u, 'Delete address Home')
    expect(dialog.getByText(/Your most recently added address becomes the default\./)).toBeInTheDocument()
    // The server promotes one; the list shows what it sent.
    api.deleteAddress.mockImplementation(async (id: string) => {
      store = store.filter((a) => a.id !== id).map((a) => ({ ...a, isDefault: true }))
      emit()
    })
    await u.click(dialog.getByRole('button', { name: 'Delete Address' }))
    expect(await screen.findByText('Default')).toBeInTheDocument()
  })

  it('does not mention a new default when the deleted one is the only address', async () => {
    store = [ADDRESS]
    renderPage()
    const dialog = await open(user(), 'Delete address Home')
    expect(dialog.queryByText(/becomes the default/)).not.toBeInTheDocument()
  })

  it('shows the empty state after the last address is deleted', async () => {
    store = [ADDRESS]
    const u = user()
    renderPage()
    const dialog = await open(u, 'Delete address Home')
    await u.click(dialog.getByRole('button', { name: 'Delete Address' }))
    expect(await screen.findByText(/You have not saved a delivery address yet/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add address' })).toHaveFocus())
  })

  it('stays open and disabled while deleting, and cannot be closed', async () => {
    store = [ADDRESS, OFFICE]
    api.deleteAddress.mockReturnValue(new Promise(() => {}))
    const u = user()
    renderPage()
    const dialog = await open(u, 'Delete address 9 Ayala Avenue')
    await u.click(dialog.getByRole('button', { name: 'Delete Address' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Delete Address' })).toBeDisabled())
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await u.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Delete this address?' })).toBeInTheDocument()
    expect(api.deleteAddress).toHaveBeenCalledTimes(1)
  })

  it('shows a failure in the dialog, keeps it open, and lets the user try again', async () => {
    store = [ADDRESS, OFFICE]
    api.deleteAddress.mockRejectedValueOnce(new AddressError('network'))
    const u = user()
    renderPage()
    const dialog = await open(u, 'Delete address 9 Ayala Avenue')
    await u.click(dialog.getByRole('button', { name: 'Delete Address' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(/couldn't delete this address.*connection dropped.*try Delete Address again/i)
    expect(dialog.getByRole('button', { name: 'Delete Address' })).toBeEnabled()
    await u.click(dialog.getByRole('button', { name: 'Delete Address' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Address deleted.')).toBeInTheDocument()
  })

  it('counts an address that is already gone as deleted, and refreshes', async () => {
    store = [ADDRESS, OFFICE]
    api.deleteAddress.mockImplementation(async () => {
      store = [ADDRESS]
      throw new AddressError('not-found')
    })
    const u = user()
    renderPage()
    const dialog = await open(u, 'Delete address 9 Ayala Avenue')
    await u.click(dialog.getByRole('button', { name: 'Delete Address' }))
    expect(await screen.findByText('Address deleted.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('9 Ayala Avenue')).not.toBeInTheDocument())
  })

  it('ends the session when the delete is rejected as unauthorized', async () => {
    store = [ADDRESS, OFFICE]
    api.deleteAddress.mockRejectedValue(new AddressError('unauthorized'))
    const u = user()
    renderPage()
    const dialog = await open(u, 'Delete address 9 Ayala Avenue')
    await u.click(dialog.getByRole('button', { name: 'Delete Address' }))
    await waitFor(() => expect(getSession()).toBeNull())
  })
})

describe('setting the default', () => {
  it('sends isDefault true, refreshes, and says so', async () => {
    store = [ADDRESS, OFFICE]
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Set as default' }))
    expect(api.updateAddress).toHaveBeenCalledWith(OFFICE.id, { isDefault: true })
    expect(await screen.findByText('Default address updated.')).toBeInTheDocument()
    const cards = await screen.findAllByRole('listitem')
    await waitFor(() => expect(within(screen.getAllByRole('listitem')[1]).getByText('Default')).toBeInTheDocument())
    expect(within(cards[0]).queryByText('Default')).not.toBeInTheDocument()
  })

  it('blocks every other action while it runs, without a disabled attribute on the buttons that hold focus', async () => {
    store = [ADDRESS, OFFICE]
    api.updateAddress.mockReturnValue(new Promise(() => {}))
    const u = user()
    renderPage()
    const button = await screen.findByRole('button', { name: 'Set as default' })
    await u.click(button)
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    // A disabled button would drop the focus to the page.
    expect(button).toBeEnabled()
    expect(button).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Add address' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit address Home' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Delete address Home' })).toBeDisabled()
    expect(button.querySelector('svg')).not.toBeNull()

    await u.click(button)
    await u.click(screen.getByRole('button', { name: 'Edit address Home' }))
    expect(api.updateAddress).toHaveBeenCalledTimes(1)
    expect(api.getAddressById).not.toHaveBeenCalled()
  })

  it('moves focus to that address Edit button once Set as default has made its own button go away', async () => {
    store = [ADDRESS, OFFICE]
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Set as default' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit address 9 Ayala Avenue' })).toHaveFocus())
  })

  it('leaves focus on Set as default when the change fails', async () => {
    store = [ADDRESS, OFFICE]
    api.updateAddress.mockRejectedValue(new AddressError('server'))
    const u = user()
    renderPage()
    const button = await screen.findByRole('button', { name: 'Set as default' })
    await u.click(button)
    await screen.findByText(/couldn't change your default address/)
    expect(button).toHaveFocus()
  })

  it('shows a failure as a toast and leaves the list as it was', async () => {
    store = [ADDRESS, OFFICE]
    api.updateAddress.mockRejectedValue(new AddressError('server'))
    const u = user()
    renderPage()
    await u.click(await screen.findByRole('button', { name: 'Set as default' }))
    expect(await screen.findByText(/couldn't change your default address/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set as default' })).toBeEnabled()
  })

  it('ends the session when the change is rejected as unauthorized', async () => {
    store = [ADDRESS, OFFICE]
    api.updateAddress.mockRejectedValue(new AddressError('unauthorized'))
    renderPage()
    await user().click(await screen.findByRole('button', { name: 'Set as default' }))
    await waitFor(() => expect(getSession()).toBeNull())
  })
})
