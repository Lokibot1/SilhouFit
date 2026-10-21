import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { type SavedAddress } from '../../src/service/address'
import { fetchMe, type Me } from '../../src/service/fetchMe'
import { clearSession, setSession } from '../../src/service/session'
import { ProfilePage } from '../../src/views/private/ProfilePage'

const api = vi.hoisted(() => ({ getAddress: vi.fn() }))
vi.mock('../../src/service/address', async (original) => ({
  ...(await original<typeof import('../../src/service/address')>()),
  getAddress: api.getAddress,
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
// The lists never arrive: the form's own behaviour is covered in AddressForm.test.tsx.
vi.mock('../../src/service/psgc', async (original) => ({
  ...(await original<typeof import('../../src/service/psgc')>()),
  getRegions: () => new Promise(() => {}),
  getProvinces: () => new Promise(() => {}),
  getCities: () => new Promise(() => {}),
  getBarangays: () => new Promise(() => {}),
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
  createdAt: '2026-01-15T08:30:00.000Z',
  updatedAt: '2026-01-15T08:30:00.000Z',
}
const SAVED: SavedAddress = {
  regionCode: '040000000',
  region: 'CALABARZON',
  province: 'Batangas',
  cityCode: '041005000',
  city: 'Batangas City',
  barangayCode: '041005001',
  barangay: 'Alangilan',
  street: '12 P. Burgos Street',
  postal: '4200',
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  localStorage.clear()
  act(() => setSession({ name: 'Anne Santos', email: ME.email }))
  vi.mocked(fetchMe).mockResolvedValue(ME)
  api.getAddress.mockResolvedValue(null)
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

describe('Profile delivery address', () => {
  it('shows a loading status while the address is read', async () => {
    api.getAddress.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(await screen.findByRole('status', { name: 'Loading your delivery address' })).toBeInTheDocument()
    // The rest of the page does not wait for it.
    expect(screen.getByRole('heading', { level: 1, name: 'Anne Santos' })).toBeInTheDocument()
  })

  it('shows an empty state with a way to add one', async () => {
    renderPage()
    const addresses = await section()
    expect(await addresses.findByText(/You have not saved a delivery address yet/)).toBeInTheDocument()
    expect(addresses.getByRole('button', { name: 'Add address' })).toBeInTheDocument()
  })

  it('shows the saved address with Edit address', async () => {
    api.getAddress.mockResolvedValue(SAVED)
    renderPage()
    const addresses = await section()
    expect(await addresses.findByText('12 P. Burgos Street')).toBeInTheDocument()
    expect(addresses.getByText('Alangilan, Batangas City, Batangas')).toBeInTheDocument()
    expect(addresses.getByText('CALABARZON 4200')).toBeInTheDocument()
    expect(addresses.getByRole('button', { name: 'Edit address' })).toBeInTheDocument()
    expect(addresses.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument()
  })

  it('says what went wrong and tries again, without taking the page down', async () => {
    api.getAddress.mockRejectedValueOnce(new Error('blocked')).mockResolvedValue(SAVED)
    const user = userEvent.setup({ delay: null })
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't read your saved address.*blocking storage/)
    expect(screen.getByRole('heading', { level: 1, name: 'Anne Santos' })).toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('12 P. Burgos Street')).toBeInTheDocument()
  })

  it('opens the form in a dialog to add or edit, and closes it with Cancel', async () => {
    api.getAddress.mockResolvedValue(SAVED)
    const user = userEvent.setup({ delay: null })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit address' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit your delivery address' })
    expect(within(dialog).getByLabelText('Street address')).toHaveValue('12 P. Burgos Street')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('returns focus to Edit address after Cancel', async () => {
    api.getAddress.mockResolvedValue(SAVED)
    const user = userEvent.setup({ delay: null })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit address' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit address' })).toHaveFocus())
  })

  it('moves focus to Edit address after the first save, when Add address is gone', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Add address' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add your delivery address' })
    await user.click(within(dialog).getByRole('button', { name: 'Type it instead' }))
    await user.type(within(dialog).getByLabelText('Region'), 'NCR')
    await user.type(within(dialog).getByLabelText('City or municipality'), 'City of Manila')
    await user.type(within(dialog).getByLabelText('Barangay'), 'Barangay 176')
    await user.type(within(dialog).getByLabelText('Street address'), '12 Rizal Avenue')
    await user.type(within(dialog).getByLabelText('Postal code'), '1000')
    await user.click(within(dialog).getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit address' })).toHaveFocus())
  })

  it('keeps the meta description between 150 and 160 characters', async () => {
    renderPage()
    await screen.findByRole('region', { name: 'Delivery address' })
    const content = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
    expect(content.length).toBeGreaterThanOrEqual(150)
    expect(content.length).toBeLessThanOrEqual(160)
  })
})
