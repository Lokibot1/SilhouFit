import { expect, test, type Page, type Route } from '@playwright/test'
import type { Address } from '../../src/service/addresses'
import { ADDRESS } from '../fixtures/addresses'
import { DEMO, mockAuth } from '../shared/session'
import { mockAddresses } from '../shared/addresses'
import { mockPsgc } from '../shared/psgc'
import batangas from '../fixtures/nominatim/batangas.json' with { type: 'json' }
import manila from '../fixtures/nominatim/manila.json' with { type: 'json' }
import singapore from '../fixtures/nominatim/singapore.json' with { type: 'json' }
import unmatched from '../fixtures/nominatim/unmatched.json' with { type: 'json' }

// Every outside service is mocked: PSGC lists, Nominatim and the map tiles. Fixtures hold real responses.
const CORS = { 'access-control-allow-origin': '*' }
const TILE = 'tests/fixtures/tiles/1x1.png'
const PLACES = { manila, batangas, unmatched, singapore }

interface Mocks {
  psgc?: 'ok' | 'error'
  /** Which Nominatim fixture answers every reverse lookup. */
  place?: 'manila' | 'batangas' | 'unmatched' | 'singapore'
  tiles?: 'ok' | 'aborted'
  geolocation?: 'grant' | 'deny' | 'timeout' | 'none'
  /** What GET /users/me/addresses already holds. */
  saved?: Address[]
}

/** Mocks every outside service and the addresses API; returns the API mock so a test can read what was sent. */
async function mockServices(page: Page, { psgc = 'ok', place = 'manila', tiles = 'ok', saved = [] }: Mocks = {}) {
  const json = (route: Route, body: unknown) => route.fulfill({ json: body, headers: CORS })
  await mockPsgc(page, psgc)
  await page.route('**/nominatim.openstreetmap.org/reverse**', (route) => json(route, PLACES[place]))
  await page.route('**/tile.openstreetmap.org/**', (route) =>
    tiles === 'aborted' ? route.abort() : route.fulfill({ path: TILE, contentType: 'image/png' }),
  )
  return mockAddresses(page, saved)
}

async function stubGeolocation(page: Page, mode: 'deny' | 'timeout') {
  await page.addInitScript((code) => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, fail: (e: object) => void) => setTimeout(() => fail({ code, message: '' }), 50),
      },
    })
  }, mode === 'deny' ? 1 : 3)
}

// A saved body profile means the tour leaves out its body measurements step, so the address step is followed by the completion card.
const SAVED_PROFILE = {
  heightCm: 168, weightKg: null, shoulderWidthCm: null, chestCm: 90, bustCm: null, torsoLengthCm: null, waistCm: null,
  hipsCm: null, inseamCm: null, outseamCm: null, thighCm: null, armLengthCm: 59, bodyModel: 'female', bodyBuild: 'lean',
}
const BODY_CORS = { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

test.beforeEach(async ({ page }) => {
  await mockAuth(page, { brandNew: true })
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await page.route('**/users/me/body-profile', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: BODY_CORS })
      : route.fulfill({ json: SAVED_PROFILE, headers: BODY_CORS }),
  )
})

/** Signs in, runs the tour to its last stop and presses Finish. */
async function finishTour(page: Page) {
  test.setTimeout(90_000)
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await page.getByRole('dialog', { name: 'Welcome to SilhouFit' }).getByRole('button', { name: 'Start the tour' }).click()
  const card = page.getByRole('dialog').filter({ hasText: /Step \d of \d/ })
  for (let i = 0; i < 20; i += 1) {
    const finish = card.getByRole('button', { name: 'Finish', exact: true })
    if (await finish.isVisible()) break
    await card.getByRole('button', { name: 'Next', exact: true }).click()
  }
  await card.getByRole('button', { name: 'Finish', exact: true }).click()
}

const addressDialog = (page: Page) => page.getByRole('dialog', { name: 'Save your delivery address' })
const completion = (page: Page) => page.getByRole('dialog', { name: "You're Ready to Shop!" })

async function pick(page: Page, field: RegExp, option: string | RegExp) {
  await addressDialog(page).getByRole('button', { name: field }).click()
  await page.getByRole('option', { name: option }).click()
}

/** A new address needs a map pin, so the map's centre is pinned first; the lists then set the fields as they were. */
async function pinMapCenter(page: Page) {
  await addressDialog(page).getByRole('button', { name: 'Pin on a map' }).click()
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await addressDialog(page).getByRole('button', { name: 'Pin map center' }).click()
  await addressDialog(page).getByRole('button', { name: 'Use this location' }).click()
  await expect(addressDialog(page).getByText(/Pin placed/)).toBeVisible()
}

async function fillFromLists(page: Page) {
  await pinMapCenter(page)
  await pick(page, /^Region/, /NCR/)
  await pick(page, /^City or municipality/, 'City of Manila')
  await pick(page, /^Barangay/, 'Barangay 176')
  await addressDialog(page).getByLabel('Phone number', { exact: true }).fill('917 123 4567')
  await addressDialog(page).getByLabel('Street address', { exact: true }).fill('12 Rizal Avenue')
  await addressDialog(page).getByLabel('Postal code', { exact: true }).fill('1000')
}

test.describe('address step', () => {
  test('is skippable: nothing is saved and the tour goes on to the completion card', async ({ page }) => {
    const api = await mockServices(page)
    await finishTour(page)
    await expect(addressDialog(page)).toBeVisible()
    await addressDialog(page).getByRole('button', { name: 'Skip this step' }).click()
    await expect(completion(page)).toBeVisible()
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  test('Escape skips it too, and the dropdown takes Escape first', async ({ page }) => {
    await mockServices(page)
    await finishTour(page)
    await addressDialog(page).getByRole('button', { name: /^Region/ }).click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(addressDialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(completion(page)).toBeVisible()
  })

  test('saves an address picked from the lists, with a toast', async ({ page }) => {
    const api = await mockServices(page)
    await finishTour(page)
    await fillFromLists(page)
    await expect(addressDialog(page).getByLabel('Province')).toHaveValue('Not applicable')
    await addressDialog(page).getByRole('button', { name: 'Save address' }).click()
    const toast = page.getByText('Address saved.')
    await expect(toast).toBeVisible()
    await expect(completion(page)).toBeVisible()
    // The toast is above the completion card's scrim, so it is what a click at its centre reaches.
    const reachable = await toast.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
    })
    expect(reachable).toBe(true)
    // Exactly the API's keys: no PSGC codes, and the map pin's coordinates. The first address is the default.
    expect(api.bodies).toEqual([
      {
        recipientName: 'Demo Shopper',
        phone: '+639171234567',
        region: 'NCR',
        cityMunicipality: 'City of Manila',
        barangay: 'Barangay 176',
        streetAddress: '12 Rizal Avenue',
        postalCode: '1000',
        latitude: expect.any(Number),
        longitude: expect.any(Number),
        isDefault: true,
      },
    ])
  })

  test('Escape, the close button and Skip are ignored while the address saves, and the result still arrives', async ({ page }) => {
    const api = await mockServices(page)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/users/me/addresses', async (route) => {
      if (route.request().method() === 'POST') await gate
      await route.fallback()
    })
    await finishTour(page)
    await fillFromLists(page)
    const dialog = addressDialog(page)
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(dialog.getByRole('button', { name: 'Skip this step' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: 'Close Save your delivery address' }).click()
    await expect(dialog).toBeVisible()
    release()
    await expect(page.getByText('Address saved.')).toBeVisible()
    await expect(completion(page)).toBeVisible()
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })

  test('the +63 prefix sits close to the digits and the counter reads out of 10', async ({ page }) => {
    await mockServices(page)
    await finishTour(page)
    const phone = addressDialog(page).getByLabel('Phone number', { exact: true })
    await phone.fill('09171234567')
    await expect(phone).toHaveValue('9171234567')
    await expect(addressDialog(page).getByText('10/10')).toBeVisible()
    // The gap between the "+63" glyphs (not their box) and the first digit.
    const gap = await phone.evaluate((input) => {
      const range = document.createRange()
      range.selectNodeContents(input.closest('.field')!.querySelector('.field__prefix span')!)
      return input.getBoundingClientRect().left + parseFloat(getComputedStyle(input).paddingLeft) - range.getBoundingClientRect().right
    })
    expect(gap).toBeGreaterThanOrEqual(4)
    expect(gap).toBeLessThanOrEqual(16)
  })

  test('shows the province as a muted value that Tab skips, and the placeholders stay readable', async ({ page }) => {
    await mockServices(page)
    await finishTour(page)
    await pick(page, /^Region/, /NCR/)
    await pick(page, /^City or municipality/, 'City of Manila')
    const province = addressDialog(page).getByLabel('Province')
    await expect(province).toHaveAttribute('aria-readonly', 'true')
    await expect(province).toHaveAttribute('tabindex', '-1')
    const barangay = addressDialog(page).getByRole('button', { name: /^Barangay/ })
    await pick(page, /^Barangay/, 'Barangay 176')
    await pick(page, /^Region/, /CALABARZON/)
    await expect(barangay).toBeDisabled()
    // Opacity would dim the instruction under 4.5:1, so the disabled control must be fully opaque.
    expect(await barangay.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  })

  test('shows inline errors before saving an empty form', async ({ page }) => {
    await mockServices(page)
    await finishTour(page)
    await addressDialog(page).getByRole('button', { name: 'Save address' }).click()
    await expect(addressDialog(page).getByText('Choose your region.')).toBeVisible()
    await expect(addressDialog(page).getByText('Postal code is required.')).toBeVisible()
    await expect(addressDialog(page)).toBeVisible()
  })

  test('is left out on a replay when an address is already saved', async ({ page }) => {
    await mockServices(page, { saved: [ADDRESS] })
    await finishTour(page)
    await expect(completion(page)).toBeVisible()
    await expect(addressDialog(page)).toHaveCount(0)
  })

  test('when the lists fail it says why, offers Try again, and the address can be typed instead', async ({ page }) => {
    const api = await mockServices(page, { psgc: 'error' })
    await finishTour(page)
    const alert = addressDialog(page).getByRole('alert').first()
    await expect(alert).toContainText("We couldn't load the list of regions", { timeout: 15_000 })
    await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
    await alert.getByRole('button', { name: 'Type it instead' }).click()

    await pinMapCenter(page)
    const dialog = addressDialog(page)
    await dialog.getByLabel('Phone number', { exact: true }).fill('9171234567')
    await dialog.getByLabel('Region', { exact: true }).fill('Central Visayas')
    await dialog.getByLabel('City or municipality', { exact: true }).fill('Mandaue City')
    await dialog.getByLabel('Barangay', { exact: true }).fill('Subangdaku')
    await dialog.getByLabel('Street address', { exact: true }).fill('5 Seaside Drive')
    await dialog.getByLabel('Postal code', { exact: true }).fill('6014')
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(completion(page)).toBeVisible()
    expect(api.bodies[0]).toMatchObject({ region: 'Central Visayas', cityMunicipality: 'Mandaue City', barangay: 'Subangdaku' })
    expect(api.bodies[0]).not.toHaveProperty('regionCode')
  })
})

test.describe('pin on a map', () => {
  async function openMap(page: Page) {
    await addressDialog(page).getByRole('button', { name: 'Pin on a map' }).click()
    await expect(addressDialog(page).getByRole('heading', { name: 'Pin your location' })).toBeVisible()
    await expect(page.locator('.leaflet-container')).toBeVisible()
  }

  test('a manual pin fills the fields, and nothing is looked up until Use this location', async ({ page }) => {
    let lookups = 0
    await mockServices(page)
    await page.route('**/nominatim.openstreetmap.org/reverse**', (route) => {
      lookups += 1
      return route.fulfill({ json: manila, headers: CORS })
    })
    await finishTour(page)
    await openMap(page)
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap')
    await expect(addressDialog(page).getByText("Your location is sent to OpenStreetMap only to fill these fields. We don't save it.")).toBeVisible()

    await addressDialog(page).getByRole('button', { name: 'Pin map center' }).click()
    await page.locator('.leaflet-container').click({ position: { x: 60, y: 60 } })
    expect(lookups).toBe(0)
    await addressDialog(page).getByRole('button', { name: 'Use this location' }).click()

    const dialog = addressDialog(page)
    await expect(dialog.getByText('Filled in from your pin. Check each field, then save.')).toBeVisible()
    expect(lookups).toBe(1)
    await expect(dialog.getByRole('button', { name: /^Region/ })).toContainText('NCR')
    await expect(dialog.getByRole('button', { name: /^City or municipality/ })).toContainText('City of Manila')
    await expect(dialog.getByLabel('Street address', { exact: true })).toHaveValue('718 P. Paterno Street')
    await expect(dialog.getByLabel('Postal code', { exact: true })).toHaveValue('1001')
  })

  test('a pin outside the Philippines keeps the map and the pin, with the reason beside it', async ({ page }) => {
    await mockServices(page, { place: 'singapore' })
    await finishTour(page)
    await openMap(page)
    await addressDialog(page).getByRole('button', { name: 'Pin map center' }).click()
    await addressDialog(page).getByRole('button', { name: 'Use this location' }).click()
    await expect(addressDialog(page).getByRole('alert')).toContainText('outside the Philippines')
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Pinned location/ })).toBeVisible()
    await expect(addressDialog(page).getByRole('button', { name: 'Use this location' })).toBeEnabled()
  })

  test('the attribution links are 44px targets and the pin has a name', async ({ page }) => {
    await mockServices(page)
    await finishTour(page)
    await openMap(page)
    for (const name of ['Leaflet', 'OpenStreetMap']) {
      const box = await page.locator('.leaflet-control-attribution').getByRole('link', { name }).boundingBox()
      expect(box!.height, name).toBeGreaterThanOrEqual(43.5)
      expect(box!.width, name).toBeGreaterThanOrEqual(43.5)
    }
    await addressDialog(page).getByRole('button', { name: 'Pin map center' }).click()
    await expect(page.getByRole('button', { name: 'Pinned location. Drag to adjust, or use Pin map center.' })).toBeVisible()
  })

  test('Auto-pin with location allowed places the pin and shows the accuracy', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 14.5995, longitude: 120.9842, accuracy: 20 })
    await mockServices(page)
    await finishTour(page)
    await openMap(page)
    await addressDialog(page).getByRole('button', { name: 'Auto-pin location' }).click()
    await expect(addressDialog(page).getByText(/Accurate to about \d+ m\./)).toBeVisible()
    await addressDialog(page).getByRole('button', { name: 'Use this location' }).click()
    await expect(addressDialog(page).getByLabel('Postal code', { exact: true })).toHaveValue('1001')
  })

  test('Auto-pin says plainly when location is blocked, and the form still works', async ({ page }) => {
    await stubGeolocation(page, 'deny')
    await mockServices(page)
    await finishTour(page)
    await openMap(page)
    await addressDialog(page).getByRole('button', { name: 'Auto-pin location' }).click()
    await expect(addressDialog(page).getByRole('alert')).toContainText('Location access is blocked for this site')
    await addressDialog(page).getByRole('button', { name: 'Back to form' }).click()
    await fillFromLists(page)
    await addressDialog(page).getByRole('button', { name: 'Save address' }).click()
    await expect(completion(page)).toBeVisible()
  })

  test('Auto-pin offers Try again after a timeout', async ({ page }) => {
    await stubGeolocation(page, 'timeout')
    await mockServices(page)
    await finishTour(page)
    await openMap(page)
    await addressDialog(page).getByRole('button', { name: 'Auto-pin location' }).click()
    await expect(addressDialog(page).getByRole('alert')).toContainText('longer than 10 seconds')
    await expect(addressDialog(page).getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('when the map pictures fail, it says so and Auto-pin still fills the form', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 14.5995, longitude: 120.9842, accuracy: 20 })
    await mockServices(page, { tiles: 'aborted' })
    await finishTour(page)
    await openMap(page)
    await expect(addressDialog(page).getByText(/The map pictures didn't load/)).toBeVisible({ timeout: 15_000 })
    await addressDialog(page).getByRole('button', { name: 'Auto-pin location' }).click()
    await expect(addressDialog(page).getByText('Filled in from your pin. Check each field, then save.')).toBeVisible()
    await expect(addressDialog(page).getByLabel('Street address', { exact: true })).toHaveValue('718 P. Paterno Street')
  })

  test('a name that is not in the list is left for the user to pick', async ({ page }) => {
    await mockServices(page, { place: 'unmatched' })
    await finishTour(page)
    await openMap(page)
    await addressDialog(page).getByRole('button', { name: 'Pin map center' }).click()
    await addressDialog(page).getByRole('button', { name: 'Use this location' }).click()
    await expect(addressDialog(page).getByText('The map says "Atlantis City", but it isn\'t in the list. Pick it below.')).toBeVisible()
    await expect(addressDialog(page).getByRole('button', { name: /^City or municipality/ })).toContainText('Select your city or municipality')
  })

  test('reduced motion turns the map animations off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockServices(page)
    await finishTour(page)
    await openMap(page)
    await expect(page.locator('.leaflet-container.leaflet-zoom-anim')).toHaveCount(0)
  })
})

test.describe('small screens', () => {
  test.use({ viewport: { width: 320, height: 568 } })

  const noSidewaysScroll = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth)

  async function buttonHeights(page: Page) {
    return page.getByRole('dialog', { name: 'Save your delivery address' }).evaluate((dialog) =>
      [...dialog.querySelectorAll<HTMLElement>('button, [role="button"]')]
        .filter((el) => el.offsetParent !== null && !el.matches('.leaflet-marker-icon'))
        .map((el) => ({ name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30), height: el.getBoundingClientRect().height })),
    )
  }

  test('the form and the map fit 320px with 44px targets and no sideways scroll', async ({ page }) => {
    await mockServices(page)
    await finishTour(page)
    await expect(addressDialog(page)).toBeVisible()
    expect(await noSidewaysScroll(page)).toBe(true)
    for (const { name, height } of await buttonHeights(page)) expect(height, name).toBeGreaterThanOrEqual(43.5)

    await addressDialog(page).getByRole('button', { name: 'Pin on a map' }).click()
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await page.getByRole('button', { name: 'Pin map center' }).click()
    expect(await noSidewaysScroll(page)).toBe(true)
    for (const { name, height } of await buttonHeights(page)) expect(height, name).toBeGreaterThanOrEqual(43.5)
    const box = await addressDialog(page).boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320.5)
  })

  test('a dropdown list stays inside the screen at 320px', async ({ page }) => {
    await mockServices(page)
    await finishTour(page)
    await addressDialog(page).getByRole('button', { name: /^Region/ }).click()
    const list = page.getByRole('listbox')
    await expect(list).toBeVisible()
    const box = await list.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320.5)
  })
})
