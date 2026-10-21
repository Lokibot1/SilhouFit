import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDraft, newDraft, saveDraft } from '../../src/components/body-setup/draft'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { resetTour, useOnboarding } from '../../src/hooks/useOnboarding'
import { getAddress, saveAddress, type SavedAddress } from '../../src/service/address'
import { BodyProfileError, getBodyProfile, saveBodyProfile, type BodyProfile } from '../../src/service/bodyProfile'
import { clearSession, setSession } from '../../src/service/session'
import { BodySetupPage } from '../../src/views/private/BodySetupPage'

const motion = vi.hoisted(() => ({ reduced: false }))
const crash = vi.hoisted(() => ({ studio: false, step: false }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motion.reduced,
}))
// The WebGL studio is replaced by a stub that shows the props the page hands it. Its fallback has its own test file.
vi.mock('../../src/components/body-setup/BodyStudio', () => ({
  BodyStudio: (props: { model: string; build: string | null; cm: object; focus: string | null; reduced: boolean }) => {
    if (crash.studio) throw new Error('studio chunk failed')
    return (
    <div
      role="group"
      aria-label="3D body preview"
      data-testid="studio"
      data-model={props.model}
      data-build={props.build ?? ''}
      data-focus={props.focus ?? ''}
      data-reduced={String(props.reduced)}
      data-cm={JSON.stringify(props.cm)}
    />
    )
  },
}))
vi.mock('../../src/components/body-setup/ChoiceSteps', async (original) => {
  const real = await original<typeof import('../../src/components/body-setup/ChoiceSteps')>()
  return {
    ...real,
    ModelStep: (props: Parameters<typeof real.ModelStep>[0]) => {
      if (crash.step) throw new Error('step failed')
      return real.ModelStep(props)
    },
  }
})
vi.mock('../../src/service/bodyProfile', async (original) => ({
  ...(await original<typeof import('../../src/service/bodyProfile')>()),
  getBodyProfile: vi.fn(),
  saveBodyProfile: vi.fn(),
}))

vi.setConfig({ testTimeout: 60000 }) // step-by-step flows re-render the whole page on every click; slow when the suite runs in parallel

const EMAIL = 'anne@example.com'
const ADDRESS: SavedAddress = {
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
const SAVED_PROFILE: BodyProfile = {
  heightCm: 168,
  weightKg: null,
  shoulderWidthCm: null,
  chestCm: 90,
  bustCm: null,
  torsoLengthCm: null,
  waistCm: null,
  hipsCm: null,
  inseamCm: null,
  outseamCm: null,
  thighCm: null,
  armLengthCm: 59,
  bodyModel: 'female',
  bodyBuild: 'lean',
}
const getProfile = vi.mocked(getBodyProfile)
const save = vi.mocked(saveBodyProfile)

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  motion.reduced = false
  crash.studio = crash.step = false
  localStorage.clear()
  sessionStorage.clear()
  act(() => setSession({ name: 'Anne Santos', email: EMAIL }))
  getProfile.mockResolvedValue(null)
  save.mockResolvedValue(SAVED_PROFILE)
})
afterEach(() => {
  act(() => {
    resetTour()
    clearSession()
  })
  vi.clearAllMocks()
})

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

/** Lets a test put the tour on its body phase, the way the tour does, and read the phase back. */
function TourDriver() {
  const tour = useOnboarding()
  return (
    <>
      <p data-testid="phase">{tour.phase ?? 'none'}</p>
      <button type="button" onClick={() => tour.startTour({ skipWelcome: true })}>
        drive start
      </button>
      <button type="button" onClick={tour.askAddress}>
        drive address
      </button>
      <button type="button" onClick={tour.askBody}>
        drive body
      </button>
    </>
  )
}

async function open({ inTour = false, url = '/profile/measurements' }: { inTour?: boolean; url?: string } = {}) {
  const user = userEvent.setup({ delay: null })
  render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Where />
        <TourDriver />
        <Routes>
          <Route path="/profile" element={<p>profile page</p>} />
          <Route path="/profile/measurements" element={<BodySetupPage />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
  if (inTour) {
    await user.click(screen.getByRole('button', { name: 'drive start' }))
    await user.click(screen.getByRole('button', { name: 'drive address' }))
    await user.click(screen.getByRole('button', { name: 'drive body' }))
    expect(screen.getByTestId('phase')).toHaveTextContent('body')
  }
  return user
}

/** Opens the setup resumed on its review screen (a draft in this tab), skipping the twelve steps that lead to it. */
async function openAtReview(height: number, opts: { inTour?: boolean } = {}) {
  saveDraft(newDraft(EMAIL, { model: 'male', step: 12, entered: { height }, reviewing: true }))
  const user = await open(opts)
  await screen.findByRole('heading', { name: 'Review your measurements' })
  return user
}

const where = () => screen.getByTestId('where').textContent
const next = (user: UserEvent) => user.click(screen.getByRole('button', { name: /^(Next|Review)$/ }))
// A chosen card reads "Selected<name>..." to a screen reader, so match with or without that prefix.
const pick = (label: string) => new RegExp(`^(Selected)?${label}`)
const modelHeading = () => screen.findByRole('heading', { name: /Which body model/ })

async function chooseModel(user: UserEvent, model: 'Male' | 'Female') {
  await modelHeading()
  await user.click(screen.getByRole('radio', { name: pick(model) }))
  await next(user)
}
/** Model, then build (left unchosen), landing on the height step. */
async function toHeight(user: UserEvent, model: 'Male' | 'Female' = 'Male') {
  await chooseModel(user, model)
  await next(user)
  await screen.findByRole('heading', { name: 'Height' })
}
async function typeValue(user: UserEvent, value: string) {
  const input = screen.getByRole('textbox')
  await user.clear(input)
  await user.type(input, value)
}
/** From the height step, enters a height then moves through every other (empty) step to the review screen. */
async function toReview(user: UserEvent, height: string | null = '175', fieldCount = 11) {
  if (height) await typeValue(user, height)
  for (let i = 0; i < fieldCount - 1; i++) await next(user)
  await next(user) // "Review" on the last measurement
  await screen.findByRole('heading', { name: 'Review your measurements' })
}
const finishButton = () => screen.getByRole('button', { name: /Finish Setup/ })
const consent = () => screen.getByRole('checkbox', { name: /Save my measurements to my account/ })

describe('BodySetupPage flow', () => {
  it('walks model, build, measurements and review, then saves only what was entered', async () => {
    const user = await open()
    await chooseModel(user, 'Male')
    await user.click(await screen.findByRole('radio', { name: pick('Muscular') }))
    await next(user)
    await user.type(await screen.findByRole('textbox'), '175')
    await next(user) // weight
    await screen.findByRole('heading', { name: 'Weight' })
    await next(user)
    await screen.findByRole('heading', { name: 'Shoulder width' })
    await typeValue(user, '46')
    for (let i = 0; i < 8; i++) await next(user)
    await next(user)
    expect(await screen.findByRole('heading', { name: 'Review your measurements' })).toBeInTheDocument()
    expect(screen.getByText('Muscular')).toBeInTheDocument()
    expect(screen.getByText('175 cm')).toBeInTheDocument()
    expect(screen.getByText('46 cm')).toBeInTheDocument()

    await user.click(consent())
    await user.click(finishButton())

    await waitFor(() => expect(where()).toBe('/profile'))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toEqual({
      heightCm: 175,
      weightKg: null,
      shoulderWidthCm: 46,
      chestCm: null,
      bustCm: null,
      torsoLengthCm: null,
      waistCm: null,
      hipsCm: null,
      inseamCm: null,
      outseamCm: null,
      thighCm: null,
      armLengthCm: null,
      bodyModel: 'male',
      bodyBuild: 'muscular',
    })
    expect(await screen.findByText('Measurements saved. SilhouFit can now recommend sizes.')).toBeInTheDocument()
  })

  it('offers a bust step for the female model and no sleeve-named API field', async () => {
    const user = await open()
    await toHeight(user, 'Female')
    expect(screen.getByText('Step 3 of 15')).toBeInTheDocument()
    await typeValue(user, '165')
    await next(user)
    await next(user) // shoulders
    await next(user) // sleeve
    await typeValue(user, '58')
    await next(user)
    expect(await screen.findByRole('heading', { name: 'Bust' })).toBeInTheDocument()
    for (let i = 0; i < 7; i++) await next(user)
    await next(user)
    await user.click(await screen.findByRole('checkbox', { name: /Save my measurements/ }))
    await user.click(finishButton())
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0]).toMatchObject({ heightCm: 165, armLengthCm: 58, bustCm: null, bodyModel: 'female' })
    expect(save.mock.calls[0][0]).not.toHaveProperty('sleeveLengthCm')
  })

  it('does not let the user past the model step until one is chosen', async () => {
    const user = await open()
    await modelHeading()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByText('Choose a body model to continue.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: pick('Female') }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('keeps entered values when going Back and forward', async () => {
    const user = await open()
    await toHeight(user)
    await typeValue(user, '181')
    await next(user)
    await screen.findByRole('heading', { name: 'Weight' })
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('textbox')).toHaveValue('181')
    await user.click(screen.getByRole('button', { name: 'Back' })) // build
    await user.click(screen.getByRole('button', { name: 'Back' })) // model
    expect(screen.getByRole('radio', { name: pick('Male') })).toBeChecked()
    await next(user)
    await next(user)
    expect(await screen.findByRole('textbox')).toHaveValue('181')
  })

  it('passes the model, build, focused field and values to the studio', async () => {
    const user = await open()
    await chooseModel(user, 'Female')
    expect(screen.getByTestId('studio')).toHaveAttribute('data-model', 'female')
    await user.click(await screen.findByRole('radio', { name: pick('Lean') }))
    expect(screen.getByTestId('studio')).toHaveAttribute('data-build', 'lean')
    await next(user)
    await screen.findByRole('heading', { name: 'Height' })
    await typeValue(user, '170')
    const studio = screen.getByTestId('studio')
    expect(studio).toHaveAttribute('data-focus', 'height')
    expect(JSON.parse(studio.dataset.cm!)).toEqual({ height: 170 })
  })

  it('jumps to a field from the review screen, and a build is never turned into measurements', async () => {
    const user = await open()
    await chooseModel(user, 'Male')
    await user.click(await screen.findByRole('radio', { name: pick('Fat') }))
    await next(user)
    await toReview(user, '175')
    expect(screen.getAllByText('Not entered').length).toBe(10)
    await user.click(screen.getByRole('button', { name: 'Edit height' }))
    expect(await screen.findByRole('heading', { name: 'Height' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('175')
  })
})

describe('BodySetupPage screen reader and focus behaviour', () => {
  it('announces the step politely and counts it as "Step n of N"', async () => {
    const user = await open()
    await modelHeading()
    const live = screen.getByText('Step 1 of 14')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveAttribute('role', 'status')
    await chooseModel(user, 'Male')
    expect(screen.getByText('Step 2 of 14')).toBeInTheDocument()
    await next(user)
    expect(await screen.findByText('Step 3 of 14')).toBeInTheDocument()
    await toReview(user)
    expect(screen.getByText('Step 14 of 14')).toBeInTheDocument()
  })

  it('moves focus to the heading of each step', async () => {
    const user = await open()
    expect(await modelHeading()).toHaveFocus()
    await user.click(screen.getByRole('radio', { name: pick('Male') }))
    await next(user)
    expect(await screen.findByRole('heading', { name: 'Which body build best describes you?' })).toHaveFocus()
    await next(user)
    expect(await screen.findByRole('heading', { name: 'Height' })).toHaveFocus()
    await next(user)
    expect(await screen.findByRole('heading', { name: 'Weight' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Height' })).toHaveFocus()
    await typeValue(user, '175')
    await toReview(user, null)
    expect(screen.getByRole('heading', { name: 'Review your measurements' })).toHaveFocus()
  })
})

describe('BodySetupPage units and validation', () => {
  it('shows the same canonical value in the chosen unit, and never drifts across repeated toggles', async () => {
    const user = await open()
    await toHeight(user)
    await typeValue(user, '175')
    expect(screen.getByRole('button', { name: 'cm, kg' })).toHaveAttribute('aria-pressed', 'true')
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: 'in, lb' }))
      expect(screen.getByRole('button', { name: 'in, lb' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('textbox', { name: 'Height (in)' })).toHaveValue('68.9')
      await user.click(screen.getByRole('button', { name: 'cm, kg' }))
      expect(screen.getByRole('textbox', { name: 'Height (cm)' })).toHaveValue('175')
    }
  })

  it('reads typed inches as centimetres when saving', async () => {
    const user = await open()
    await toHeight(user)
    await user.click(screen.getByRole('button', { name: 'in, lb' }))
    await typeValue(user, '70')
    await toReview(user, null)
    expect(screen.getByText('70 in')).toBeInTheDocument()
    await user.click(consent())
    await user.click(finishButton())
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0].heightCm).toBe(177.8)
  })

  it('shows the weight unit as lb in imperial', async () => {
    const user = await open()
    await toHeight(user)
    await typeValue(user, '175')
    await next(user)
    await user.click(screen.getByRole('button', { name: 'in, lb' }))
    expect(await screen.findByRole('textbox', { name: 'Weight (lb)' })).toBeInTheDocument()
  })

  it('shows an inline error naming the range, and does not advance on an out-of-range value', async () => {
    const user = await open()
    await toHeight(user)
    await typeValue(user, '50')
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Height must be between 100 and 230 cm, but 50 was entered. Check your tape reading, then enter it again.')).toBeInTheDocument()
    await next(user)
    expect(screen.getByRole('heading', { name: 'Height' })).toBeInTheDocument()
    expect(screen.getByText('Step 3 of 14')).toBeInTheDocument()
    expect(input).toHaveFocus()
    expect(JSON.parse(screen.getByTestId('studio').dataset.cm!)).toEqual({})
  })

  it('clears the error once the value is fixed', async () => {
    const user = await open()
    await toHeight(user)
    await typeValue(user, '50')
    await typeValue(user, '170')
    expect(screen.queryByText(/must be between/)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid')
  })

  it('keeps letters, emoji, signs and exponents out of the field', async () => {
    const user = await open()
    await toHeight(user)
    await user.type(screen.getByRole('textbox'), 'ab-1e\u{1F600}7.5.2')
    expect(screen.getByRole('textbox')).toHaveValue('17.52')
  })

  it('moves on when the field is left empty, since only height is required', async () => {
    const user = await open()
    await toHeight(user)
    await next(user)
    expect(await screen.findByRole('heading', { name: 'Weight' })).toBeInTheDocument()
  })
})

describe('BodySetupPage review and Finish', () => {
  it('keeps Finish off until the consent box is ticked', async () => {
    const user = await openAtReview(175)
    expect(finishButton()).toBeDisabled()
    expect(screen.getByText('Tick the box to turn on Finish Setup.')).toBeInTheDocument()
    await user.click(consent())
    expect(finishButton()).toBeEnabled()
    await user.click(consent())
    expect(finishButton()).toBeDisabled()
    expect(save).not.toHaveBeenCalled()
  })

  it('needs a height: Finish stays off even with consent', async () => {
    const user = await open()
    await toHeight(user)
    await toReview(user, null)
    expect(screen.getByRole('alert')).toHaveTextContent('Height is needed to save.')
    await user.click(consent())
    expect(finishButton()).toBeDisabled()
  })

  it('says what AR try-on still needs without blocking Finish', async () => {
    const user = await openAtReview(175)
    expect(screen.getByText(/AR try-on needs chest, waist, hips, shoulder width/)).toBeInTheDocument()
    await user.click(consent())
    expect(finishButton()).toBeEnabled()
  })

  it('disables Finish while the save is pending, so it cannot be sent twice', async () => {
    let resolve: (profile: BodyProfile) => void = () => {}
    save.mockReturnValue(new Promise((r) => (resolve = r)))
    const user = await openAtReview(175)
    await user.click(consent())
    await user.click(finishButton())
    expect(finishButton()).toBeDisabled()
    await user.click(finishButton())
    expect(save).toHaveBeenCalledTimes(1)
    expect(where()).toBe('/profile/measurements')
    await act(async () => resolve(SAVED_PROFILE))
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('clears the draft and sends nothing to localStorage on success', async () => {
    const user = await openAtReview(175)
    expect(loadDraft(EMAIL)?.entered.height).toBe(175)
    await user.click(consent())
    await user.click(finishButton())
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(loadDraft(EMAIL)).toBeNull()
    expect(sessionStorage.getItem('silhoufit-body-setup')).toBeNull()
    const stored = Object.keys(localStorage).map((key) => `${key}=${localStorage.getItem(key)}`).join('\n')
    expect(stored).not.toContain('175')
    expect(stored).not.toMatch(/body/i)
  })

  it.each([
    ['network', /connection dropped/],
    ['rate-limit', /limiting requests/],
    ['invalid', /did not accept one of the values/],
    ['unauthorized', /session has ended/],
    ['server', /something went wrong on our side/i],
  ] as const)('on a %s failure shows an error toast with Retry, keeps the draft and stays on the page', async (kind, message) => {
    save.mockRejectedValueOnce(new BodyProfileError(kind))
    const user = await openAtReview(175)
    await user.click(consent())
    await user.click(finishButton())

    const toast = await screen.findByRole('alert')
    expect(toast).toHaveTextContent(message)
    expect(toast).toHaveTextContent("We couldn't save your measurements.")
    expect(within(toast).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(where()).toBe('/profile/measurements')
    expect(loadDraft(EMAIL)?.entered.height).toBe(175)
    expect(finishButton()).toBeEnabled()
  })

  it('retries from the toast and then finishes', async () => {
    save.mockRejectedValueOnce(new BodyProfileError('network'))
    const user = await openAtReview(175)
    await user.click(consent())
    await user.click(finishButton())
    await user.click(await within(await screen.findByRole('alert')).findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0])
    expect(loadDraft(EMAIL)).toBeNull()
  })

  it('treats an unexpected rejection as a server failure', async () => {
    save.mockRejectedValueOnce(new Error('boom'))
    const user = await openAtReview(175)
    await user.click(consent())
    await user.click(finishButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side')
  })
})

describe('BodySetupPage Skip for now', () => {
  const screens: Array<[string, (user: UserEvent) => Promise<void>]> = [
    ['model', async () => {}],
    ['build', async (user) => chooseModel(user, 'Male')],
    ['a measurement', async (user) => toHeight(user)],
    ['review', async (user) => {
      await toHeight(user)
      await toReview(user, '175')
    }],
  ]

  it.each(screens)('is on the %s screen, leaves the saved address alone and calls no save', async (_name, go) => {
    await saveAddress(EMAIL, ADDRESS)
    const user = await open()
    await modelHeading()
    await go(user)
    const skip = screen.getByRole('button', { name: 'Skip for now' })
    await user.click(skip)

    await waitFor(() => expect(where()).toBe('/profile'))
    expect(save).not.toHaveBeenCalled()
    expect(await getAddress(EMAIL)).toEqual(ADDRESS)
    expect(loadDraft(EMAIL)).toBeNull()
    expect(sessionStorage.getItem('silhoufit-body-setup')).toBeNull()
    expect(await screen.findByText('You can add your measurements any time from your profile.')).toBeInTheDocument()
  })

  it('also closes from the X button, with the same result', async () => {
    const user = await open()
    await modelHeading()
    await user.click(screen.getByRole('button', { name: 'Close avatar setup and skip for now' }))
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(save).not.toHaveBeenCalled()
  })

  it('is also on the screen shown when the saved profile fails to load', async () => {
    getProfile.mockRejectedValueOnce(new BodyProfileError('network'))
    const user = await open()
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your saved measurements.")
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(save).not.toHaveBeenCalled()
  })

  it('is on the loading screen too, so a slow or hung request never leaves only Escape', async () => {
    getProfile.mockReturnValue(new Promise(() => {}))
    const user = await open()
    expect(screen.getByRole('status', { name: 'Loading your measurements' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(save).not.toHaveBeenCalled()
    expect(await screen.findByText('You can add your measurements any time from your profile.')).toBeInTheDocument()
  })

  it('ends the tour from the loading screen too', async () => {
    getProfile.mockReturnValue(new Promise(() => {}))
    const user = await open({ inTour: true })
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(screen.getByTestId('phase')).toHaveTextContent('done')
  })

  it('ends the body step of the tour, and Finish does too', async () => {
    const user = await open({ inTour: true })
    await modelHeading()
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(screen.getByTestId('phase')).toHaveTextContent('done')
  })

  it('does not touch the tour outside it', async () => {
    const user = await open()
    await modelHeading()
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(screen.getByTestId('phase')).toHaveTextContent('none')
  })

  it('finishing saves and moves the tour to its completion card', async () => {
    const user = await openAtReview(175, { inTour: true })
    await user.click(consent())
    await user.click(finishButton())
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(screen.getByTestId('phase')).toHaveTextContent('done')
  })

  it('does not end the tour when a save fails', async () => {
    save.mockRejectedValueOnce(new BodyProfileError('server'))
    const user = await openAtReview(175, { inTour: true })
    await user.click(consent())
    await user.click(finishButton())
    await screen.findByRole('alert')
    expect(screen.getByTestId('phase')).toHaveTextContent('body')
  })
})

describe('BodySetupPage Escape', () => {
  it('acts as Skip for now', async () => {
    const user = await open()
    await modelHeading()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(save).not.toHaveBeenCalled()
    expect(loadDraft(EMAIL)).toBeNull()
  })

  it('is ignored while the user is typing in a field, so a stray Escape does not discard the draft', async () => {
    const user = await open()
    await toHeight(user)
    await user.type(screen.getByRole('textbox'), '175')
    expect(screen.getByRole('textbox')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(where()).toBe('/profile/measurements')
    expect(screen.getByRole('textbox')).toHaveValue('175')
    expect(loadDraft(EMAIL)?.entered.height).toBe(175)
  })

  it('skips again once focus is out of the field', async () => {
    const user = await open()
    await toHeight(user)
    await user.type(screen.getByRole('textbox'), '175')
    await user.click(screen.getByRole('heading', { name: 'Height' }))
    expect(screen.getByRole('textbox')).not.toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(loadDraft(EMAIL)).toBeNull()
  })

  it('still skips from a radio card, which takes no typing', async () => {
    const user = await open()
    await modelHeading()
    await user.click(screen.getByRole('radio', { name: pick('Male') }))
    expect(screen.getByRole('radio', { name: pick('Male') })).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(where()).toBe('/profile'))
  })

  it('works on the loading screen', async () => {
    getProfile.mockReturnValue(new Promise(() => {}))
    const user = await open()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(where()).toBe('/profile'))
  })

  it('leaves a modal dialog to close itself instead of skipping', async () => {
    const user = await open()
    await modelHeading()
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    document.body.append(modal)
    await user.keyboard('{Escape}')
    expect(where()).toBe('/profile/measurements')
    modal.remove()
  })
})

describe('BodySetupPage loading, resuming and signed-out access', () => {
  it('shows a loading skeleton while the saved profile loads', async () => {
    getProfile.mockReturnValue(new Promise(() => {}))
    await open()
    expect(screen.getByRole('status', { name: 'Loading your measurements' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Which body model/ })).not.toBeInTheDocument()
  })

  it('pre-fills the setup from a saved profile (edit)', async () => {
    getProfile.mockResolvedValue(SAVED_PROFILE)
    const user = await open()
    await modelHeading()
    expect(screen.getByRole('radio', { name: pick('Female') })).toBeChecked()
    await next(user)
    expect(await screen.findByRole('radio', { name: pick('Lean') })).toBeChecked()
    await next(user)
    expect(await screen.findByRole('textbox')).toHaveValue('168')
    expect(JSON.parse(screen.getByTestId('studio').dataset.cm!)).toEqual({ height: 168, chest: 90, sleeve: 59 })
  })

  it('resumes a draft from this tab at its step without asking the server', async () => {
    saveDraft(newDraft(EMAIL, { model: 'male', step: 3, unit: 'imperial', entered: { height: 177.8 } }))
    await open()
    expect(await screen.findByRole('heading', { name: 'Weight' })).toBeInTheDocument()
    expect(screen.getByText('Step 4 of 14')).toBeInTheDocument()
    expect(getProfile).not.toHaveBeenCalled()
  })

  it('ignores a draft left by another account', async () => {
    saveDraft(newDraft('other@example.com', { model: 'male', step: 3, entered: { height: 180 } }))
    await open()
    await modelHeading()
    expect(getProfile).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Step 1 of 14')).toBeInTheDocument()
  })

  it('writes the draft to sessionStorage as the user goes, never to localStorage', async () => {
    const user = await open()
    await toHeight(user)
    await typeValue(user, '172')
    expect(loadDraft(EMAIL)).toMatchObject({ model: 'male', step: 2, entered: { height: 172 } })
    const stored = Object.keys(localStorage).map((key) => localStorage.getItem(key)).join('\n')
    expect(stored).not.toContain('172')
  })

  it('shows a load error with Try again, which loads the setup once the server answers', async () => {
    getProfile.mockRejectedValueOnce(new BodyProfileError('server'))
    const user = await open()
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your saved measurements.")
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await modelHeading()
    expect(getProfile).toHaveBeenCalledTimes(2)
  })

  it('sends a user whose session expired to sign in, then back to the setup', async () => {
    getProfile.mockRejectedValueOnce(new BodyProfileError('unauthorized'))
    await open()
    await waitFor(() => expect(where()).toBe('/login?next=%2Fprofile%2Fmeasurements'))
  })

  it('sends a signed-out visitor to sign in', async () => {
    act(() => clearSession())
    await open()
    await waitFor(() => expect(where()).toBe('/login?next=%2Fprofile%2Fmeasurements'))
    expect(getProfile).not.toHaveBeenCalled()
  })

  it('goes home when the user signs out while on the page', async () => {
    await open()
    await modelHeading()
    act(() => clearSession())
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('passes prefers-reduced-motion to the studio', async () => {
    motion.reduced = true
    await open()
    await modelHeading()
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByRole('radio', { name: pick('Male') }))
    await next(user)
    expect(await screen.findByTestId('studio')).toHaveAttribute('data-reduced', 'true')
  })

  it('does not ask for reduced motion by default', async () => {
    const user = await open()
    await chooseModel(user, 'Male')
    expect(await screen.findByTestId('studio')).toHaveAttribute('data-reduced', 'false')
  })
})

describe('BodySetupPage when a section crashes', () => {
  // React logs every error a boundary catches; the tests expect them.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the flat body with Try again when the studio fails to load, and the flow still completes', async () => {
    crash.studio = true
    const user = await open()
    await chooseModel(user, 'Male')
    await next(user)
    expect(await screen.findByText(/The 3D body could not load/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Height' })).toBeInTheDocument()
    expect(screen.queryByTestId('studio')).not.toBeInTheDocument()

    await typeValue(user, '175')
    await toReview(user, null)
    await user.click(consent())
    await user.click(finishButton())
    await waitFor(() => expect(where()).toBe('/profile'))
    expect(save.mock.calls[0][0]).toMatchObject({ heightCm: 175 })
  })

  it('brings the studio back on Try again once it loads', async () => {
    crash.studio = true
    const user = await open()
    await chooseModel(user, 'Male')
    await screen.findByText(/The 3D body could not load/)
    crash.studio = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('studio')).toBeInTheDocument()
    expect(screen.queryByText(/The 3D body could not load/)).not.toBeInTheDocument()
  })

  it('keeps Skip for now reachable when the studio is down', async () => {
    crash.studio = true
    const user = await open()
    await chooseModel(user, 'Male')
    await screen.findByText(/The 3D body could not load/)
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    await waitFor(() => expect(where()).toBe('/profile'))
  })

  it('replaces a crashed step with a message, Try again and Skip for now, and the header Skip still works', async () => {
    crash.step = true
    const user = await open()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This step could not be shown.')
    expect(alert).toHaveTextContent('they are kept in this tab')
    expect(screen.getAllByRole('button', { name: 'Skip for now' })).toHaveLength(2)

    crash.step = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await modelHeading()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('skips from the crashed step', async () => {
    crash.step = true
    const user = await open()
    await screen.findByRole('alert')
    const [, inStep] = screen.getAllByRole('button', { name: 'Skip for now' })
    await user.click(inStep)
    await waitFor(() => expect(where()).toBe('/profile'))
  })
})

describe('BodySetupPage load timeout', () => {
  it('shows the load error with Try again and Skip when the request times out (a network error)', async () => {
    getProfile.mockRejectedValueOnce(new BodyProfileError('network'))
    const user = await open()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load your saved measurements.")
    expect(alert).toHaveTextContent('The connection dropped before we got a response.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await modelHeading()
  })
})

describe('BodySetupPage small screens', () => {
  it('keeps "How to measure" folded until asked, and folds it again on the next measurement', async () => {
    const user = await open()
    await toHeight(user)
    const toggle = screen.getByRole('button', { name: 'How to measure' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'measure-how-to')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'How to measure' })).toHaveAttribute('aria-expanded', 'true')
    await next(user)
    await screen.findByRole('heading', { name: 'Weight' })
    expect(screen.getByRole('button', { name: 'How to measure' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('puts the field and Back/Next in a footer apart from the scrolling explanation', async () => {
    const user = await open()
    await toHeight(user)
    const footer = screen.getByRole('textbox').closest('[class*="max-lg:shrink-0"]')
    expect(footer).not.toBeNull()
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Next' })).toBeInTheDocument()
    expect(within(footer as HTMLElement).queryByText('How to measure')).not.toBeInTheDocument()
  })

  it('keeps Skip for now on one line', async () => {
    await open()
    await modelHeading()
    expect(screen.getByRole('button', { name: 'Skip for now' }).className).toContain('whitespace-nowrap')
  })

  it('sizes the page to the visible viewport, so the on-screen keyboard does not cover the field', async () => {
    const viewport = Object.assign(new EventTarget(), { height: 640, offsetTop: 0 })
    vi.stubGlobal('visualViewport', viewport)
    try {
      await open()
      await modelHeading()
      const root = document.querySelector<HTMLElement>('[style*="--vvh"]')!
      expect(root.style.getPropertyValue('--vvh')).toBe('640px')
      viewport.height = 380
      viewport.offsetTop = 12
      act(() => {
        viewport.dispatchEvent(new Event('resize'))
      })
      expect(root.style.getPropertyValue('--vvh')).toBe('380px')
      expect(root.style.getPropertyValue('--vvtop')).toBe('12px')
    } finally {
      vi.unstubAllGlobals()
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
    }
  })

  it('styles the disabled Next apart from an enabled one', async () => {
    const user = await open()
    await modelHeading()
    const nextButton = screen.getByRole('button', { name: 'Next' })
    expect(nextButton).toBeDisabled()
    expect(nextButton.className).toContain('disabled:bg-fg/10')
    expect(nextButton.className).toContain('disabled:text-fg-muted')
    await user.click(screen.getByRole('radio', { name: pick('Male') }))
    expect(nextButton).toBeEnabled()
  })
})
