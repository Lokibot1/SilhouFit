import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { apiPickupLocation, mockPickupLocations } from '../shared/pickupLocations'
import { mockPsgc } from '../shared/psgc'
import manila from '../fixtures/nominatim/manila.json' with { type: 'json' }

// /admin/pickup-location and /superadmin/pickup-location: where Lalamove riders collect orders, read and saved through the API's /pickup-locations
// endpoints (stubbed in tests/shared/pickupLocations.ts, since the dev accounts have no token). The address form and map are the
// customer ones, so PSGC, Nominatim and the map tiles are stubbed as in tests/onboarding/address.spec.ts. Sign-in is the dev-only simulated one.
// Permissions live in localStorage 'silhoufit.permissions.v1'. Runs in the desktop and mobile projects.

const STAFF = { email: 'sam.reyes@silhoufit.dev', password: 'Staff@12345' }
const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }
const PERMISSIONS_KEY = 'silhoufit.permissions.v1'
const CORS = { 'access-control-allow-origin': '*' }
const TILE = 'tests/fixtures/tiles/1x1.png'

const SAVED = apiPickupLocation()
const TIME_12H = /\b\d{1,2}:\d{2}\s?[AP]M\b/i

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await mockPsgc(page)
  await page.route('**/nominatim.openstreetmap.org/reverse**', (route: Route) => route.fulfill({ json: manila, headers: CORS }))
  await page.route('**/tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }))
})

async function signIn(page: Page, { email, password }: { email: string; password: string }, home: RegExp) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(home)
}

async function openAs(page: Page, who = ADMIN, area: 'admin' | 'superadmin' = 'admin') {
  await signIn(page, who, new RegExp(`/${area}$`))
  await page.goto(`/${area}/pickup-location`)
  await expect(page.getByRole('heading', { level: 1, name: 'Pickup location' })).toBeVisible({ timeout: 20_000 })
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const section = (page: Page) => page.getByRole('region', { name: 'Pickup address' })
const updated = (page: Page) => section(page).locator('time')
const toast = (page: Page) => page.getByText(/^Pickup location (saved|added)$/)

async function pinWithAutoPin(page: Page) {
  await page.getByRole('button', { name: 'Pin on a map' }).click()
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await page.getByRole('button', { name: 'Auto-pin location' }).click()
  const use = page.getByRole('button', { name: 'Use this location' })
  await expect(use).toBeEnabled()
  await use.click()
  await expect(page.getByText('Filled in from your pin. Check each field, then save.')).toBeVisible()
}

async function pick(page: Page, field: RegExp, option: string | RegExp) {
  await page.getByRole('button', { name: field }).click()
  await page.getByRole('option', { name: option }).click()
}

/** Fills the form from a granted Auto-pin; the map fills the region, city, street and postal code, the rest is picked or typed. */
async function fillForm(page: Page, { label = '', name = 'Maria Santos', street }: { label?: string; name?: string; street?: string } = {}) {
  await pinWithAutoPin(page)
  await pick(page, /^Barangay/, 'Barangay 176')
  if (label) await page.getByLabel('Label', { exact: false }).first().fill(label)
  await page.getByLabel('Contact name', { exact: true }).fill(name)
  await page.getByLabel('Phone number', { exact: true }).fill('917 123 4567')
  if (street) await page.getByLabel('House No., Street Name', { exact: true }).fill(street)
}

async function grantLocation(context: import('@playwright/test').BrowserContext) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 14.5995, longitude: 120.9842, accuracy: 20 })
}

/** Shows the sidebar on a phone, where it sits behind the burger; retried because a tap before hydration does nothing. */
async function showNav(page: Page) {
  const burger = page.getByRole('button', { name: 'Open menu' })
  if (!(await burger.isVisible())) return
  const dashboard = page.getByRole('link', { name: 'Dashboard' }).first()
  await expect(async () => {
    if (!(await dashboard.isVisible())) await burger.click()
    await expect(dashboard).toBeVisible({ timeout: 1000 })
  }).toPass()
}

/** Waits for a sidebar link, reopening the phone drawer if it closed again while the page settled. */
async function expectNavLink(page: Page, name: string) {
  const burger = page.getByRole('button', { name: 'Open menu' })
  const link = page.getByRole('link', { name }).first()
  await expect(async () => {
    if (!(await link.isVisible()) && (await burger.isVisible())) await burger.click()
    await expect(link).toBeVisible({ timeout: 1000 })
  }).toPass()
}

async function nav(page: Page): Promise<Locator> {
  await showNav(page)
  return page.getByRole('navigation').filter({ has: page.getByRole('link', { name: 'Pickup Location' }) })
}

test.describe('empty state and first save', () => {
  test('starts empty with a call to action, no contact name prefilled, and saves with a toast and a summary', async ({ page, context }) => {
    const store = await mockPickupLocations(page, null)
    await grantLocation(context)
    await openAs(page)
    await expect(section(page).getByText(/No pickup location is set\. Checkout can't quote delivery/)).toBeVisible()
    await expect(section(page).getByRole('heading', { level: 2, name: 'No pickup location yet' })).toBeVisible()
    await expect(section(page).getByRole('listitem')).toHaveText(['1Pin the spot on the map', '2Add the rider contact', '3Save and riders are sent there'])
    const cta = section(page).getByRole('button', { name: 'Set pickup location' })
    expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await cta.click()
    // Not the signed-in admin's name: the contact is whoever hands the parcels over.
    await expect(page.getByLabel('Contact name', { exact: true })).toHaveValue('')

    await fillForm(page, { label: 'Main warehouse' })
    await expect(page.getByRole('button', { name: /^Region/ })).toContainText('NCR')
    await expect(page.getByLabel('House No., Street Name', { exact: true })).toHaveValue('718 P. Paterno Street')
    await page.getByRole('button', { name: 'Save pickup location' }).click()

    await expect(toast(page)).toBeVisible()
    const summary = section(page).getByRole('definition')
    await expect(section(page).getByText('Main warehouse', { exact: true })).toBeVisible()
    await expect(summary.filter({ hasText: 'Maria Santos, +639171234567' })).toBeVisible()
    await expect(summary.filter({ hasText: /^\d{2}\.\d{6}, \d{2,3}\.\d{6}$/ })).toBeVisible()
    await expect(section(page).getByText(/718 P\. Paterno Street.*Barangay 176.*City of Manila.*NCR/)).toBeVisible()
    await expect(updated(page)).toContainText(TIME_12H)
    await expect(section(page).getByRole('button', { name: /^Edit/ })).toBeVisible()
    // The heading takes focus after a save.
    await expect(page.getByRole('heading', { level: 2, name: 'Pickup address' })).toBeFocused()

    expect(store.row).toMatchObject({ contactName: 'Maria Santos', contactPhone: '+639171234567', region: 'NCR', cityMunicipality: 'City of Manila', label: 'Main warehouse' })
    expect(typeof store.row?.latitude).toBe('number')
    expect(typeof store.row?.longitude).toBe('number')
    // The API rejects keys it does not know, so only the form's own fields are sent.
    expect(Object.keys(store.bodies[0]).sort()).toEqual(
      ['label', 'contactName', 'contactPhone', 'region', 'province', 'cityMunicipality', 'barangay', 'streetAddress', 'addressLine2', 'postalCode', 'latitude', 'longitude'].sort(),
    )
    expect(await overflow(page)).toBe(0)
  })

  test('is still there after a reload', async ({ page, context }) => {
    await mockPickupLocations(page, null)
    await grantLocation(context)
    await openAs(page)
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    await fillForm(page)
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(toast(page)).toBeVisible()
    await page.reload()
    await expect(section(page).getByRole('definition').filter({ hasText: 'Maria Santos, +639171234567' })).toBeVisible({ timeout: 20_000 })
    await expect(section(page).getByRole('button', { name: 'Set pickup location' })).toHaveCount(0)
  })

  test('cannot be saved without a pin or the required fields', async ({ page }) => {
    const store = await mockPickupLocations(page, null)
    await openAs(page)
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(page.getByText('Pin the pickup spot on the map so riders can find it.')).toBeVisible()
    await expect(page.getByText('Choose your region.')).toBeVisible()
    expect(store.bodies).toHaveLength(0)
  })

  test('uses the pickup wording on the map and says plainly when location is blocked', async ({ page }) => {
    await mockPickupLocations(page, null)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition: (_ok: unknown, fail: (e: object) => void) => setTimeout(() => fail({ code: 1, message: '' }), 50) },
      })
    })
    await openAs(page)
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    await expect(page.getByText('Drop a pin and we will fill in the fields below. Riders are sent to this exact spot.')).toBeVisible()
    await page.getByRole('button', { name: 'Pin on a map' }).click()
    await expect(page.getByText(/The pin is saved as the pickup spot when you save\./)).toBeVisible()
    await page.getByRole('button', { name: 'Auto-pin location' }).click()
    await expect(page.getByRole('alert')).toContainText('Location access is blocked for this site')
  })

  test('with the map\'s centre pinned by hand it still saves (manual fallback)', async ({ page }) => {
    const store = await mockPickupLocations(page, null)
    await openAs(page)
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    await page.getByRole('button', { name: 'Pin on a map' }).click()
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await page.getByRole('button', { name: 'Pin map center' }).click()
    await page.getByRole('button', { name: 'Use this location' }).click()
    await expect(page.getByText('Filled in from your pin. Check each field, then save.')).toBeVisible()
    await pick(page, /^Barangay/, 'Barangay 176')
    await page.getByLabel('Contact name', { exact: true }).fill('Juan Dela Cruz')
    await page.getByLabel('Phone number', { exact: true }).fill('9171234567')
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(toast(page)).toBeVisible()
    expect(store.row).toMatchObject({ contactName: 'Juan Dela Cruz' })
  })

  test('Cancel leaves the empty state as it was', async ({ page }) => {
    const store = await mockPickupLocations(page, null)
    await openAs(page)
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(section(page).getByRole('button', { name: 'Set pickup location' })).toBeFocused()
    expect(store.row).toBeNull()
  })
})

test.describe('replacing a saved location', () => {
  let store: Awaited<ReturnType<typeof mockPickupLocations>>
  test.beforeEach(async ({ page, context }) => {
    await grantLocation(context)
    store = await mockPickupLocations(page, SAVED)
  })

  async function startReplace(page: Page) {
    await openAs(page)
    await expect(section(page).getByRole('definition').filter({ hasText: 'Maria Santos, +639171234567' })).toBeVisible()
    await expect(section(page).getByText('12 Rizal Avenue, Barangay 176, City of Manila, NCR, 1000')).toBeVisible()
    await section(page).getByRole('button', { name: /^Edit/ }).click()
    // The form starts from what is saved.
    await expect(page.getByLabel('Contact name', { exact: true })).toHaveValue('Maria Santos')
    await expect(page.getByLabel('House No., Street Name', { exact: true })).toHaveValue('12 Rizal Avenue')
    await page.getByLabel('Contact name', { exact: true }).fill('Pedro Reyes')
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    const dialog = page.getByRole('dialog', { name: 'Replace the pickup location?' })
    await expect(dialog).toBeVisible()
    return dialog
  }

  test('asks first, showing Now and New, and Cancel keeps the data and the form', async ({ page }) => {
    const dialog = await startReplace(page)
    await expect(dialog.getByText('Now', { exact: true })).toBeVisible()
    await expect(dialog.getByText('New', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Main warehouse').first()).toBeVisible()
    await expect(dialog.getByText(/Riders booked after this go to the new spot/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    // Nothing saved, the form is still open with the edit.
    await expect(page.getByLabel('Contact name', { exact: true })).toHaveValue('Pedro Reyes')
    expect(store.row?.contactName).toBe('Maria Santos')
    await expect(toast(page)).toHaveCount(0)
  })

  test('Escape closes the dialog like Cancel', async ({ page }) => {
    const dialog = await startReplace(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(store.row?.contactName).toBe('Maria Santos')
  })

  test('Replace pickup location saves the new one and shows it, with the toast', async ({ page }) => {
    const dialog = await startReplace(page)
    await dialog.getByRole('button', { name: 'Replace pickup location' }).click()
    await expect(toast(page)).toBeVisible()
    await expect(section(page).getByRole('definition').filter({ hasText: 'Pedro Reyes, +639171234567' })).toBeVisible()
    expect(store.row?.contactName).toBe('Pedro Reyes')
    // Replacing is a PATCH of the saved row, so the server keeps its id.
    expect(store.row?.id).toBe(SAVED.id)
    await page.reload()
    await expect(section(page).getByRole('definition').filter({ hasText: 'Pedro Reyes' })).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('loading and errors', () => {
  test('shows a loading status while it reads', async ({ page }) => {
    await mockPickupLocations(page, null)
    // The stubbed read answers at once, so it is held back for this page load only.
    await page.route(
      (url) => url.pathname === '/pickup-locations',
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 4000))
        return route.fallback()
      },
    )
    await signIn(page, ADMIN, /\/admin$/)
    await page.goto('/admin/pickup-location')
    await expect(page.getByRole('status', { name: 'Loading the pickup location' })).toBeVisible()
    await expect(section(page).getByRole('button', { name: 'Set pickup location' })).toBeVisible({ timeout: 20_000 })
  })

  test('a 500 on the read shows the error with Retry, then the location once it works', async ({ page }) => {
    await mockPickupLocations(page, SAVED)
    let fail = true
    await page.route(
      (url) => url.pathname === '/pickup-locations',
      (route) => (fail && route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { message: 'boom' }, headers: CORS }) : route.fallback()),
    )
    await openAs(page)
    await expect(section(page).getByText("We couldn't load the pickup location.")).toBeVisible({ timeout: 20_000 })
    fail = false
    await section(page).getByRole('button', { name: 'Retry' }).click()
    await expect(section(page).getByRole('button', { name: /^Edit/ })).toBeVisible()
  })
})

test.describe('page chrome', () => {
  test('has a unique title and a 150 to 160 character meta description', async ({ page }) => {
    await mockPickupLocations(page, null)
    await openAs(page)
    await expect(page).toHaveTitle('Pickup location — SilhouFit')
    const description = await page.locator('meta[name="description"]').getAttribute('content')
    expect(description!.length).toBeGreaterThanOrEqual(150)
    expect(description!.length).toBeLessThanOrEqual(160)
  })

  test('has no console errors, empty or saved', async ({ page }) => {
    const errors: string[] = []
    // The dev accounts hold no API token, so the dashboard they land on first gets 401s; those are not this page's.
    page.on('console', (message) => message.type() === 'error' && !message.text().startsWith('Failed to load resource') && errors.push(message.text()))
    page.on('pageerror', (error) => errors.push(error.message))
    await mockPickupLocations(page, SAVED)
    await openAs(page)
    await expect(section(page).getByRole('button', { name: /^Edit/ })).toBeVisible()
    await section(page).getByRole('button', { name: /^Edit/ }).click()
    await expect(page.getByLabel('Contact name', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })

  for (const width of [320, 640, 768, 1024, 1280, 1920]) {
    test(`has no horizontal overflow at ${width}px, empty, saved, editing and confirming`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await mockPickupLocations(page, SAVED)
      await openAs(page)
      await expect(section(page).getByRole('button', { name: /^Edit/ })).toBeVisible()
      expect(await overflow(page)).toBe(0)
      await section(page).getByRole('button', { name: /^Edit/ }).click()
      await expect(page.getByLabel('Contact name', { exact: true })).toBeVisible()
      expect(await overflow(page)).toBe(0)
      await page.getByLabel('Contact name', { exact: true }).fill('Pedro Reyes')
      await page.getByRole('button', { name: 'Save pickup location' }).click()
      await expect(page.getByRole('dialog', { name: 'Replace the pickup location?' })).toBeVisible()
      expect(await overflow(page)).toBe(0)
    })
  }

  test('has no horizontal overflow at 320px in the empty state', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await mockPickupLocations(page, null)
    await openAs(page)
    await expect(section(page).getByRole('button', { name: 'Set pickup location' })).toBeVisible()
    expect(await overflow(page)).toBe(0)
  })

  test('renders in dark mode with readable text', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await mockPickupLocations(page, SAVED)
    await openAs(page)
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(section(page).getByRole('definition').filter({ hasText: 'Maria Santos' })).toBeVisible()
    const { bg, text } = await section(page).evaluate((el) => {
      let bgColor = getComputedStyle(el).backgroundColor
      for (let node: Element | null = el; node && bgColor === 'rgba(0, 0, 0, 0)'; node = node.parentElement) bgColor = getComputedStyle(node).backgroundColor
      return { bg: bgColor, text: getComputedStyle(el.querySelector('dd')!).color }
    })
    const lum = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3
    expect(lum(bg)).toBeLessThan(110)
    expect(lum(text)).toBeGreaterThan(150)
  })
})

test.describe('who can reach it', () => {
  test('an admin has the nav item, highlighted on the page', async ({ page }) => {
    await mockPickupLocations(page, null)
    await openAs(page, ADMIN, 'admin')
    const link = (await nav(page)).getByRole('link', { name: 'Pickup Location' })
    await expect(link).toHaveAttribute('aria-current', 'page')
  })

  test('a superadmin reaches it at /superadmin/pickup-location, with the nav item highlighted', async ({ page }) => {
    await mockPickupLocations(page, null)
    await openAs(page, SUPERADMIN, 'superadmin')
    await expect(page).toHaveURL(/\/superadmin\/pickup-location$/)
    const link = (await nav(page)).getByRole('link', { name: 'Pickup Location' })
    await expect(link).toHaveAttribute('aria-current', 'page')
  })

  test('staff never see the nav item and are sent back to their dashboard, even with a stored grant', async ({ page }) => {
    await page.addInitScript(([k, v]) => localStorage.getItem(k) === null && localStorage.setItem(k, v), [PERMISSIONS_KEY, JSON.stringify({ staff: ['inventory', 'pickup-location'] })])
    await signIn(page, STAFF, /\/staff$/)
    await expectNavLink(page, 'Inventory')
    await expect(page.getByRole('link', { name: 'Pickup Location' })).toHaveCount(0)
    await page.goto('/admin/pickup-location')
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByText('That page is turned off for your role. Ask a superadmin if you need it.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Pickup location' })).toHaveCount(0)
  })

  test('a superadmin turning it off for admins hides the nav item and redirects the page', async ({ page }) => {
    await signIn(page, SUPERADMIN, /\/superadmin$/)
    await page.goto('/superadmin/permissions')
    const admin = page.getByRole('region', { name: 'Admin' })
    // Admin only: the Staff card has no such switch.
    await expect(page.getByRole('region', { name: 'Staff' }).getByText('Pickup Location', { exact: true })).toHaveCount(0)
    const group = admin.getByRole('group', { name: 'Pickup location' })
    const sw = group.getByRole('switch', { name: 'Pickup Location', exact: true })
    await expect(sw).toBeChecked()
    await sw.setChecked(false, { force: true })
    await admin.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Admin permissions saved')).toBeVisible()
    const savedAdmin = await page.evaluate((key) => (JSON.parse(localStorage.getItem(key)!) as { admin: string[] }).admin, PERMISSIONS_KEY)
    expect(savedAdmin).not.toContain('pickup-location')

    // Same browser, now as the admin: the stored permissions apply.
    await page.evaluate(() => localStorage.removeItem('silhoufit-session'))
    await signIn(page, ADMIN, /\/admin$/)
    await expectNavLink(page, 'User Management')
    await expect(page.getByRole('link', { name: 'Pickup Location' })).toHaveCount(0)
    await page.goto('/admin/pickup-location')
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByText('That page is turned off for your role. Ask a superadmin if you need it.')).toBeVisible()
  })
})

// The row the backend seeds, with the extra keys the API sends back (country, isDefault) that the page must never send on save.
const SEEDED = apiPickupLocation({
  id: '0b6f2a9e-3c41-4d7e-8f15-2a9c7e5d1b60',
  label: 'Main Dispatch Hub',
  contactName: 'Silhoufit Dispatch Hub',
  contactPhone: '+639170000000',
  region: 'NCR',
  province: 'Metro Manila',
  cityMunicipality: 'Makati City',
  barangay: 'San Lorenzo',
  streetAddress: 'Ayala Center',
  postalCode: '1226',
  latitude: 14.5547,
  longitude: 121.0244,
  createdAt: '2026-01-05T02:00:00.000Z',
  updatedAt: '2026-01-05T02:00:00.000Z',
})
const SEEDED_ADDRESS = 'Ayala Center, San Lorenzo, Makati City, Metro Manila, NCR, 1226'
const ALLOWED_KEYS = ['label', 'contactName', 'contactPhone', 'region', 'province', 'cityMunicipality', 'barangay', 'streetAddress', 'addressLine2', 'postalCode', 'latitude', 'longitude'].sort()
const isPickupCall = (url: string) => /^\/pickup-locations(\/|$)/.test(new URL(url).pathname)

/** The PSGC fixtures stop at Manila's barangays, so Makati's are added for the seeded row. */
async function mockMakati(page: Page) {
  await page.route('**/psgc.gitlab.io/api/cities-municipalities/137602000/barangays/', (route) =>
    route.fulfill({ json: [{ code: '137602001', name: 'San Lorenzo', cityCode: '137602000' }, { code: '137602002', name: 'Bel-Air', cityCode: '137602000' }], headers: CORS }),
  )
}

/**
 * Opens Change on the saved row, edits the contact name and presses Save, which raises the Replace dialog.
 * The seeded row names its city "Makati City" while PSGC calls it "City of Makati", so the form does not preselect it and `makati` picks it again.
 */
async function startChange(page: Page, { name = 'Pedro Reyes', makati = false } = {}) {
  await expect(section(page).getByRole('button', { name: /^Edit/ })).toBeVisible()
  await section(page).getByRole('button', { name: /^Edit/ }).click()
  await page.getByLabel('Contact name', { exact: true }).fill(name)
  if (makati) {
    await pick(page, /^City or municipality/, 'City of Makati')
    await pick(page, /^Barangay/, 'San Lorenzo')
  }
  await page.getByRole('button', { name: 'Save pickup location' }).click()
  const dialog = page.getByRole('dialog', { name: 'Replace the pickup location?' })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Answers every call of one method to /pickup-locations with a fixed failure, the rest fall through to the store. */
async function failWith(page: Page, method: string, status: number, json: unknown, headers: Record<string, string> = {}) {
  await page.route(
    (url) => url.pathname === '/pickup-locations',
    (route) => (route.request().method() === method ? route.fulfill({ status, json, headers: { ...CORS, ...headers } }) : route.fallback()),
  )
}

test.describe('save failures and edge cases', () => {
  const REMOVED = /We couldn't save the pickup location\. It was removed from another device\. Save again to set it, or Cancel to see what is saved\./

  /** Opens Change on the saved row, has it deleted behind the page, and confirms Replace, which the API answers with a 404. */
  async function replaceDeleted(page: Page, context: import('@playwright/test').BrowserContext) {
    await grantLocation(context)
    const store = await mockPickupLocations(page, SAVED)
    const methods: string[] = []
    page.on('request', (request) => isPickupCall(request.url()) && request.method() !== 'OPTIONS' && methods.push(request.method()))
    await openAs(page)
    await expect(section(page).getByRole('button', { name: /^Edit/ })).toBeVisible()
    store.remove()
    const dialog = await startChange(page)
    await dialog.getByRole('button', { name: 'Replace pickup location' }).click()
    await expect(page.getByText(REMOVED)).toBeVisible()
    await expect(toast(page)).toHaveCount(0)
    // The form stays open with the edit, and the page re-reads the list behind it.
    await expect(page.getByLabel('Contact name', { exact: true })).toHaveValue('Pedro Reyes')
    await expect.poll(() => methods).toEqual(['GET', 'PATCH', 'GET'])
    return { store, methods }
  }

  test('a 404 on replace keeps the form and the edit with a removed-elsewhere message, and Save again POSTs without a dialog', async ({ page, context }) => {
    const { store, methods } = await replaceDeleted(page, context)
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(toast(page)).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Replace the pickup location?' })).toHaveCount(0)
    expect(methods.filter((method) => method !== 'GET').at(-1)).toBe('POST')
    expect(store.row).toMatchObject({ contactName: 'Pedro Reyes' })
    await expect(section(page).getByRole('definition').filter({ hasText: 'Pedro Reyes' })).toBeVisible()
  })

  test('a 404 on replace, then Cancel, shows the empty state', async ({ page, context }) => {
    await replaceDeleted(page, context)
    await section(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(section(page).getByText(/No pickup location is set\./)).toBeVisible()
    await expect(section(page).getByRole('button', { name: 'Set pickup location' })).toBeVisible()
  })

  test('a 400 from the server is shown with the reason and a next step, and the form keeps its values', async ({ page, context }) => {
    await grantLocation(context)
    await mockPickupLocations(page, null)
    await failWith(page, 'POST', 400, { message: 'contactPhone must be a valid Philippine phone number', error: 'Bad Request' })
    await openAs(page)
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    await fillForm(page, { label: 'Main warehouse' })
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(page.getByText(/We couldn't save the pickup location\. The server said: contactPhone must be a valid Philippine phone number\. Fix it, then try Save pickup location again\./)).toBeVisible()
    await expect(toast(page)).toHaveCount(0)
    await expect(page.getByLabel('Contact name', { exact: true })).toHaveValue('Maria Santos')
    await expect(page.getByLabel('Phone number', { exact: true })).toHaveValue('9171234567')
    await expect(page.getByLabel('Label', { exact: false }).first()).toHaveValue('Main warehouse')
    await expect(page.getByRole('button', { name: 'Save pickup location' })).toBeEnabled()
  })

  test('a 429 on save asks the admin to try again shortly and keeps the form', async ({ page, context }) => {
    await grantLocation(context)
    await mockPickupLocations(page, null)
    await failWith(page, 'POST', 429, { message: 'Too Many Requests' })
    await openAs(page)
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    await fillForm(page)
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(page.getByText("We couldn't save the pickup location. Our servers are limiting requests right now. Try Save pickup location again shortly.")).toBeVisible()
    await expect(page.getByLabel('Contact name', { exact: true })).toHaveValue('Maria Santos')
  })

  test('a 429 on the read shows the limit message with a Retry that is held back', async ({ page }) => {
    await mockPickupLocations(page, SAVED)
    await failWith(page, 'GET', 429, { message: 'Too Many Requests' }, { 'retry-after': '30' })
    await openAs(page)
    await expect(section(page).getByText('Our servers are limiting requests right now. Try again shortly.')).toBeVisible({ timeout: 20_000 })
    await expect(section(page).getByRole('button', { name: /^Retry in \d+s$/ })).toBeDisabled()
  })

  test('a 403 on the read is explained without leaving the page', async ({ page }) => {
    await mockPickupLocations(page, SAVED)
    await failWith(page, 'GET', 403, { message: 'Forbidden resource' })
    await openAs(page)
    await expect(section(page).getByText("We couldn't load the pickup location.")).toBeVisible({ timeout: 20_000 })
    await expect(section(page).getByText(/Your account is not allowed to see this\. Sign in again, or ask an admin for access\./)).toBeVisible()
  })

  test('a 403 on save ends the session and sends the admin to sign in', async ({ page, context }) => {
    await grantLocation(context)
    await mockPickupLocations(page, null)
    await failWith(page, 'POST', 403, { message: 'Forbidden resource' })
    await openAs(page)
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    await fillForm(page)
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(page).toHaveURL(/\/login/)
    expect(await page.evaluate(() => localStorage.getItem('silhoufit-session'))).toBeNull()
  })

  test('confirming Replace sends one PATCH to the saved id with only the allowed keys, and shows the new Updated time', async ({ page, context }) => {
    await grantLocation(context)
    const store = await mockPickupLocations(page, SEEDED)
    await mockMakati(page)
    const writes: { method: string; path: string }[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.method() !== 'OPTIONS' && isPickupCall(request.url())) writes.push({ method: request.method(), path: new URL(request.url()).pathname })
    })
    await openAs(page)
    await expect(updated(page)).toContainText(TIME_12H)
    const before = await updated(page).innerText()

    const dialog = await startChange(page, { makati: true })
    // Cancel sends nothing.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    expect(writes).toEqual([])

    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Replace pickup location' }).dblclick()
    await expect(toast(page)).toBeVisible()
    await expect(section(page).getByRole('definition').filter({ hasText: 'Pedro Reyes, +639170000000' })).toBeVisible()

    expect(writes).toEqual([{ method: 'PATCH', path: `/pickup-locations/${SEEDED.id}` }])
    expect(store.bodies).toHaveLength(1)
    expect(Object.keys(store.bodies[0]).sort()).toEqual(ALLOWED_KEYS)
    await expect(updated(page)).toContainText(TIME_12H)
    expect(await updated(page).innerText()).not.toBe(before)
  })
})

test.describe('the seeded backend row', () => {
  test('renders in the summary, opens in Change without crashing, and never sends isDefault, country, id or updatedBy', async ({ page, context }) => {
    await grantLocation(context)
    const store = await mockPickupLocations(page, SEEDED)
    await mockMakati(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openAs(page)
    const summary = section(page).getByRole('definition')
    await expect(section(page).getByText('Main Dispatch Hub', { exact: true })).toBeVisible()
    await expect(summary.filter({ hasText: SEEDED_ADDRESS })).toBeVisible()
    await expect(summary.filter({ hasText: 'Silhoufit Dispatch Hub, +639170000000' })).toBeVisible()
    await expect(summary.filter({ hasText: '14.554700, 121.024400' })).toBeVisible()
    await expect(updated(page)).toContainText(TIME_12H)

    await section(page).getByRole('button', { name: /^Edit/ }).click()
    await expect(page.getByLabel('Contact name', { exact: true })).toHaveValue('Silhoufit Dispatch Hub')
    await expect(page.getByLabel('House No., Street Name', { exact: true })).toHaveValue('Ayala Center')
    await page.getByLabel('Contact name', { exact: true }).fill('Pedro Reyes')
    await pick(page, /^City or municipality/, 'City of Makati')
    await pick(page, /^Barangay/, 'San Lorenzo')
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await page.getByRole('dialog', { name: 'Replace the pickup location?' }).getByRole('button', { name: 'Replace pickup location' }).click()
    await expect(toast(page)).toBeVisible()

    const sent = Object.keys(store.bodies[0])
    for (const key of ['isDefault', 'country', 'id', 'updatedBy', 'createdAt', 'updatedAt']) expect(sent).not.toContain(key)
    expect(sent.sort()).toEqual(ALLOWED_KEYS)
    expect(store.bodies[0]).toMatchObject({ label: 'Main Dispatch Hub', contactPhone: '+639170000000', latitude: 14.5547, longitude: 121.0244 })
    expect(errors).toEqual([])
  })

  for (const width of [320, 390]) {
    test(`a very long seeded address has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      const long = apiPickupLocation({
        ...SEEDED,
        label: 'Main Dispatch Hub Main Dispatch Hub Makati Hub',
        streetAddress: 'Unit 1204 Ayala Center Tower Two, Ayala Avenue corner Paseo de Roxas, Legazpi Village',
        addressLine2: 'SuperLongBuildingNameNoSpaces1 Tower Two Unit 1204',
      })
      await mockPickupLocations(page, long)
      await mockMakati(page)
      await openAs(page)
      await expect(section(page).getByRole('definition').filter({ hasText: 'SuperLongBuildingNameNoSpaces1' })).toBeVisible()
      expect(await overflow(page)).toBe(0)
      await startChange(page, { makati: true })
      expect(await overflow(page)).toBe(0)
    })
  }
})

test.describe('who can save', () => {
  test('a superadmin saves the first location at /superadmin/pickup-location', async ({ page, context }) => {
    await grantLocation(context)
    const store = await mockPickupLocations(page, null)
    await openAs(page, SUPERADMIN, 'superadmin')
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    await fillForm(page)
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(toast(page)).toBeVisible()
    expect(store.row).toMatchObject({ contactName: 'Maria Santos' })
  })

  test('staff are redirected without any request to /pickup-locations', async ({ page }) => {
    await mockPickupLocations(page, SAVED)
    const calls: string[] = []
    page.on('request', (request) => isPickupCall(request.url()) && request.method() !== 'OPTIONS' && calls.push(request.method()))
    await signIn(page, STAFF, /\/staff$/)
    await page.goto('/admin/pickup-location')
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByText('That page is turned off for your role. Ask a superadmin if you need it.')).toBeVisible()
    expect(calls).toEqual([])
  })
})

test.describe('the summary cards', () => {
  const card = (page: Page) => page.getByRole('region', { name: 'Rider pin preview' })

  test('shows the label, rider contact with its note, coordinates and the footer note and button', async ({ page }) => {
    await mockPickupLocations(page, SEEDED)
    await openAs(page)
    await expect(section(page).getByText('Main Dispatch Hub', { exact: true })).toBeVisible()
    await expect(section(page).getByText('Shared with assigned Lalamove riders upon pickup arrival.')).toBeVisible()
    await expect(section(page).getByText(/Used for all new Lalamove rider bookings and checkout quotes\./)).toBeVisible()
    await expect(section(page).getByText('14.554700, 121.024400')).toHaveCSS('font-variant-numeric', /tabular-nums/)
    await expect(updated(page)).toContainText(TIME_12H)
  })

  test('the status pill shows only when a location is saved, with a muted Not set when empty', async ({ page }) => {
    await mockPickupLocations(page, SAVED)
    await openAs(page)
    await expect(page.getByText('Active for dispatch', { exact: true })).toBeVisible()
    await expect(page.getByText('Not set', { exact: true })).toHaveCount(0)
  })

  test('the status pill is replaced by Not set when nothing is saved', async ({ page }) => {
    await mockPickupLocations(page, null)
    await openAs(page)
    await expect(page.getByText('Not set', { exact: true })).toBeVisible()
    await expect(page.getByText('Active for dispatch', { exact: true })).toHaveCount(0)
    await expect(card(page)).toHaveCount(0)
  })

  test('the map card shows the pin, the label chip, the dispatch zone and an Open map link', async ({ page }) => {
    await mockPickupLocations(page, SEEDED)
    await openAs(page)
    await expect(card(page).locator('.leaflet-container')).toBeVisible()
    await expect(card(page).getByText('Main Dispatch Hub', { exact: true })).toBeVisible()
    const pin = card(page).getByRole('img', { name: 'Pickup pin at 14.554700, 121.024400' })
    const mapBox = (await card(page).locator('.leaflet-container').boundingBox())!
    const pinBox = (await pin.boundingBox())!
    // The map is centred on the saved coordinates and the pin's tip is that centre.
    expect(Math.abs(pinBox.x + pinBox.width / 2 - (mapBox.x + mapBox.width / 2))).toBeLessThanOrEqual(2)
    await expect(card(page).getByText('Makati City, Metro Manila', { exact: true })).toBeVisible()
    const link = card(page).getByRole('link', { name: /^Open map/ })
    await expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=14.5547&mlon=121.0244#map=17/14.5547/121.0244')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('the pin and its label stay on top of the map once the tiles have loaded', async ({ page }) => {
    // An opaque tile, so a map that covers the pin would hide it.
    const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#808080"/></svg>'
    await page.route('**/tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }))
    await mockPickupLocations(page, SEEDED)
    await openAs(page)
    await expect(card(page).locator('.leaflet-tile-loaded').first()).toBeAttached()
    // Leaflet's layers ignore the pointer, so a hit test cannot see them: compare what is painted with the element shown and hidden.
    // If the map covers it, hiding it changes nothing.
    const paintedWhenHidden = async (target: Locator) => {
      await target.scrollIntoViewIfNeeded()
      const clip = (await target.boundingBox())!
      const shown = await page.screenshot({ clip, animations: 'disabled' })
      await target.evaluate((el) => (el.style.visibility = 'hidden'))
      const hidden = await page.screenshot({ clip, animations: 'disabled' })
      await target.evaluate((el) => (el.style.visibility = ''))
      return !shown.equals(hidden)
    }
    // A CSS locator, because a hidden element drops out of role queries.
    const pin = card(page).locator('[aria-label^="Pickup pin at"]')
    await expect(pin).toHaveCSS('background-color', 'rgb(180, 35, 24)')
    expect(await paintedWhenHidden(pin)).toBe(true)
    expect(await paintedWhenHidden(card(page).getByText('Main Dispatch Hub', { exact: true }))).toBe(true)
  })

  test('the map is read-only: dragging it does not move it', async ({ page }) => {
    await mockPickupLocations(page, SAVED)
    await openAs(page)
    const map = card(page).locator('.leaflet-container')
    await expect(map).toBeVisible()
    const pane = card(page).locator('.leaflet-map-pane')
    const before = await pane.evaluate((el) => el.style.transform)
    const box = (await map.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 4 })
    await page.mouse.up()
    expect(await pane.evaluate((el) => el.style.transform)).toBe(before)
  })

  test('falls back to a tidy placeholder with the coordinates when the tiles fail', async ({ page }) => {
    await page.route('**/tile.openstreetmap.org/**', (route) => route.abort())
    await mockPickupLocations(page, SAVED)
    await openAs(page)
    await expect(card(page).getByText("The map couldn't load")).toBeVisible({ timeout: 20_000 })
    await expect(card(page).getByText('14.599500, 120.984200')).toBeVisible()
    await expect(card(page).locator('svg').first()).toBeVisible()
    await expect(card(page).getByRole('link', { name: /^Open map/ })).toBeVisible()
    expect(await overflow(page)).toBe(0)
  })

  test.describe('copy buttons', () => {
    test.beforeEach(async ({ context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    })

    for (const [name, text, message] of [
      ['Copy address', '12 Rizal Avenue, Barangay 176, City of Manila, NCR, 1000', 'Address copied'],
      ['Copy rider phone number', '+639171234567', 'Rider phone number copied'],
      ['Copy coordinates', '14.599500, 120.984200', 'Coordinates copied'],
    ]) {
      test(`${name} copies the value and confirms`, async ({ page }) => {
        await mockPickupLocations(page, SAVED)
        await openAs(page)
        const button = section(page).getByRole('button', { name })
        const size = (await button.boundingBox())!
        expect(size.width).toBeGreaterThanOrEqual(44)
        expect(size.height).toBeGreaterThanOrEqual(44)
        await button.click()
        await expect(page.getByText(message, { exact: true })).toBeVisible()
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text)
      })
    }

    test('says what to do when the browser blocks the clipboard', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } })
        document.execCommand = () => false
      })
      await mockPickupLocations(page, SAVED)
      await openAs(page)
      await section(page).getByRole('button', { name: 'Copy address' }).click()
      await expect(page.getByText(/Couldn't copy the address\. Your browser blocked clipboard access/)).toBeVisible()
    })

    test('the button is reachable and works from the keyboard', async ({ page }) => {
      await mockPickupLocations(page, SAVED)
      await openAs(page)
      const button = section(page).getByRole('button', { name: 'Copy coordinates' })
      await button.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByText('Coordinates copied', { exact: true })).toBeVisible()
    })
  })

  test('the skeleton and the loaded summary share their columns and stay within a line or two of height', async ({ page }) => {
    await mockPickupLocations(page, SAVED)
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(
      (url) => url.pathname === '/pickup-locations',
      async (route) => {
        await held
        return route.fallback()
      },
    )
    await signIn(page, ADMIN, /\/admin$/)
    await page.goto('/admin/pickup-location')
    const status = page.getByRole('status', { name: 'Loading the pickup location' })
    await expect(status).toBeVisible({ timeout: 20_000 })
    const cardsOf = (root: Locator) => root.locator(':scope > div > div, :scope > div > section')
    const skeleton = await cardsOf(status).evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map(({ x, width, height }) => ({ x, width, height })))
    release()
    await expect(section(page).getByRole('button', { name: /^Edit/ })).toBeVisible()
    const loaded = await page.getByRole('region', { name: /^(Pickup address|Rider pin preview)$/ }).evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map(({ x, width, height }) => ({ x, width, height })))
    expect(skeleton).toHaveLength(2)
    expect(loaded).toHaveLength(2)
    for (const [i, box] of loaded.entries()) {
      expect(Math.abs(box.x - skeleton[i].x)).toBeLessThanOrEqual(1)
      expect(Math.abs(box.width - skeleton[i].width)).toBeLessThanOrEqual(1)
      expect(Math.abs(box.height - skeleton[i].height)).toBeLessThanOrEqual(56)
    }
  })

  for (const width of [320, 390, 768, 1280, 1920]) {
    test(`has no horizontal overflow at ${width}px with a very long address`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await mockPickupLocations(
        page,
        apiPickupLocation({
          ...SEEDED,
          label: 'Main Dispatch Hub Main Dispatch Hub Makati Hub',
          contactName: 'Silhoufit Dispatch Hub Operations Desk',
          streetAddress: 'Unit 1204 Ayala Center Tower Two, Ayala Avenue corner Paseo de Roxas, Legazpi Village',
          addressLine2: 'SuperLongBuildingNameNoSpaces1 Tower Two Unit 1204',
        }),
      )
      await openAs(page)
      await expect(section(page).getByText(/SuperLongBuildingNameNoSpaces1/)).toBeVisible()
      await expect(card(page).locator('.leaflet-container')).toBeVisible()
      expect(await overflow(page)).toBe(0)
      // Every copy button stays inside its card.
      for (const button of await section(page).getByRole('button', { name: /^Copy / }).all()) {
        const box = (await button.boundingBox())!
        const cardBox = (await section(page).boundingBox())!
        expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)
      }
    })
  }

  test('stacks the map under the details below the desktop breakpoint and puts it beside them from lg', async ({ page }) => {
    await mockPickupLocations(page, SAVED)
    await page.setViewportSize({ width: 768, height: 900 })
    await openAs(page)
    const stacked = { details: (await section(page).boundingBox())!, map: (await card(page).boundingBox())! }
    expect(stacked.map.y).toBeGreaterThanOrEqual(stacked.details.y + stacked.details.height)
    await page.setViewportSize({ width: 1280, height: 900 })
    const wide = { details: (await section(page).boundingBox())!, map: (await card(page).boundingBox())! }
    expect(wide.map.x).toBeGreaterThan(wide.details.x + wide.details.width - 1)
    expect(Math.abs(wide.map.height - wide.details.height)).toBeLessThanOrEqual(1)
    expect(wide.details.width + wide.map.width).toBeLessThanOrEqual(1152 + 16)
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`renders in ${scheme} mode with readable text and a visible card`, async ({ page }) => {
      await mockPickupLocations(page, SAVED)
      const lum = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3
      await page.emulateMedia({ colorScheme: scheme })
      await openAs(page)
      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /^(?!.*dark)/)
      await expect(card(page).locator('.leaflet-container')).toBeVisible()
      const { bg, text, caption } = await section(page).evaluate((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        text: getComputedStyle(el.querySelector('dd')!).color,
        caption: getComputedStyle(el.querySelector('dt')!).color,
      }))
      if (scheme === 'dark') {
        expect(lum(bg)).toBeLessThan(110)
        expect(lum(text)).toBeGreaterThan(150)
        expect(lum(caption)).toBeGreaterThan(110)
      } else {
        expect(lum(bg)).toBeGreaterThan(200)
        expect(lum(text)).toBeLessThan(90)
        expect(lum(caption)).toBeLessThan(140)
      }
    })
  }
})

// Several locations: the default first, the others as saved spares an admin can make the default, edit or delete.
// The stand-in API follows the backend's rules (tests/shared/pickupLocations.ts), so what the page shows after a write is what the API would answer.
test.describe('several locations', () => {
  const SPARE = apiPickupLocation({
    id: '5a8c1e47-9d02-4b6f-b3a1-0c7d2e9f4a18',
    label: 'Makati hub',
    contactName: 'Pedro Reyes',
    contactPhone: '+639175550000',
    cityMunicipality: 'Makati City',
    province: 'Metro Manila',
    barangay: 'San Lorenzo',
    streetAddress: 'Ayala Center',
    postalCode: '1226',
    latitude: 14.5547,
    longitude: 121.0244,
    isDefault: false,
    createdAt: '2026-11-19T09:00:00.000Z',
    updatedAt: '2026-11-19T09:00:00.000Z',
  })
  const spare = (page: Page) => page.getByRole('region', { name: 'Makati hub' })
  const writes = (page: Page) => {
    const calls: { method: string; path: string; body: unknown }[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.method() !== 'OPTIONS' && isPickupCall(request.url())) {
        calls.push({ method: request.method(), path: new URL(request.url()).pathname, body: request.postDataJSON() })
      }
    })
    return calls
  }

  test('lists the default first, with a Default pill and no Delete, and the spare with its three actions', async ({ page }) => {
    await mockPickupLocations(page, [SPARE, SAVED])
    await openAs(page)
    const main = section(page)
    await expect(main.getByText('Main warehouse', { exact: true })).toBeVisible()
    await expect(main.getByText('Default', { exact: true })).toBeVisible()
    await expect(main.getByText(/Used for all new Lalamove rider bookings and checkout quotes\./)).toBeVisible()
    await expect(main.getByText('Set another location as default to delete this one.')).toBeVisible()
    await expect(main.getByRole('button', { name: /^Edit/ })).toBeVisible()
    await expect(main.getByRole('button', { name: /^Delete/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 2, name: 'Other pickup locations' })).toBeVisible()
    await expect(spare(page).getByText('Default', { exact: true })).toHaveCount(0)
    await expect(spare(page).getByText('14.554700, 121.024400')).toHaveCSS('font-variant-numeric', /tabular-nums/)
    for (const name of ['Set as default Makati hub', 'Edit Makati hub', 'Delete Makati hub']) {
      const box = (await spare(page).getByRole('button', { name }).boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    // The default card is first on the page.
    expect((await main.boundingBox())!.y).toBeLessThan((await spare(page).boundingBox())!.y)
  })

  test('adds a second location as a spare unless it is made the default', async ({ page, context }) => {
    await grantLocation(context)
    const store = await mockPickupLocations(page, SAVED)
    await openAs(page)
    await page.getByRole('button', { name: 'Add pickup location' }).click()
    const box = page.getByRole('checkbox', { name: 'Make this the default location' })
    await expect(box).not.toBeChecked()
    await expect(page.getByText(/Leave this off to keep it saved as a spare/)).toBeVisible()
    await fillForm(page, { label: 'Quezon hub' })
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(page.getByText('Pickup location added', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Quezon hub' })).toBeVisible()
    await expect(section(page).getByText('Main warehouse', { exact: true })).toBeVisible()
    expect(store.bodies[0]).not.toHaveProperty('isDefault')
    expect(store.rows.map((row) => [row.label, row.isDefault])).toEqual([['Main warehouse', true], ['Quezon hub', false]])
    await expect(page.getByRole('heading', { level: 2, name: 'Pickup address' })).toBeFocused()
  })

  test('makes the new location the default when the box is ticked, and the old one becomes a spare', async ({ page, context }) => {
    await grantLocation(context)
    const store = await mockPickupLocations(page, SAVED)
    await openAs(page)
    await page.getByRole('button', { name: 'Add pickup location' }).click()
    await fillForm(page, { label: 'Quezon hub' })
    await page.getByRole('checkbox', { name: 'Make this the default location' }).setChecked(true, { force: true })
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(page.getByText('Pickup location added', { exact: true })).toBeVisible()
    expect(store.bodies[0]).toMatchObject({ isDefault: true })
    await expect(section(page).getByText('Quezon hub', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Main warehouse' })).toBeVisible()
  })

  test('the first location is the default automatically, and the form says so', async ({ page, context }) => {
    await grantLocation(context)
    const store = await mockPickupLocations(page, null)
    await openAs(page)
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    const box = page.getByRole('checkbox', { name: 'Make this the default location' })
    await expect(box).toBeChecked()
    await expect(box).toBeDisabled()
    await expect(page.getByText('Your first pickup location is always the default.')).toBeVisible()
    await fillForm(page)
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(toast(page)).toBeVisible()
    expect(store.rows).toHaveLength(1)
    expect(store.row?.isDefault).toBe(true)
  })

  test('Set as default asks first with Now and New; Cancel sends nothing, Escape too, and the button keeps focus', async ({ page }) => {
    await mockPickupLocations(page, [SAVED, SPARE])
    const calls = writes(page)
    await openAs(page)
    const opener = spare(page).getByRole('button', { name: 'Set as default Makati hub' })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: 'Change the default pickup location?' })
    await expect(dialog.getByText('Are you sure?')).toBeVisible()
    await expect(dialog.getByText('Now', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Main warehouse')).toBeVisible()
    await expect(dialog.getByText('New', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Makati hub')).toBeVisible()
    await expect(dialog.getByText(/Riders are booked from the new location for all orders dispatched from now on/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    await opener.click()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    expect(calls).toEqual([])
  })

  test('confirming Set as default swaps the two, toasts, and moves focus to the heading', async ({ page }) => {
    const store = await mockPickupLocations(page, [SAVED, SPARE])
    const calls = writes(page)
    await openAs(page)
    await spare(page).getByRole('button', { name: 'Set as default Makati hub' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Set as default', exact: true }).click()
    await expect(page.getByText('Default pickup location changed', { exact: true })).toBeVisible()
    expect(calls).toEqual([{ method: 'PATCH', path: `/pickup-locations/${SPARE.id}`, body: { isDefault: true } }])
    expect(store.row?.id).toBe(SPARE.id)
    await expect(section(page).getByText('Makati hub', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Main warehouse' }).getByRole('button', { name: 'Delete Main warehouse' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Pickup address' })).toBeFocused()
  })

  test('Edit on a spare saves without the Replace dialog', async ({ page, context }) => {
    await grantLocation(context)
    const store = await mockPickupLocations(page, [SAVED, SPARE])
    await mockMakati(page)
    await openAs(page)
    await spare(page).getByRole('button', { name: 'Edit Makati hub' }).click()
    await expect(page.getByLabel('Contact name', { exact: true })).toHaveValue('Pedro Reyes')
    await page.getByLabel('Contact name', { exact: true }).fill('Ana Cruz')
    await pick(page, /^City or municipality/, 'City of Makati')
    await pick(page, /^Barangay/, 'San Lorenzo')
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(page.getByText('Pickup location saved', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(store.rows.find((row) => row.id === SPARE.id)).toMatchObject({ contactName: 'Ana Cruz', isDefault: false })
  })

  test('Delete asks first; Cancel sends nothing, confirming deletes only that location and toasts', async ({ page }) => {
    const store = await mockPickupLocations(page, [SAVED, SPARE])
    const calls = writes(page)
    await openAs(page)
    await spare(page).getByRole('button', { name: 'Delete Makati hub' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete this pickup location?' })
    await expect(dialog.getByText('Are you sure?')).toBeVisible()
    await expect(dialog.getByText(/Orders already shipped keep the pickup details they left from/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    expect(calls).toEqual([])

    await spare(page).getByRole('button', { name: 'Delete Makati hub' }).click()
    await dialog.getByRole('button', { name: 'Delete pickup location' }).dblclick()
    await expect(page.getByText('Pickup location deleted', { exact: true })).toBeVisible()
    expect(calls).toEqual([{ method: 'DELETE', path: `/pickup-locations/${SPARE.id}`, body: null }])
    expect(store.rows.map((row) => row.id)).toEqual([SAVED.id])
    await expect(spare(page)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Other pickup locations' })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 2, name: 'Pickup address' })).toBeFocused()
    await expect(section(page).getByRole('button', { name: /^Delete/ })).toHaveCount(0)
  })

  test('a 400 for the last location says why and what to do, and keeps the list', async ({ page }) => {
    await mockPickupLocations(page, [SAVED, SPARE])
    await page.route(
      (url) => url.pathname.startsWith('/pickup-locations/'),
      (route) => (route.request().method() === 'DELETE' ? route.fulfill({ status: 400, json: { message: 'Cannot delete the only pickup location' }, headers: CORS }) : route.fallback()),
    )
    await openAs(page)
    await spare(page).getByRole('button', { name: 'Delete Makati hub' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete pickup location' }).click()
    await expect(page.getByText(/We couldn't delete the pickup location\. It is the only pickup location, and riders need somewhere to collect orders\. Add another one first\./)).toBeVisible()
    await expect(page.getByText('Pickup location deleted')).toHaveCount(0)
    await expect(spare(page)).toBeVisible()
  })

  test('a 404 says it was deleted elsewhere, reloads the list, and the card disappears', async ({ page }) => {
    const store = await mockPickupLocations(page, [SAVED, SPARE])
    await openAs(page)
    await expect(spare(page)).toBeVisible()
    store.remove(SPARE.id)
    await spare(page).getByRole('button', { name: 'Set as default Makati hub' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Set as default', exact: true }).click()
    await expect(page.getByText(/We couldn't change the default pickup location\. That pickup location no longer exists, probably deleted on another device\. We reloaded the list\./)).toBeVisible()
    await expect(spare(page)).toHaveCount(0)
    await expect(section(page).getByText('Main warehouse', { exact: true })).toBeVisible()
  })

  test('a 500 on the list shows the error with Retry, then both locations', async ({ page }) => {
    await mockPickupLocations(page, [SAVED, SPARE])
    let fail = true
    await page.route(
      (url) => url.pathname === '/pickup-locations',
      (route) => (fail && route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { message: 'boom' }, headers: CORS }) : route.fallback()),
    )
    await openAs(page)
    await expect(page.getByText("We couldn't load the pickup location.")).toBeVisible({ timeout: 20_000 })
    fail = false
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(spare(page)).toBeVisible()
  })

  test('the keyboard reaches Delete, Enter opens the dialog, Escape closes it and focus returns to Delete', async ({ page }) => {
    await mockPickupLocations(page, [SAVED, SPARE])
    await openAs(page)
    const del = spare(page).getByRole('button', { name: 'Delete Makati hub' })
    await del.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Delete this pickup location?' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(del).toBeFocused()
  })

  test('Cancel on the add form returns focus to the Add button', async ({ page }) => {
    await mockPickupLocations(page, SAVED)
    await openAs(page)
    await page.getByRole('button', { name: 'Add pickup location' }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Add pickup location' })).toBeFocused()
  })

  test('the add form uses the page width: a wide card with the contact fields side by side on a large screen, one column on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockPickupLocations(page, SAVED)
    await openAs(page)
    await page.getByRole('button', { name: 'Add pickup location' }).click()
    const name = page.getByLabel('Contact name', { exact: true })
    const phone = page.getByLabel('Phone number', { exact: true })
    await expect(name).toBeVisible()
    const form = (await page.locator('form[aria-busy]').boundingBox())!
    expect(form.width).toBeGreaterThan(800) // it was 576px wide before the card was widened
    const [a, b] = [(await name.boundingBox())!, (await phone.boundingBox())!]
    expect(Math.abs(a.y - b.y)).toBeLessThan(4) // same row
    expect(b.x).toBeGreaterThan(a.x + a.width - 1)
    expect(await overflow(page)).toBe(0)

    await page.setViewportSize({ width: 320, height: 800 })
    const [c, d] = [(await name.boundingBox())!, (await phone.boundingBox())!]
    expect(d.y).toBeGreaterThan(c.y + c.height - 1) // stacked
    expect(await overflow(page)).toBe(0)
  })

  test('pressing a dropdown field does not bounce it, while an ordinary button still does', async ({ page }) => {
    await page.addInitScript(() => {
      const scaled: string[] = []
      ;(window as unknown as { __scaled: string[] }).__scaled = scaled
      const animate = Element.prototype.animate
      Element.prototype.animate = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
        if (JSON.stringify(keyframes).includes('"scale"')) scaled.push(this.getAttribute('role') ?? this.tagName.toLowerCase())
        return animate.call(this, keyframes, options)
      }
    })
    await mockPickupLocations(page, SAVED)
    await openAs(page)
    await page.getByRole('button', { name: 'Add pickup location' }).click()
    const dropdown = page.locator('button[aria-haspopup="listbox"]').first() // the Region picker
    await expect(dropdown).toBeVisible()
    const scaledNow = () => page.evaluate(() => (window as unknown as { __scaled: string[] }).__scaled.slice())
    const press = async (target: ReturnType<Page['getByRole']>) => {
      await target.scrollIntoViewIfNeeded()
      const box = (await target.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(0, 0) // released elsewhere: no click
      await page.mouse.up()
    }
    await page.evaluate(() => ((window as unknown as { __scaled: string[] }).__scaled.length = 0)) // the Add click above bounced, as buttons do
    await press(dropdown)
    expect(await scaledNow()).toEqual([])
    await press(page.getByRole('button', { name: 'Cancel', exact: true }))
    expect((await scaledNow()).length).toBeGreaterThan(0)
  })

  test('the empty state has no Add button, only Set pickup location', async ({ page }) => {
    await mockPickupLocations(page, null)
    await openAs(page)
    await expect(section(page).getByRole('button', { name: 'Set pickup location' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add pickup location' })).toHaveCount(0)
  })

  for (const width of [320, 1280]) {
    test(`has no horizontal overflow at ${width}px with several locations, the add form and both dialogs`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      const long = apiPickupLocation({ ...SPARE, label: 'Makati hub Makati hub Makati hub Makati hub', streetAddress: 'SuperLongBuildingNameNoSpaces1 Tower Two Unit 1204' })
      await mockPickupLocations(page, [SAVED, long, apiPickupLocation({ ...SPARE, id: 'c3', label: 'Pasig hub', createdAt: '2026-11-19T10:00:00.000Z' })])
      await openAs(page)
      await expect(page.getByRole('region', { name: 'Pasig hub' })).toBeVisible()
      expect(await overflow(page)).toBe(0)
      await page.getByRole('region', { name: 'Pasig hub' }).getByRole('button', { name: 'Set as default Pasig hub' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await overflow(page)).toBe(0)
      await page.keyboard.press('Escape')
      await page.getByRole('region', { name: 'Pasig hub' }).getByRole('button', { name: 'Delete Pasig hub' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await overflow(page)).toBe(0)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Add pickup location' }).click()
      await expect(page.getByLabel('Contact name', { exact: true })).toBeVisible()
      expect(await overflow(page)).toBe(0)
    })
  }

  test('renders the spare card in dark mode with readable text', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await mockPickupLocations(page, [SAVED, SPARE])
    await openAs(page)
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(spare(page)).toBeVisible()
    const lum = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3
    const { bg, text } = await spare(page).evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, text: getComputedStyle(el.querySelector('dd')!).color }))
    expect(lum(bg)).toBeLessThan(110)
    expect(lum(text)).toBeGreaterThan(150)
  })

  test('staff cannot reach the page and send no request to /pickup-locations', async ({ page }) => {
    await mockPickupLocations(page, [SAVED, SPARE])
    const calls: string[] = []
    page.on('request', (request) => isPickupCall(request.url()) && request.method() !== 'OPTIONS' && calls.push(request.method()))
    await signIn(page, STAFF, /\/staff$/)
    await page.goto('/admin/pickup-location')
    await expect(page).toHaveURL(/\/staff$/)
    expect(calls).toEqual([])
  })
})
