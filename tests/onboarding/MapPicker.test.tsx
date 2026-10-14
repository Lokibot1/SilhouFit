import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import MapPicker from '../../src/components/address/MapPicker'

const getCurrentPosition = vi.fn()

function allowGeolocation() {
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
})
beforeEach(allowGeolocation)
afterEach(() => {
  vi.clearAllMocks()
  Reflect.deleteProperty(navigator, 'geolocation')
})

const found = (accuracy: number) => (success: PositionCallback) =>
  success({ coords: { latitude: 14.5995, longitude: 120.9842, accuracy } } as GeolocationPosition)
const failed = (code: number) => (_success: PositionCallback, error: PositionErrorCallback) =>
  error({ code, message: '' } as GeolocationPositionError)

async function setup() {
  const onBack = vi.fn()
  const onUse = vi.fn().mockResolvedValue(null)
  const user = userEvent.setup()
  render(<MapPicker onBack={onBack} onUse={onUse} />)
  // The pin-the-centre button only exists once Leaflet has loaded and built the map.
  await screen.findByRole('button', { name: 'Pin map center' })
  return { user, onBack, onUse }
}

describe('MapPicker', () => {
  it('loads Leaflet on demand, with the attribution and the privacy line', async () => {
    await setup()
    expect(document.querySelector('.leaflet-container')).not.toBeNull()
    expect(document.querySelector('.leaflet-control-attribution')).toHaveTextContent('OpenStreetMap')
    expect(screen.getByText("Your location is sent to OpenStreetMap only to fill these fields. We don't save it.")).toBeInTheDocument()
  })

  it('cannot use a location until a pin is placed, then hands back the pin', async () => {
    const { user, onUse } = await setup()
    expect(screen.getByRole('button', { name: 'Use this location' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Pin map center' }))
    await user.click(screen.getByRole('button', { name: 'Use this location' }))
    expect(onUse).toHaveBeenCalledTimes(1)
    const [lat, lon] = onUse.mock.calls[0]
    expect(Number.isFinite(lat) && Number.isFinite(lon)).toBe(true)
  })

  it('places a pin from Auto-pin and shows how accurate it is', async () => {
    getCurrentPosition.mockImplementation(found(25))
    const { user, onUse } = await setup()
    await user.click(screen.getByRole('button', { name: 'Auto-pin location' }))
    expect(await screen.findByText('Accurate to about 25 m.')).toBeInTheDocument()
    expect(screen.queryByText(/wide area/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use this location' })).toBeEnabled()
    expect(onUse).not.toHaveBeenCalled()
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    })
  })

  it('warns when the fix is wider than 500 m', async () => {
    getCurrentPosition.mockImplementation(found(1800))
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Auto-pin location' }))
    expect(await screen.findByText(/Accurate to about 1800 m\./)).toBeInTheDocument()
    expect(screen.getByText(/wide area, so drag the pin/)).toBeInTheDocument()
  })

  it('says what happened when location is denied', async () => {
    getCurrentPosition.mockImplementation(failed(1))
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Auto-pin location' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked for this site.*Allow location in your browser settings/)
  })

  it('says what happened when no position is available', async () => {
    getCurrentPosition.mockImplementation(failed(2))
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Auto-pin location' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't work out where you are.*weak/)
  })

  it('offers Try again after a timeout', async () => {
    getCurrentPosition.mockImplementationOnce(failed(3)).mockImplementation(found(40))
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Auto-pin location' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/longer than 10 seconds/)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Accurate to about 40 m.')).toBeInTheDocument()
  })

  it('disables Auto-pin with the reason when the browser has no location', async () => {
    Reflect.deleteProperty(navigator, 'geolocation')
    await setup()
    expect(screen.getByRole('button', { name: 'Auto-pin location' })).toBeDisabled()
    expect(screen.getByText("This browser can't share your location.")).toBeInTheDocument()
  })

  it('names the pin for assistive tech', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Pin map center' }))
    expect(screen.getByRole('button', { name: 'Pinned location. Drag to adjust, or use Pin map center.' })).toBeInTheDocument()
  })

  it('stays open with the pin when it is refused, and clears the message once the pin moves', async () => {
    const { user, onUse, onBack } = await setup()
    onUse.mockResolvedValueOnce('That spot is outside the Philippines. Pick a spot in the Philippines.')
    await user.click(screen.getByRole('button', { name: 'Pin map center' }))
    await user.click(screen.getByRole('button', { name: 'Use this location' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('outside the Philippines')
    expect(onBack).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Use this location' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Pin map center' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('goes back without a pin', async () => {
    const { user, onBack, onUse } = await setup()
    await user.click(screen.getByRole('button', { name: 'Back to form' }))
    expect(onBack).toHaveBeenCalled()
    expect(onUse).not.toHaveBeenCalled()
  })
})
