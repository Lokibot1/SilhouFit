import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { mockPsgc } from '../shared/psgc'
import manila from '../fixtures/nominatim/manila.json' with { type: 'json' }

// /admin/pickup-location and /superadmin/pickup-location: where Lalamove riders collect orders. While PICKUP_SAMPLE_DATA is on the location is kept in
// localStorage 'silhoufit.pickup-location.v1' (400ms simulated delay) and the page carries a Sample data badge. The address form and map are the
// customer ones, so PSGC, Nominatim and the map tiles are stubbed as in tests/onboarding/address.spec.ts. Sign-in is the dev-only simulated one.
// Permissions live in localStorage 'silhoufit.permissions.v1'. Runs in the desktop and mobile projects.

const STAFF = { email: 'sam.reyes@silhoufit.dev', password: 'Staff@12345' }
const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }
const PICKUP_KEY = 'silhoufit.pickup-location.v1'
const PERMISSIONS_KEY = 'silhoufit.permissions.v1'
const CORS = { 'access-control-allow-origin': '*' }
const TILE = 'tests/fixtures/tiles/1x1.png'

const SAVED = {
  label: 'Main warehouse',
  contactName: 'Maria Santos',
  contactPhone: '+639171234567',
  region: 'NCR',
  province: null,
  cityMunicipality: 'City of Manila',
  barangay: 'Barangay 176',
  streetAddress: '12 Rizal Avenue',
  addressLine2: null,
  postalCode: '1000',
  latitude: 14.5995,
  longitude: 120.9842,
  updatedAt: '2026-11-18T14:05:00.000Z',
  updatedBy: { id: 'sample', fullName: 'Admin User' },
}

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

/** Stores a value for a key before the next page loads, but only if the key is empty so a later save survives a reload. */
async function seed(page: Page, key: string, value: string) {
  await page.addInitScript(([k, v]) => localStorage.getItem(k) === null && localStorage.setItem(k, v), [key, value])
}

async function openAs(page: Page, who = ADMIN, area: 'admin' | 'superadmin' = 'admin') {
  await signIn(page, who, new RegExp(`/${area}$`))
  await page.goto(`/${area}/pickup-location`)
  await expect(page.getByRole('heading', { level: 1, name: 'Pickup location' })).toBeVisible({ timeout: 20_000 })
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), PICKUP_KEY)
const section = (page: Page) => page.getByRole('region', { name: 'Pickup address' })
const toast = (page: Page) => page.getByText('Pickup location saved', { exact: true })

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
    await grantLocation(context)
    await openAs(page)
    await expect(section(page).getByText(/No pickup location is saved here yet/)).toBeVisible()
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    // Not the signed-in admin's name: the contact is whoever hands the parcels over.
    await expect(page.getByLabel('Contact name', { exact: true })).toHaveValue('')

    await fillForm(page, { label: 'Main warehouse' })
    await expect(page.getByRole('button', { name: /^Region/ })).toContainText('NCR')
    await expect(page.getByLabel('House No., Street Name', { exact: true })).toHaveValue('718 P. Paterno Street')
    await page.getByRole('button', { name: 'Save pickup location' }).click()

    await expect(toast(page)).toBeVisible()
    const summary = section(page).getByRole('definition')
    await expect(summary.filter({ hasText: 'Main warehouse' })).toBeVisible()
    await expect(summary.filter({ hasText: 'Maria Santos, +639171234567' })).toBeVisible()
    await expect(summary.filter({ hasText: /^\d{2}\.\d{6}, \d{2,3}\.\d{6}$/ })).toBeVisible()
    await expect(section(page).getByText(/718 P\. Paterno Street.*Barangay 176.*City of Manila.*NCR/)).toBeVisible()
    await expect(section(page).getByText(/\b\d{1,2}:\d{2}\s?[AP]M\b/i)).toBeVisible()
    await expect(section(page).getByRole('button', { name: 'Change pickup location' })).toBeVisible()
    // The heading takes focus after a save.
    await expect(page.getByRole('heading', { level: 2, name: 'Pickup address' })).toBeFocused()

    const saved = JSON.parse((await stored(page))!)
    expect(saved).toMatchObject({ contactName: 'Maria Santos', contactPhone: '+639171234567', region: 'NCR', cityMunicipality: 'City of Manila', label: 'Main warehouse' })
    expect(typeof saved.latitude).toBe('number')
    expect(typeof saved.longitude).toBe('number')
    expect(await overflow(page)).toBe(0)
  })

  test('is still there after a reload', async ({ page, context }) => {
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
    await openAs(page)
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    await page.getByRole('button', { name: 'Save pickup location' }).click()
    await expect(page.getByText('Pin the pickup spot on the map so riders can find it.')).toBeVisible()
    await expect(page.getByText('Choose your region.')).toBeVisible()
    expect(await stored(page)).toBeNull()
  })

  test('uses the pickup wording on the map and says plainly when location is blocked', async ({ page }) => {
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
    expect(JSON.parse((await stored(page))!)).toMatchObject({ contactName: 'Juan Dela Cruz' })
  })

  test('Cancel leaves the empty state as it was', async ({ page }) => {
    await openAs(page)
    await section(page).getByRole('button', { name: 'Set pickup location' }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(section(page).getByRole('button', { name: 'Set pickup location' })).toBeFocused()
    expect(await stored(page)).toBeNull()
  })
})

test.describe('replacing a saved location', () => {
  test.beforeEach(async ({ page, context }) => {
    await grantLocation(context)
    await seed(page, PICKUP_KEY, JSON.stringify(SAVED))
  })

  async function startReplace(page: Page) {
    await openAs(page)
    await expect(section(page).getByRole('definition').filter({ hasText: 'Maria Santos, +639171234567' })).toBeVisible()
    await expect(section(page).getByText('12 Rizal Avenue, Barangay 176, City of Manila, NCR, 1000')).toBeVisible()
    await section(page).getByRole('button', { name: 'Change pickup location' }).click()
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
    expect(JSON.parse((await stored(page))!).contactName).toBe('Maria Santos')
    await expect(toast(page)).toHaveCount(0)
  })

  test('Escape closes the dialog like Cancel', async ({ page }) => {
    const dialog = await startReplace(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(JSON.parse((await stored(page))!).contactName).toBe('Maria Santos')
  })

  test('Replace pickup location saves the new one and shows it, with the toast', async ({ page }) => {
    const dialog = await startReplace(page)
    await dialog.getByRole('button', { name: 'Replace pickup location' }).click()
    await expect(toast(page)).toBeVisible()
    await expect(section(page).getByRole('definition').filter({ hasText: 'Pedro Reyes, +639171234567' })).toBeVisible()
    expect(JSON.parse((await stored(page))!).contactName).toBe('Pedro Reyes')
    await page.reload()
    await expect(section(page).getByRole('definition').filter({ hasText: 'Pedro Reyes' })).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('stored data', () => {
  test('a corrupt entry is treated as nothing saved', async ({ page }) => {
    await seed(page, PICKUP_KEY, '{not json')
    await openAs(page)
    await expect(section(page).getByRole('button', { name: 'Set pickup location' })).toBeVisible()
  })

  test('an entry with the wrong shape is treated as nothing saved', async ({ page }) => {
    await seed(page, PICKUP_KEY, JSON.stringify({ ...SAVED, latitude: 'north' }))
    await openAs(page)
    await expect(section(page).getByRole('button', { name: 'Set pickup location' })).toBeVisible()
  })

  test('shows a loading status while it reads', async ({ page }) => {
    await signIn(page, ADMIN, /\/admin$/)
    // The 400ms simulated read is too short to catch reliably, so it is stretched for this page load only.
    await page.addInitScript(() => {
      const native = window.setTimeout.bind(window)
      window.setTimeout = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => native(fn, ms === 400 ? 4000 : ms, ...rest)) as typeof window.setTimeout
    })
    await page.goto('/admin/pickup-location')
    await expect(page.getByRole('status', { name: 'Loading the pickup location' })).toBeVisible()
    await expect(section(page).getByRole('button', { name: 'Set pickup location' })).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('page chrome', () => {
  test('says Sample data once, next to the title', async ({ page }) => {
    await openAs(page)
    await expect(page.getByText('Sample data', { exact: true })).toHaveCount(1)
    await expect(page.getByText('Sample data', { exact: true })).toBeVisible()
  })

  test('has a unique title and a 150 to 160 character meta description', async ({ page }) => {
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
    await seed(page, PICKUP_KEY, JSON.stringify(SAVED))
    await openAs(page)
    await expect(section(page).getByRole('button', { name: 'Change pickup location' })).toBeVisible()
    await section(page).getByRole('button', { name: 'Change pickup location' }).click()
    await expect(page.getByLabel('Contact name', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })

  for (const width of [320, 640, 768, 1024, 1280, 1920]) {
    test(`has no horizontal overflow at ${width}px, empty, saved, editing and confirming`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await seed(page, PICKUP_KEY, JSON.stringify(SAVED))
      await openAs(page)
      await expect(section(page).getByRole('button', { name: 'Change pickup location' })).toBeVisible()
      expect(await overflow(page)).toBe(0)
      await section(page).getByRole('button', { name: 'Change pickup location' }).click()
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
    await openAs(page)
    await expect(section(page).getByRole('button', { name: 'Set pickup location' })).toBeVisible()
    expect(await overflow(page)).toBe(0)
  })

  test('renders in dark mode with readable text', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await seed(page, PICKUP_KEY, JSON.stringify(SAVED))
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
    await openAs(page, ADMIN, 'admin')
    const link = (await nav(page)).getByRole('link', { name: 'Pickup Location' })
    await expect(link).toHaveAttribute('aria-current', 'page')
  })

  test('a superadmin reaches it at /superadmin/pickup-location, with the nav item highlighted', async ({ page }) => {
    await openAs(page, SUPERADMIN, 'superadmin')
    await expect(page).toHaveURL(/\/superadmin\/pickup-location$/)
    const link = (await nav(page)).getByRole('link', { name: 'Pickup Location' })
    await expect(link).toHaveAttribute('aria-current', 'page')
  })

  test('staff never see the nav item and are sent back to their dashboard, even with a stored grant', async ({ page }) => {
    await seed(page, PERMISSIONS_KEY, JSON.stringify({ staff: ['inventory', 'pickup-location'] }))
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
