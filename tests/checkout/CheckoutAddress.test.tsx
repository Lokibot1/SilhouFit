import { act, configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { clearProductCache } from '../../src/hooks/useProducts'
import { clearSession, setSession } from '../../src/service/session'
import { CheckoutPage } from '../../src/views/private/CheckoutPage'
import { ADDRESS, address } from '../fixtures/addresses'
import { POLO } from '../fixtures/shopProducts'
import { wireShopProducts } from '../fixtures/wireCartApi'

const api = vi.hoisted(() => ({ loadAddresses: vi.fn(), onAddressesChanged: vi.fn() }))
vi.mock('../../src/service/addresses', async (original) => ({
  ...(await original<typeof import('../../src/service/addresses')>()),
  ...api,
}))
vi.mock('../../src/service/fetchShopProducts')

const OFFICE = address({
  id: '22222222-2222-4222-8222-222222222222',
  label: null,
  recipientName: 'Ben Cruz',
  phone: '09181234567',
  cityMunicipality: 'Quezon City',
  barangay: 'Bagumbayan',
  streetAddress: '9 Ayala Avenue',
  addressLine2: 'Floor 5',
  postalCode: '1110',
  isDefault: false,
})
let changed: Array<() => void> = []

vi.setConfig({ testTimeout: 30000 })

beforeAll(() => {
  configure({ asyncUtilTimeout: 5000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  sessionStorage.clear()
  clearProductCache()
  act(() => setSession({ name: 'Demo Shopper', email: 'demo@silhoufit.com' }))
  wireShopProducts([POLO])
  changed = []
  api.loadAddresses.mockResolvedValue([ADDRESS])
  api.onAddressesChanged.mockImplementation((run: () => void) => {
    changed.push(run)
    return () => {
      changed = changed.filter((c) => c !== run)
    }
  })
})
afterEach(() => {
  vi.clearAllMocks()
  act(() => clearSession())
})

function renderCheckout() {
  return render(
    <MemoryRouter initialEntries={['/checkout?item=p01&variant=p01-m-navy&qty=2']}>
      <ToastProvider>
        <Routes>
          <Route path="/checkout" element={<CheckoutPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

const street = () => screen.findByLabelText('Street address')
const fullName = () => screen.getByLabelText('Full name')
const card = () => screen.getByRole('heading', { name: 'Delivery address' }).closest('section')!
async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Change delivery address|Add address/ }))
}

describe('Checkout fills in the saved address', () => {
  it('summarises the default address on the card, and keeps the fields out of the page until Change is clicked', async () => {
    renderCheckout()
    await waitFor(() => expect(card()).toHaveTextContent('12 Rizal Avenue, Barangay 176, City of Manila 1000'))
    expect(card()).toHaveTextContent('Anne Santos')
    expect(card()).toHaveTextContent('+63 9171234567')
    expect(screen.queryByLabelText('Street address')).toBeNull()
    expect(api.loadAddresses).toHaveBeenCalled()
    await openSheet(userEvent.setup({ delay: null }))
    expect(await street()).toHaveValue('12 Rizal Avenue, Barangay 176')
    expect(fullName()).toHaveValue('Anne Santos')
    expect(screen.getByLabelText('Phone number')).toHaveValue('9171234567')
    expect(screen.getByLabelText('City')).toHaveValue('City of Manila')
    expect(screen.getByLabelText('Postal code')).toHaveValue('1000')
  })

  it('puts address line 2 between the street and the barangay', async () => {
    api.loadAddresses.mockResolvedValue([address({ addressLine2: 'Unit 4B' })])
    renderCheckout()
    await openSheet(userEvent.setup({ delay: null }))
    await waitFor(async () => expect(await street()).toHaveValue('12 Rizal Avenue, Unit 4B, Barangay 176'))
  })

  it('does not add a second "Barangay" and drops a parenthetical from the city', async () => {
    api.loadAddresses.mockResolvedValue([address({ cityMunicipality: 'Bacolod City (Capital)', barangay: 'Pio V. Corpuz (Limbuhan)' })])
    renderCheckout()
    await openSheet(userEvent.setup({ delay: null }))
    await waitFor(async () => expect(await street()).toHaveValue('12 Rizal Avenue, Barangay Pio V. Corpuz'))
    expect(screen.getByLabelText('City')).toHaveValue('Bacolod City')
  })

  it('never overwrites what the shopper typed before it arrived', async () => {
    let arrive: (list: object[]) => void = () => {}
    api.loadAddresses.mockReturnValue(new Promise((resolve) => (arrive = resolve)))
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await openSheet(user)
    await user.type(await street(), '99 Mabini Street')
    await user.clear(fullName())
    await user.type(fullName(), 'Carlo Reyes')
    act(() => arrive([ADDRESS]))
    await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('City of Manila'))
    expect(screen.getByLabelText('Street address')).toHaveValue('99 Mabini Street')
    expect(fullName()).toHaveValue('Carlo Reyes')
  })

  it('reserves a status line, and says when the saved addresses cannot be loaded', async () => {
    api.loadAddresses.mockRejectedValue(new Error('offline'))
    renderCheckout()
    const note = await screen.findByText("We couldn't load your saved addresses, so type your delivery address below.")
    expect(note).toHaveAttribute('role', 'status')
    expect(card()).toHaveTextContent('Add where we should deliver your order.')
    await openSheet(userEvent.setup({ delay: null }))
    expect(await screen.findByLabelText('City')).toHaveValue('')
  })

  it('offers Try again after a failed read: it reads afresh, fills the untouched fields and never the typed ones', async () => {
    api.loadAddresses.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await screen.findByText("We couldn't load your saved addresses, so type your delivery address below.")
    await openSheet(user)
    await user.type(screen.getByLabelText('Street address'), '99 Mabini Street')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('City of Manila'))
    expect(api.loadAddresses).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }))
    expect(screen.getByLabelText('Street address')).toHaveValue('99 Mabini Street')
    expect(screen.getByLabelText('Postal code')).toHaveValue('1000')
    expect(screen.queryByText(/couldn't load your saved addresses/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('keeps the note, and the control, when Try again fails too', async () => {
    api.loadAddresses.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(api.loadAddresses).toHaveBeenCalledTimes(2))
    expect(await screen.findByText("We couldn't load your saved addresses, so type your delivery address below.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('holds the Deliver to slot open while the list loads, and folds it away when there is nothing to pick', async () => {
    let arrive: (list: object[]) => void = () => {}
    api.loadAddresses.mockReturnValue(new Promise((resolve) => (arrive = resolve)))
    renderCheckout()
    await openSheet(userEvent.setup({ delay: null }))
    const slot = (await street()).closest('[role="dialog"]')!.querySelector('.grid-rows-\\[1fr\\]')
    expect(slot).toHaveTextContent('Deliver to')
    expect(screen.queryByRole('combobox', { name: 'Deliver to' })).not.toBeInTheDocument()
    act(() => arrive([ADDRESS]))
    await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('City of Manila'))
    expect(slot).toHaveClass('grid-rows-[0fr]')
    expect(slot).not.toHaveTextContent('Deliver to')
  })

  it('shows a note while a slow read is still going, then clears it', async () => {
    let arrive: (list: object[]) => void = () => {}
    api.loadAddresses.mockReturnValue(new Promise((resolve) => (arrive = resolve)))
    renderCheckout()
    await screen.findByRole('button', { name: 'Add address' })
    expect(card().querySelector('.animate-pulse')).not.toBeNull() // the summary is a skeleton while it loads
    await openSheet(userEvent.setup({ delay: null }))
    const note = await screen.findByText('Filling in your saved address…')
    expect(note).toHaveAttribute('role', 'status')
    act(() => arrive([]))
    await waitFor(() => expect(screen.queryByText('Filling in your saved address…')).not.toBeInTheDocument())
  })

  it('leaves the form empty when nothing is saved', async () => {
    api.loadAddresses.mockResolvedValue([])
    renderCheckout()
    await openSheet(userEvent.setup({ delay: null }))
    expect(await street()).toHaveValue('')
    expect(screen.getByLabelText('City')).toHaveValue('')
    expect(screen.queryByRole('combobox', { name: 'Deliver to' })).not.toBeInTheDocument()
  })

  it('re-applies when the addresses change while checkout is open, never over typing', async () => {
    api.loadAddresses.mockResolvedValue([])
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await openSheet(user)
    await user.type(await street(), '99 Mabini Street')
    api.loadAddresses.mockResolvedValue([ADDRESS])
    await act(async () => changed.forEach((run) => run()))
    await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('City of Manila'))
    expect(screen.getByLabelText('Postal code')).toHaveValue('1000')
    expect(screen.getByLabelText('Street address')).toHaveValue('99 Mabini Street')
    expect(api.loadAddresses).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }))
  })

  it('stops listening when checkout closes', async () => {
    const { unmount } = renderCheckout()
    await screen.findByRole('button', { name: /Change delivery address|Add address/ })
    expect(changed).toHaveLength(1)
    unmount()
    expect(changed).toHaveLength(0)
  })

  describe('with more than one address', () => {
    beforeEach(() => api.loadAddresses.mockResolvedValue([ADDRESS, OFFICE]))

    it('offers a Deliver to picker, default marked, and fills from the default', async () => {
      renderCheckout()
      await openSheet(userEvent.setup({ delay: null }))
      const picker = await screen.findByRole('combobox', { name: 'Deliver to' })
      expect(picker).toHaveTextContent('Home (Default)')
      await waitFor(async () => expect(await street()).toHaveValue('12 Rizal Avenue, Barangay 176'))
    })

    it('fills the untouched fields from the address picked, labelled by its street when it has no label', async () => {
      const user = userEvent.setup({ delay: null })
      renderCheckout()
      await openSheet(user)
      await user.click(await screen.findByRole('combobox', { name: 'Deliver to' }))
      expect(screen.getByRole('option', { name: 'Home (Default)' })).toBeInTheDocument()
      await user.click(screen.getByRole('option', { name: '9 Ayala Avenue' }))
      await waitFor(async () => expect(await street()).toHaveValue('9 Ayala Avenue, Floor 5, Barangay Bagumbayan'))
      expect(fullName()).toHaveValue('Ben Cruz')
      expect(screen.getByLabelText('Phone number')).toHaveValue('9181234567')
      expect(screen.getByLabelText('City')).toHaveValue('Quezon City')
      expect(screen.getByLabelText('Postal code')).toHaveValue('1110')
    })

    it('replaces what the shopper edited when another address is picked, since an order goes to a saved address as it is', async () => {
      const user = userEvent.setup({ delay: null })
      renderCheckout()
      await openSheet(user)
      await waitFor(async () => expect(await street()).toHaveValue('12 Rizal Avenue, Barangay 176'))
      await user.clear(screen.getByLabelText('Postal code'))
      await user.type(screen.getByLabelText('Postal code'), '1234')
      await user.click(await screen.findByRole('combobox', { name: 'Deliver to' }))
      await user.click(screen.getByRole('option', { name: '9 Ayala Avenue' }))
      await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('Quezon City'))
      expect(screen.getByLabelText('Postal code')).toHaveValue('1110')
    })
  })
})
