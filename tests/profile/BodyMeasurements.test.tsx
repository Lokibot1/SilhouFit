import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { BodyProfileError, getBodyProfile, type BodyProfile } from '../../src/service/bodyProfile'
import { fetchMe, type Me } from '../../src/service/fetchMe'
import { clearSession, setSession } from '../../src/service/session'
import { ProfilePage } from '../../src/views/private/ProfilePage'

vi.mock('../../src/service/fetchMe', async (original) => ({
  ...(await original<typeof import('../../src/service/fetchMe')>()),
  fetchMe: vi.fn(),
}))
vi.mock('../../src/service/bodyProfile', async (original) => ({
  ...(await original<typeof import('../../src/service/bodyProfile')>()),
  getBodyProfile: vi.fn(),
}))
vi.mock('../../src/service/address', async (original) => ({
  ...(await original<typeof import('../../src/service/address')>()),
  getAddress: () => Promise.resolve(null),
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
const FEMALE: BodyProfile = {
  heightCm: 165.5,
  weightKg: 58,
  shoulderWidthCm: 39,
  chestCm: 82,
  bustCm: 88.5,
  torsoLengthCm: null,
  waistCm: 66,
  hipsCm: 94,
  inseamCm: null,
  outseamCm: null,
  thighCm: null,
  armLengthCm: 57,
  bodyModel: 'female',
  bodyBuild: 'skinny_fat',
}
const getProfile = vi.mocked(getBodyProfile)

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  localStorage.clear()
  act(() => setSession({ name: 'Anne Santos', email: ME.email }))
  vi.mocked(fetchMe).mockResolvedValue(ME)
  getProfile.mockResolvedValue(null)
})
afterEach(() => {
  vi.clearAllMocks()
  act(() => clearSession())
})

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <ToastProvider>
        <Where />
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/measurements" element={<p>setup page</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}
const section = async () => within(await screen.findByRole('region', { name: 'Body measurements' }))

describe('Profile body measurements', () => {
  it('shows a loading status while they load, without holding up the rest of the page', async () => {
    getProfile.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(await screen.findByRole('status', { name: 'Loading your body measurements' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Anne Santos' })).toBeInTheDocument()
  })

  it('shows an empty state with Add your measurements, which opens the setup', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const body = await section()
    expect(await body.findByText(/You have not saved any measurements yet/)).toBeInTheDocument()
    expect(body.queryByRole('link', { name: 'Edit measurements' })).not.toBeInTheDocument()
    await user.click(body.getByRole('link', { name: 'Add your measurements' }))
    expect(screen.getByText('setup page')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/profile/measurements')
  })

  it('shows the saved model, build and entered values in metric, with Edit measurements', async () => {
    getProfile.mockResolvedValue(FEMALE)
    const user = userEvent.setup({ delay: null })
    renderPage()
    const body = await section()
    expect(await body.findByText('Female')).toBeInTheDocument()
    expect(body.getByText('Skinny Fat')).toBeInTheDocument()
    expect(body.getByText('165.5 cm')).toBeInTheDocument()
    expect(body.getByText('58 kg')).toBeInTheDocument()
    expect(body.getByText('39 cm')).toBeInTheDocument()
    expect(body.getByText('88.5 cm')).toBeInTheDocument()
    expect(body.getByText('66 cm')).toBeInTheDocument()
    expect(body.getByText('94 cm')).toBeInTheDocument()
    expect(body.getByText('57 cm')).toBeInTheDocument()
    expect(body.getByText('Sleeve length')).toBeInTheDocument()
    expect(body.queryByText('Torso length')).not.toBeInTheDocument()
    expect(body.queryByRole('link', { name: 'Add your measurements' })).not.toBeInTheDocument()
    await user.click(body.getByRole('link', { name: 'Edit measurements' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/profile/measurements')
  })

  it('hides bust for a male profile even if the server sent one', async () => {
    getProfile.mockResolvedValue({ ...FEMALE, bodyModel: 'male' })
    renderPage()
    const body = await section()
    expect(await body.findByText('Male')).toBeInTheDocument()
    expect(body.queryByText('Bust')).not.toBeInTheDocument()
    expect(body.queryByText('88.5 cm')).not.toBeInTheDocument()
  })

  it('shows Not chosen for a model and build that were never set', async () => {
    getProfile.mockResolvedValue({ ...FEMALE, bodyModel: null, bodyBuild: null })
    renderPage()
    const body = await section()
    expect(await body.findAllByText('Not chosen')).toHaveLength(2)
  })

  it.each([
    ['network', /connection dropped/],
    ['rate-limit', /limiting requests/],
    ['unauthorized', /session has ended/],
    ['invalid', /did not accept the request/],
    ['server', /went wrong on our side/],
  ] as const)('says what went wrong on a %s failure and retries, without taking the page down', async (kind, copy) => {
    getProfile.mockRejectedValueOnce(new BodyProfileError(kind)).mockResolvedValue(FEMALE)
    const user = userEvent.setup({ delay: null })
    renderPage()
    const body = await section()
    const alert = await body.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load your body measurements.")
    expect(alert).toHaveTextContent(copy)
    expect(screen.getByRole('heading', { level: 1, name: 'Anne Santos' })).toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await body.findByText('165.5 cm')).toBeInTheDocument()
    expect(getProfile).toHaveBeenCalledTimes(2)
  })

  it('treats an unexpected failure as a server error', async () => {
    getProfile.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    const body = await section()
    expect(await body.findByRole('alert')).toHaveTextContent('went wrong on our side')
  })

  it.each(['staff', 'admin', 'superadmin'] as const)('is not shown, and not requested, for a %s', async (role) => {
    vi.mocked(fetchMe).mockResolvedValue({ ...ME, role })
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Anne Santos' })
    expect(screen.queryByRole('region', { name: 'Body measurements' })).not.toBeInTheDocument()
    expect(getProfile).not.toHaveBeenCalled()
  })

  it('is shown to a customer', async () => {
    renderPage()
    expect(await screen.findByRole('region', { name: 'Body measurements' })).toBeInTheDocument()
  })
})
