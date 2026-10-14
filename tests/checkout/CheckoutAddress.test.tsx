import { act, configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { PRODUCTS } from '../../src/data/products'
import { resetProductsCache } from '../../src/hooks/useProducts'
import { saveAddress, type SavedAddress } from '../../src/service/address'
import { fetchProducts } from '../../src/service/fetchProducts'
import { clearSession, setSession } from '../../src/service/session'
import { CheckoutPage } from '../../src/views/private/CheckoutPage'

const addressApi = vi.hoisted(() => ({ getAddress: vi.fn() }))
vi.mock('../../src/service/address', async (original) => ({
  ...(await original<typeof import('../../src/service/address')>()),
  getAddress: addressApi.getAddress,
}))
vi.mock('../../src/service/fetchProducts', () => ({ fetchProducts: vi.fn() }))
vi.mock('../../src/service/placeOrder', () => ({ placeOrder: vi.fn() }))

const SAVED: SavedAddress = {
  regionCode: '130000000',
  region: 'NCR',
  province: '',
  cityCode: '133900000',
  city: 'City of Manila',
  barangayCode: '133901176',
  barangay: 'Barangay 176',
  street: '12 Rizal Avenue',
  postal: '1000',
}

vi.setConfig({ testTimeout: 30000 })

beforeAll(() => {
  configure({ asyncUtilTimeout: 5000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  sessionStorage.clear()
  resetProductsCache()
  act(() => setSession({ name: 'Demo Shopper', email: 'demo@silhoufit.com' }))
  vi.mocked(fetchProducts).mockResolvedValue({ products: PRODUCTS, syncedAt: '2026-10-10T15:05:00' })
  addressApi.getAddress.mockResolvedValue(SAVED)
})
afterEach(() => {
  vi.clearAllMocks()
  act(() => clearSession())
})

function renderCheckout() {
  return render(
    <MemoryRouter initialEntries={['/checkout?item=p01&size=M&color=Navy&qty=2']}>
      <ToastProvider>
        <Routes>
          <Route path="/checkout" element={<CheckoutPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

const street = () => screen.findByLabelText('Street address')

describe('Checkout fills in the saved address', () => {
  it('fills street (with the barangay), city and postal, and leaves name and phone alone', async () => {
    renderCheckout()
    await waitFor(async () => expect(await street()).toHaveValue('12 Rizal Avenue, Barangay 176'))
    expect(screen.getByLabelText('City')).toHaveValue('City of Manila')
    expect(screen.getByLabelText('Postal code')).toHaveValue('1000')
    expect(screen.getByLabelText('Phone number')).toHaveValue('')
    expect(addressApi.getAddress).toHaveBeenCalledWith('demo@silhoufit.com')
  })

  it('does not add a second "Barangay" and drops a parenthetical from the city', async () => {
    addressApi.getAddress.mockResolvedValue({ ...SAVED, city: 'Bacolod City (Capital)', barangay: 'Pio V. Corpuz (Limbuhan)' })
    renderCheckout()
    await waitFor(async () => expect(await street()).toHaveValue('12 Rizal Avenue, Barangay Pio V. Corpuz'))
    expect(screen.getByLabelText('City')).toHaveValue('Bacolod City')
  })

  it('never overwrites what the shopper typed before it arrived', async () => {
    let arrive: (a: SavedAddress) => void = () => {}
    addressApi.getAddress.mockReturnValue(new Promise((resolve) => (arrive = resolve)))
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await user.type(await street(), '99 Mabini Street')
    act(() => arrive(SAVED))
    await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('City of Manila'))
    expect(screen.getByLabelText('Street address')).toHaveValue('99 Mabini Street')
  })

  it('reserves a status line, and says when the saved address cannot be read', async () => {
    addressApi.getAddress.mockRejectedValue(new Error('blocked'))
    renderCheckout()
    const note = await screen.findByText("We couldn't read your saved address on this device, so type it below.")
    expect(note).toHaveAttribute('role', 'status')
    expect(screen.getByLabelText('City')).toHaveValue('')
  })

  it('shows a note while a slow read is still going, then clears it', async () => {
    let arrive: (a: SavedAddress | null) => void = () => {}
    addressApi.getAddress.mockReturnValue(new Promise((resolve) => (arrive = resolve)))
    renderCheckout()
    const note = await screen.findByText('Filling in your saved address…')
    expect(note).toHaveAttribute('role', 'status')
    act(() => arrive(null))
    await waitFor(() => expect(screen.queryByText('Filling in your saved address…')).not.toBeInTheDocument())
  })

  it('fills the empty fields when an address is saved while checkout is open, never over typing', async () => {
    addressApi.getAddress.mockResolvedValue(null)
    const user = userEvent.setup({ delay: null })
    renderCheckout()
    await user.type(await street(), '99 Mabini Street')
    await act(() => saveAddress('demo@silhoufit.com', SAVED))
    await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('City of Manila'))
    expect(screen.getByLabelText('Postal code')).toHaveValue('1000')
    expect(screen.getByLabelText('Street address')).toHaveValue('99 Mabini Street')
  })

  it('ignores an address saved for another account', async () => {
    addressApi.getAddress.mockResolvedValue(null)
    renderCheckout()
    expect(await street()).toHaveValue('')
    await act(() => saveAddress('someone@else.com', SAVED))
    expect(screen.getByLabelText('City')).toHaveValue('')
  })

  it('leaves the form empty when nothing is saved', async () => {
    addressApi.getAddress.mockResolvedValue(null)
    renderCheckout()
    expect(await street()).toHaveValue('')
    expect(screen.getByLabelText('City')).toHaveValue('')
  })
})
