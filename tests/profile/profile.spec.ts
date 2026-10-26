import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { ADDRESS, address } from '../fixtures/addresses'
import { mockAddresses } from '../shared/addresses'
import { mockPsgc } from '../shared/psgc'
import { DEMO, mockAuth } from '../shared/session'
import { DEVICE_MATRIX } from '../shared/viewports'

// Supabase Auth and /users/me are mocked (see mockAuth). Each test signs in through the real form first.
test.beforeEach(async ({ page }) => {
  await mockAuth(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

test('signing in without a next lands on the profile page with the user data', async ({ page }) => {
  await signIn(page)
  await expect(page).toHaveTitle('Your profile — SilhouFit')
  const heading = page.getByRole('heading', { level: 1, name: 'Demo Shopper' })
  await expect(heading).toBeVisible()
  await expect(heading).toBeFocused()
  await expect(page.getByText(DEMO.email, { exact: true })).toBeVisible()
  await expect(page.getByText('January 15, 2026')).toBeVisible()
})

test('shows the error card for a 500 and loads the profile on Try again', async ({ page }) => {
  await signIn(page)
  let calls = 0
  await page.route('**/users/me', (route) => {
    calls += 1
    return calls === 1 ? route.fulfill({ status: 500, json: {}, headers: CORS }) : route.fallback()
  })
  await page.goto('/profile')

  await expect(page.getByRole('alert')).toContainText("We couldn't load your profile")
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Demo Shopper' })).toBeVisible()
})

test('sends the user to sign in, returning to the profile, when the token is rejected', async ({ page }) => {
  await signIn(page)
  await page.route('**/users/me', (route) => route.fulfill({ status: 401, json: {}, headers: CORS }))
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/)
})

test('Sign out ends at the login page, and the account menu does the same', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await signIn(page)
  await page.getByRole('button', { name: 'Account, Demo Shopper' }).click()
  await page.getByRole('group', { name: 'Account' }).getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('sends a signed-out visitor to sign in first', async ({ page }) => {
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/)
})

for (const { name, width, height } of DEVICE_MATRIX) {
  test(`has no horizontal scroll at ${name} (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await signIn(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Demo Shopper' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

for (const width of [320, 1280]) {
  test(`the skeleton and the loaded card are the same height at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signIn(page)

    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/users/me', async (route) => {
      await gate
      await route.fallback()
    })
    await page.goto('/profile')

    const skeleton = page.getByRole('status', { name: 'Loading your profile' })
    await expect(skeleton).toBeVisible()
    const skeletonHeight = (await skeleton.boundingBox())!.height

    release()
    const card = page.getByRole('region', { name: 'Your profile' })
    await expect(card).toBeVisible()
    const loadedHeight = (await card.boundingBox())!.height
    expect(Math.abs(loadedHeight - skeletonHeight)).toBeLessThanOrEqual(1)
  })
}

// Edit profile: GET and PATCH on /users/me are served from one in-memory profile so a save is read back.
const PROFILE = {
  id: 'user-1',
  email: DEMO.email,
  role: 'customer',
  firstName: 'Demo',
  middleName: null,
  lastName: 'Shopper',
  suffix: null,
  birthday: '1999-05-20',
  gender: 'female',
  avatarUrl: null,
  createdAt: '2026-01-15T08:30:00.000Z',
  updatedAt: '2026-01-15T08:30:00.000Z',
}

async function mockProfile(page: Page, { patchStatus = 200, patchBody }: { patchStatus?: number; patchBody?: object } = {}) {
  const patches: Record<string, unknown>[] = []
  let current: Record<string, unknown> = { ...PROFILE, fullName: 'Demo Shopper' }
  await page.route('**/users/me', async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (method === 'PATCH') {
      patches.push(route.request().postDataJSON())
      if (patchStatus !== 200) return route.fulfill({ status: patchStatus, json: patchBody ?? {}, headers: CORS })
      current = { ...current, ...patches.at(-1) }
      current.fullName = [current.firstName, current.middleName, current.lastName].filter(Boolean).join(' ')
      return route.fulfill({ json: current, headers: CORS })
    }
    return route.fulfill({ json: current, headers: CORS })
  })
  return patches
}

async function openEditor(page: Page) {
  await signIn(page)
  await page.getByRole('button', { name: 'Edit profile' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit your profile' })
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe('edit profile', () => {
  test('opens pre-filled with the saved details and Save disabled', async ({ page }) => {
    await mockProfile(page)
    const dialog = await openEditor(page)
    await expect(dialog.getByLabel('First name', { exact: true })).toHaveValue('Demo')
    await expect(dialog.getByLabel('Middle name (optional)')).toHaveValue('')
    await expect(dialog.getByLabel('Last name', { exact: true })).toHaveValue('Shopper')
    await expect(dialog.getByLabel('Birthday (optional)')).toHaveValue('1999-05-20')
    await expect(dialog.getByRole('combobox', { name: 'Gender' })).toContainText('Female')
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  test('rejects digits in a name inline and blocks the save', async ({ page }) => {
    const patches = await mockProfile(page)
    const dialog = await openEditor(page)
    const first = dialog.getByLabel('First name', { exact: true })
    await first.fill('Demo2')
    await first.blur()
    await expect(dialog.getByText('First name can only contain letters, spaces, hyphens and apostrophes.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(first).toBeFocused()
    expect(patches).toHaveLength(0)
  })

  test('rejects emoji in a name and the suffix inline and blocks the save', async ({ page }) => {
    const patches = await mockProfile(page)
    const dialog = await openEditor(page)
    const first = dialog.getByLabel('First name', { exact: true })
    await first.fill('Demo😀')
    await first.blur()
    await expect(dialog.getByText("Emoji aren't allowed in this field.")).toBeVisible()
    await dialog.getByRole('textbox', { name: 'Suffix (optional)' }).fill('Jr😀')
    await dialog.getByRole('textbox', { name: 'Suffix (optional)' }).blur()
    await expect(dialog.getByText("Emoji aren't allowed in this field.")).toHaveCount(2)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    expect(patches).toHaveLength(0)
  })

  test('the gender select is at least 44px tall', async ({ page }) => {
    const dialog = await openEditor(page)
    // The dialog scales in, so measure once it has settled.
    await expect.poll(async () => (await dialog.getByRole('combobox', { name: 'Gender' }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })

  test('the navbar avatar shows the first and last name initials, not the suffix', async ({ page }) => {
    await mockProfile(page)
    const dialog = await openEditor(page)
    await dialog.getByLabel('Middle name (optional)').fill('Maria')
    await dialog.getByRole('textbox', { name: 'Suffix (optional)' }).fill('Jr.')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Account, Demo Maria Shopper' }).getByText('DS', { exact: true })).toBeVisible()
  })

  test('rejects a future birthday inline', async ({ page }) => {
    const patches = await mockProfile(page)
    const dialog = await openEditor(page)
    const birthday = dialog.getByLabel('Birthday (optional)')
    const future = new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    await birthday.fill(future)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog.getByText('Birthday can’t be in the future. Pick today or an earlier date.')).toBeVisible()
    expect(patches).toHaveLength(0)
  })

  test('Save enables on a change and disables again when it is reverted', async ({ page }) => {
    await mockProfile(page)
    const dialog = await openEditor(page)
    const save = dialog.getByRole('button', { name: 'Save changes' })
    const last = dialog.getByLabel('Last name', { exact: true })
    await last.fill('Buyer')
    await expect(save).toBeEnabled()
    await last.fill('Shopper')
    await expect(save).toBeDisabled()
  })

  test('saving updates the heading, shows the toast and sends only the changed fields', async ({ page }) => {
    const patches = await mockProfile(page)
    const dialog = await openEditor(page)
    await dialog.getByLabel('Last name', { exact: true }).fill('Buyer')
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Profile updated' })).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: 'Demo Buyer' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Account, Demo Buyer' })).toBeVisible()
    expect(patches).toEqual([{ lastName: 'Buyer' }])
  })

  test('a 400 shows the server message inline and keeps the modal open', async ({ page }) => {
    await mockProfile(page, { patchStatus: 400, patchBody: { message: ['birthday must be a valid ISO 8601 date string'] } })
    const dialog = await openEditor(page)
    await dialog.getByLabel('Last name', { exact: true }).fill('Buyer')
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog.getByRole('alert')).toContainText('birthday must be a valid ISO 8601 date string')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  test('a 400 message clears as soon as a field is edited', async ({ page }) => {
    await mockProfile(page, { patchStatus: 400, patchBody: { message: ['birthday must be a valid ISO 8601 date string'] } })
    const dialog = await openEditor(page)
    const last = dialog.getByLabel('Last name', { exact: true })
    await last.fill('Buyer')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await last.fill('Buyers')
    await expect(dialog.getByRole('alert')).toBeHidden()
  })

  test('a server error shows Try again inside the dialog, reachable by keyboard', async ({ page }) => {
    const patches = await mockProfile(page, { patchStatus: 500 })
    const dialog = await openEditor(page)
    await dialog.getByLabel('Last name', { exact: true }).fill('Buyer')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    const retry = dialog.getByRole('alert').getByRole('button', { name: 'Try again' })
    await expect(retry).toBeVisible()
    await retry.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => patches.length).toBe(2)
    await expect(dialog).toBeVisible()
  })

  test('Escape, Cancel and the close button are ignored while a save is pending', async ({ page }) => {
    await mockProfile(page)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/users/me', async (route) => {
      if (route.request().method() === 'PATCH') await gate
      await route.fallback()
    })
    const dialog = await openEditor(page)
    await dialog.getByLabel('Last name', { exact: true }).fill('Buyer')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: 'Close Edit your profile' }).click()
    await expect(dialog).toBeVisible()
    release()
    await expect(dialog).toBeHidden()
  })

  test('Escape closes the modal', async ({ page }) => {
    await mockProfile(page)
    const dialog = await openEditor(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Edit profile' })).toBeVisible()
  })

  test('is usable at 320px with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    const patches = await mockProfile(page)
    const dialog = await openEditor(page)
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)

    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)

    const save = dialog.getByRole('button', { name: 'Save changes' })
    await dialog.getByLabel('First name', { exact: true }).fill('Demi')
    await save.scrollIntoViewIfNeeded()
    await expect(save).toBeEnabled()
    await save.click()
    await expect(dialog).toBeHidden()
    expect(patches).toEqual([{ firstName: 'Demi' }])
  })
})

// Saved addresses: /users/me/addresses is served from an in-memory list that follows the API's default rules.
test.describe('saved addresses', () => {
  const HOME = ADDRESS
  const OFFICE = address({
    id: '22222222-2222-4222-8222-222222222222',
    label: 'Office',
    streetAddress: '9 Ayala Avenue',
    isDefault: false,
    createdAt: '2026-04-01T08:00:00.000Z',
  })
  const section = (page: Page) => page.getByRole('region', { name: 'Delivery address' })
  const card = (page: Page, label: string) => section(page).getByRole('listitem').filter({ hasText: label })

  test.beforeEach(async ({ page }) => {
    await mockPsgc(page)
  })

  async function pick(dialog: Locator, page: Page, field: RegExp, option: string | RegExp) {
    await dialog.getByRole('button', { name: field }).click()
    await page.getByRole('option', { name: option }).click()
  }

  test('starts empty, adds the first address with the exact API body, and shows it as the default', async ({ page }) => {
    const api = await mockAddresses(page)
    await signIn(page)
    await expect(section(page).getByText('You have not saved a delivery address yet')).toBeVisible()
    await section(page).getByRole('button', { name: 'Add address' }).click()

    const dialog = page.getByRole('dialog', { name: 'Add a delivery address' })
    await expect(dialog.getByLabel('Recipient name', { exact: true })).toHaveValue('Demo Shopper')
    await expect(dialog.getByRole('checkbox', { name: 'Set as default address' })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: 'Set as default address' })).toBeDisabled()
    await dialog.getByLabel('Label (optional)', { exact: true }).fill('Home')
    await dialog.getByLabel('Phone number', { exact: true }).fill('917 123 4567')
    await pick(dialog, page, /^Region/, /NCR/)
    await pick(dialog, page, /^City or municipality/, 'City of Manila')
    await pick(dialog, page, /^Barangay/, 'Barangay 176')
    await dialog.getByLabel('Street address', { exact: true }).fill('12 Rizal Avenue')
    await dialog.getByLabel('Postal code', { exact: true }).fill('1000')
    await dialog.getByRole('button', { name: 'Save address' }).click()

    await expect(page.getByText('Address saved.')).toBeVisible()
    await expect(dialog).toBeHidden()
    expect(api.bodies).toEqual([
      {
        label: 'Home',
        recipientName: 'Demo Shopper',
        phone: '+639171234567',
        region: 'NCR',
        cityMunicipality: 'City of Manila',
        barangay: 'Barangay 176',
        streetAddress: '12 Rizal Avenue',
        postalCode: '1000',
        isDefault: true,
      },
    ])
    await expect(card(page, 'Home')).toContainText('Default')
    await expect(card(page, 'Home')).toContainText('12 Rizal Avenue')
    await expect(section(page).getByRole('button', { name: 'Add address' })).toBeFocused()
  })

  test('lists several default first, and Set as default moves the badge', async ({ page }) => {
    const api = await mockAddresses(page, [OFFICE, HOME])
    await signIn(page)
    const cards = section(page).getByRole('listitem')
    await expect(cards).toHaveCount(2)
    await expect(cards.first()).toContainText('Home')
    await expect(cards.first()).toContainText('Default')
    await expect(cards.last()).not.toContainText('Default')

    await cards.last().getByRole('button', { name: 'Set as default' }).click()
    await expect(page.getByText('Default address updated.')).toBeVisible()
    expect(api.bodies).toEqual([{ isDefault: true }])
    await expect(cards.first()).toContainText('Office')
    await expect(cards.first()).toContainText('Default')
    await expect(cards.last()).not.toContainText('Default')
  })

  test('edit opens already matched to the lists, and the PATCH carries only the changed field', async ({ page }) => {
    const api = await mockAddresses(page, [HOME, OFFICE])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Edit address Home' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit your delivery address' })
    await expect(dialog.getByRole('button', { name: /^Region/ })).toContainText('NCR')
    await expect(dialog.getByRole('button', { name: /^City or municipality/ })).toContainText('City of Manila')
    await expect(dialog.getByRole('button', { name: /^Barangay/ })).toContainText('Barangay 176')
    await expect(dialog.getByLabel('Street address', { exact: true })).toHaveValue('12 Rizal Avenue')
    await dialog.getByLabel('Street address', { exact: true }).fill('99 Quezon Avenue')
    await dialog.getByRole('button', { name: 'Save address' }).click()

    await expect(page.getByText('Address updated.')).toBeVisible()
    expect(api.bodies).toEqual([{ streetAddress: '99 Quezon Avenue' }])
    await expect(card(page, 'Home')).toContainText('99 Quezon Avenue')
  })

  test('delete asks first, Cancel keeps the address, and deleting the default promotes the other', async ({ page }) => {
    const api = await mockAddresses(page, [HOME, OFFICE])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Delete address Home' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete this address?' })
    await expect(dialog).toContainText('Your most recently added address becomes the default.')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false)
    await expect(card(page, 'Home')).toBeVisible()

    await section(page).getByRole('button', { name: 'Delete address Home' }).click()
    await dialog.getByRole('button', { name: 'Delete Address' }).click()
    await expect(page.getByText('Address deleted.')).toBeVisible()
    await expect(card(page, 'Home')).toHaveCount(0)
    await expect(card(page, 'Office')).toContainText('Default')
    expect(api.calls.filter((c) => c.method === 'DELETE')).toHaveLength(1)
  })

  test('says what went wrong when the list fails, and Try again loads it', async ({ page }) => {
    await mockAddresses(page, [HOME])
    let reads = 0
    await page.route('**/users/me/addresses', (route) => {
      if (route.request().method() === 'GET') {
        reads += 1
        if (reads === 1) return route.fulfill({ status: 500, json: {}, headers: CORS })
      }
      return route.fallback()
    })
    await signIn(page)
    const alert = section(page).getByRole('alert')
    await expect(alert).toContainText("We couldn't load your delivery addresses")
    // The rest of the profile is still there.
    await expect(page.getByRole('heading', { level: 1, name: 'Demo Shopper' })).toBeVisible()
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(card(page, 'Home')).toBeVisible()
  })

  test('sends the user to sign in, returning to the profile, when the token is rejected', async ({ page }) => {
    await mockAddresses(page, [HOME])
    await signIn(page)
    await page.route('**/users/me/addresses', (route) =>
      route.request().method() === 'OPTIONS' ? route.fallback() : route.fulfill({ status: 401, json: {}, headers: CORS }),
    )
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/)
  })

  for (const width of [320, 1280]) {
    test(`has no horizontal scroll at ${width}px with addresses listed and the form open`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await mockAddresses(page, [HOME, OFFICE])
      await signIn(page)
      await expect(section(page).getByRole('listitem')).toHaveCount(2)
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(await overflow()).toBeLessThanOrEqual(0)

      await section(page).getByRole('button', { name: 'Add address' }).click()
      const dialog = page.getByRole('dialog', { name: 'Add a delivery address' })
      await expect(dialog).toBeVisible()
      expect(await overflow()).toBeLessThanOrEqual(0)
      const box = (await dialog.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5)
    })
  }

  // ---- Added: body shape, validation, edit diffs, failures, dialog behaviour, dark mode ----
  const FARM = address({
    id: '33333333-3333-4333-8333-333333333333',
    label: 'Farm',
    region: 'CALABARZON',
    province: 'Batangas',
    cityMunicipality: 'Batangas City',
    barangay: 'Alangilan',
    streetAddress: '4 Mabini Street',
    isDefault: false,
    createdAt: '2026-05-01T08:00:00.000Z',
  })
  const addDialog = (page: Page) => page.getByRole('dialog', { name: 'Add a delivery address' })
  const editDialog = (page: Page) => page.getByRole('dialog', { name: 'Edit your delivery address' })

  /** Opens Add address (the list already has rows) and fills a valid NCR address, leaving Save address to the test. */
  async function openAndFill(page: Page) {
    await section(page).getByRole('button', { name: 'Add address' }).click()
    const dialog = addDialog(page)
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Phone number', { exact: true }).fill('917 123 4567')
    await pick(dialog, page, /^Region/, /NCR/)
    await pick(dialog, page, /^City or municipality/, 'City of Manila')
    await pick(dialog, page, /^Barangay/, 'Barangay 176')
    await dialog.getByLabel('Street address', { exact: true }).fill('7 Taft Avenue')
    await dialog.getByLabel('Postal code', { exact: true }).fill('1004')
    return dialog
  }

  /** Holds the first matching write until `release()`; later ones, and every other request, pass through to mockAddresses. */
  function holdWrites(page: Page, method: string) {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const held = page.route('**/users/me/addresses**', async (route) => {
      if (route.request().method() === method) await gate
      await route.fallback()
    })
    return { release, ready: held }
  }

  /** Answers the first `method` request to the addresses API with `reply`, then lets the rest through. */
  async function failOnce(page: Page, method: string, reply: (route: Route) => Promise<void>) {
    let done = false
    await page.route('**/users/me/addresses**', async (route) => {
      if (!done && route.request().method() === method) {
        done = true
        return reply(route)
      }
      return route.fallback()
    })
  }

  test('a second address in a province omits label and isDefault, and sends province and line 2', async ({ page }) => {
    const api = await mockAddresses(page, [HOME])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Add address' }).click()
    const dialog = addDialog(page)
    await expect(dialog.getByRole('checkbox', { name: 'Set as default address' })).not.toBeChecked()
    await dialog.getByLabel('Phone number', { exact: true }).fill('09177654321')
    await pick(dialog, page, /^Region/, /CALABARZON/)
    await pick(dialog, page, /^City or municipality/, 'Batangas City')
    await expect(dialog.getByLabel('Province')).toHaveValue('Batangas')
    await pick(dialog, page, /^Barangay/, 'Alangilan')
    await dialog.getByLabel('Street address', { exact: true }).fill('4 Mabini Street')
    await dialog.getByRole('textbox', { name: 'Unit, floor or landmark (optional)' }).fill('Gate 2')
    await dialog.getByLabel('Postal code', { exact: true }).fill('4200')
    await dialog.getByRole('button', { name: 'Save address' }).click()

    await expect(page.getByText('Address saved.')).toBeVisible()
    expect(api.bodies).toEqual([
      {
        recipientName: 'Demo Shopper',
        phone: '+639177654321',
        region: 'CALABARZON',
        province: 'Batangas',
        cityMunicipality: 'Batangas City',
        barangay: 'Alangilan',
        streetAddress: '4 Mabini Street',
        addressLine2: 'Gate 2',
        postalCode: '4200',
      },
    ])
    // Home is still the default.
    await expect(section(page).getByRole('listitem').first()).toContainText('Home')
    await expect(section(page).getByRole('listitem').first()).toContainText('Default')
  })

  test('ticking Set as default on a new address sends isDefault and moves the badge', async ({ page }) => {
    const api = await mockAddresses(page, [HOME])
    await signIn(page)
    const dialog = await openAndFill(page)
    await dialog.getByLabel('Label (optional)', { exact: true }).fill('Studio')
    await dialog.getByText('Set as default address', { exact: true }).click()
    await expect(dialog.getByRole('checkbox', { name: 'Set as default address' })).toBeChecked()
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(page.getByText('Address saved.')).toBeVisible()
    expect(api.bodies[0]).toMatchObject({ label: 'Studio', isDefault: true })
    const cards = section(page).getByRole('listitem')
    await expect(cards.first()).toContainText('Studio')
    await expect(cards.first()).toContainText('Default')
    await expect(card(page, 'Home')).not.toContainText('Default')
  })

  test('an empty submit names the first invalid field, focuses it and sends nothing', async ({ page }) => {
    const api = await mockAddresses(page, [HOME])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Add address' }).click()
    const dialog = addDialog(page)
    const recipient = dialog.getByLabel('Recipient name', { exact: true })
    await recipient.fill('')
    await dialog.getByRole('button', { name: 'Save address' }).click()

    await expect(recipient).toBeFocused()
    await expect(dialog.getByText('Recipient name is required.')).toBeVisible()
    await expect(dialog.getByText('Phone number is required.')).toBeVisible()
    await expect(dialog.getByText('Choose your region.')).toBeVisible()
    await expect(dialog.getByText('Choose your city or municipality.')).toBeVisible()
    await expect(dialog.getByText('Choose your barangay.')).toBeVisible()
    await expect(dialog.getByText('Street address is required.')).toBeVisible()
    await expect(dialog.getByText('Postal code is required.')).toBeVisible()
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  test('the first invalid field after a valid name is the phone, and a bad number is explained', async ({ page }) => {
    const api = await mockAddresses(page, [HOME])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Add address' }).click()
    const dialog = addDialog(page)
    const phone = dialog.getByLabel('Phone number', { exact: true })
    await phone.fill('12345')
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(phone).toBeFocused()
    await expect(dialog.getByText('Enter a Philippine mobile number like 917 123 4567.')).toBeVisible()
    await expect(dialog.getByLabel('Recipient name', { exact: true })).toHaveValue('Demo Shopper')
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  test('with everything valid but the street, the street is focused', async ({ page }) => {
    await mockAddresses(page, [HOME])
    await signIn(page)
    const dialog = await openAndFill(page)
    const street = dialog.getByLabel('Street address', { exact: true })
    await street.fill('')
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(street).toBeFocused()
    await expect(dialog.getByText('Street address is required.')).toBeVisible()
  })

  test('edit sends null for cleared optionals, and a normalised phone, and nothing else', async ({ page }) => {
    const withLine2 = address({ addressLine2: 'Gate 2' })
    const api = await mockAddresses(page, [withLine2])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Edit address Home' }).click()
    const dialog = editDialog(page)
    await expect(dialog.getByLabel('Label (optional)', { exact: true })).toHaveValue('Home')
    await expect(dialog.getByRole('textbox', { name: 'Unit, floor or landmark (optional)' })).toHaveValue('Gate 2')
    await dialog.getByLabel('Label (optional)', { exact: true }).fill('')
    await dialog.getByRole('textbox', { name: 'Unit, floor or landmark (optional)' }).fill('')
    await dialog.getByLabel('Phone number', { exact: true }).fill('0917 765 4321')
    await dialog.getByRole('button', { name: 'Save address' }).click()

    await expect(page.getByText('Address updated.')).toBeVisible()
    expect(api.bodies).toEqual([{ phone: '+639177654321', label: null, addressLine2: null }])
    await expect(section(page).getByRole('listitem')).toContainText('Address')
  })

  test('edit pre-resolves a province address and keeps its province', async ({ page }) => {
    const api = await mockAddresses(page, [HOME, FARM])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Edit address Farm' }).click()
    const dialog = editDialog(page)
    await expect(dialog.getByRole('button', { name: /^Region/ })).toContainText('CALABARZON')
    await expect(dialog.getByRole('button', { name: /^City or municipality/ })).toContainText('Batangas City')
    await expect(dialog.getByRole('button', { name: /^Barangay/ })).toContainText('Alangilan')
    await expect(dialog.getByLabel('Province')).toHaveValue('Batangas')
    await dialog.getByLabel('Postal code', { exact: true }).fill('4201')
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(page.getByText('Address updated.')).toBeVisible()
    expect(api.bodies).toEqual([{ postalCode: '4201' }])
  })

  test('saving an edit with nothing changed closes the dialog and sends no request', async ({ page }) => {
    const api = await mockAddresses(page, [HOME])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Edit address Home' }).click()
    const dialog = editDialog(page)
    await expect(dialog.getByRole('button', { name: /^Barangay/ })).toContainText('Barangay 176')
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(dialog).toBeHidden()
    expect(api.calls.filter((c) => c.method === 'PATCH' || c.method === 'POST')).toEqual([])
    await expect(page.getByText('Address updated.')).toHaveCount(0)
  })

  test('the server message from a 400 is shown inline and the form keeps its values', async ({ page }) => {
    await mockAddresses(page, [HOME])
    await signIn(page)
    const dialog = await openAndFill(page)
    await failOnce(page, 'POST', (route) =>
      route.fulfill({ status: 400, json: { message: ['postalCode must match a 4 digit pattern'] }, headers: CORS }),
    )
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(dialog.getByRole('alert')).toContainText('The server said: postalCode must match a 4 digit pattern')
    await expect(dialog.getByLabel('Postal code', { exact: true })).toHaveValue('1004')
    await expect(dialog.getByRole('button', { name: 'Save address' })).toBeEnabled()
  })

  test('a 500 in the add modal says what happened, and Save address again succeeds', async ({ page }) => {
    const api = await mockAddresses(page, [HOME])
    await signIn(page)
    const dialog = await openAndFill(page)
    await failOnce(page, 'POST', (route) => route.fulfill({ status: 500, json: {}, headers: CORS }))
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(dialog.getByRole('alert')).toContainText('Something went wrong on our side')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(page.getByText('Address saved.')).toBeVisible()
    await expect(dialog).toBeHidden()
    expect(api.bodies).toHaveLength(1)
  })

  test('a dropped connection in the add modal says so, and Save address again succeeds', async ({ page }) => {
    const api = await mockAddresses(page, [HOME])
    await signIn(page)
    const dialog = await openAndFill(page)
    await failOnce(page, 'POST', (route) => route.abort('connectionfailed'))
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(dialog.getByRole('alert')).toContainText('The connection dropped')
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(page.getByText('Address saved.')).toBeVisible()
    expect(api.bodies).toHaveLength(1)
  })

  test('a 401 while saving sends the user to sign in', async ({ page }) => {
    await mockAddresses(page, [HOME])
    await signIn(page)
    const dialog = await openAndFill(page)
    await failOnce(page, 'POST', (route) => route.fulfill({ status: 401, json: {}, headers: CORS }))
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('Escape, the backdrop, Cancel and Close are ignored while saving, and the button cannot be pressed twice', async ({ page }) => {
    const api = await mockAddresses(page, [HOME])
    await signIn(page)
    const dialog = await openAndFill(page)
    const { release, ready } = holdWrites(page, 'POST')
    await ready
    const save = dialog.getByRole('button', { name: 'Save address' })
    await save.click()
    await expect(save).toBeDisabled()
    await page.keyboard.press('Escape')
    await page.mouse.click(2, 2)
    await dialog.getByRole('button', { name: 'Close Add a delivery address' }).click()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await expect(dialog).toBeVisible()
    release()
    await expect(page.getByText('Address saved.')).toBeVisible()
    await expect(dialog).toBeHidden()
    expect(api.bodies).toHaveLength(1)
  })

  test('before saving, Escape and the backdrop close the add dialog and focus returns to Add address', async ({ page }) => {
    await mockAddresses(page, [HOME])
    await signIn(page)
    const add = section(page).getByRole('button', { name: 'Add address' })
    await add.click()
    await expect(addDialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(addDialog(page)).toBeHidden()
    await expect(add).toBeFocused()

    await add.click()
    await expect(addDialog(page)).toBeVisible()
    await page.mouse.click(2, 2)
    await expect(addDialog(page)).toBeHidden()
    await expect(add).toBeFocused()
  })

  test('Tab and Shift+Tab stay inside the dialog, in both directions', async ({ page }) => {
    await mockAddresses(page, [HOME, OFFICE])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Edit address Home' }).click()
    const dialog = editDialog(page)
    await expect(dialog.getByRole('button', { name: /^Barangay/ })).toContainText('Barangay 176')
    const inside = () => dialog.evaluate((el) => el.contains(document.activeElement))
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab')
      expect(await inside(), `Tab ${i + 1}`).toBe(true)
    }
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Shift+Tab')
      expect(await inside(), `Shift+Tab ${i + 1}`).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('focus returns to the Edit button when the edit dialog closes by Escape, Cancel, a silent save or a real save', async ({ page }) => {
    await mockAddresses(page, [HOME, OFFICE])
    await signIn(page)
    const edit = section(page).getByRole('button', { name: 'Edit address Home' })
    const open = async () => {
      await edit.click()
      await expect(editDialog(page).getByRole('button', { name: /^Barangay/ })).toContainText('Barangay 176')
    }
    await open()
    await page.keyboard.press('Escape')
    await expect(editDialog(page)).toBeHidden()
    await expect(edit).toBeFocused()

    await open()
    await editDialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(editDialog(page)).toBeHidden()
    await expect(edit).toBeFocused()

    await open()
    await editDialog(page).getByRole('button', { name: 'Save address' }).click()
    await expect(editDialog(page)).toBeHidden()
    await expect(edit).toBeFocused()

    await open()
    await editDialog(page).getByLabel('Postal code', { exact: true }).fill('1001')
    await editDialog(page).getByRole('button', { name: 'Save address' }).click()
    await expect(page.getByText('Address updated.')).toBeVisible()
    await expect(edit).toBeFocused()
  })

  test('Set as default keeps focus on its button while it runs, then moves it to that address Edit button', async ({ page }) => {
    await mockAddresses(page, [HOME, OFFICE])
    await signIn(page)
    const { release, ready } = holdWrites(page, 'PATCH')
    await ready
    const button = card(page, 'Office').getByRole('button', { name: 'Set as default' })
    await button.click()
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await expect(button).toBeFocused()
    release()
    await expect(page.getByText('Default address updated.')).toBeVisible()
    await expect(card(page, 'Office').getByRole('button', { name: 'Edit address Office' })).toBeFocused()
  })

  test('a long unbroken label, recipient, street and line 2 wrap inside the card at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    const long = address({
      label: 'W'.repeat(50),
      recipientName: 'W'.repeat(60),
      streetAddress: 'W'.repeat(120),
      addressLine2: 'W'.repeat(120),
      barangay: 'W'.repeat(80),
    })
    await mockAddresses(page, [long])
    await signIn(page)
    await expect(section(page).getByRole('listitem')).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    const box = (await section(page).boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    // The Edit button stays reachable inside the card.
    const edit = (await section(page).getByRole('button', { name: /^Edit address / }).boundingBox())!
    expect(edit.x + edit.width).toBeLessThanOrEqual(box.x + box.width)
  })

  test('the form names a word over 30 characters and sends nothing', async ({ page }) => {
    const api = await mockAddresses(page, [HOME])
    await signIn(page)
    const dialog = await openAndFill(page)
    await dialog.getByLabel('Label (optional)', { exact: true }).fill('W'.repeat(31))
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(dialog.getByText('Each word in Label can be at most 30 characters. Add a space or shorten it.')).toBeVisible()
    await expect(dialog.getByLabel('Label (optional)', { exact: true })).toBeFocused()
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([])
  })

  test('saving an edit of a legacy-format phone sends nothing, and a street edit sends only the street', async ({ page }) => {
    const api = await mockAddresses(page, [address({ phone: '09171234567' })])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Edit address Home' }).click()
    let dialog = editDialog(page)
    await expect(dialog.getByRole('button', { name: /^Barangay/ })).toContainText('Barangay 176')
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(dialog).toBeHidden()
    expect(api.calls.filter((c) => c.method === 'PATCH')).toEqual([])

    await section(page).getByRole('button', { name: 'Edit address Home' }).click()
    dialog = editDialog(page)
    await expect(dialog.getByRole('button', { name: /^Barangay/ })).toContainText('Barangay 176')
    await dialog.getByLabel('Street address', { exact: true }).fill('99 Quezon Avenue')
    await dialog.getByRole('button', { name: 'Save address' }).click()
    await expect(page.getByText('Address updated.')).toBeVisible()
    expect(api.bodies).toEqual([{ streetAddress: '99 Quezon Avenue' }])
  })

  test('the floating label of the first field is not clipped by the dialog body', async ({ page }) => {
    await mockAddresses(page, [HOME])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Add address' }).click()
    const dialog = addDialog(page)
    await dialog.getByLabel('Label (optional)', { exact: true }).fill('Studio')
    const body = (await dialog.getByRole('region', { name: 'Add a delivery address text' }).boundingBox())!
    const labelTop = await dialog.locator('label', { hasText: 'Label (optional)' }).evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return range.getBoundingClientRect().top
    })
    expect(labelTop).toBeGreaterThanOrEqual(body.y)
  })

  test('the address skeleton is as tall as the loaded list, and the first card does not move', async ({ page }) => {
    await mockAddresses(page, [HOME])
    await signIn(page)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/users/me/addresses', async (route) => {
      if (route.request().method() === 'GET') await gate
      await route.fallback()
    })
    await page.goto('/profile')
    const skeleton = page.getByRole('status', { name: 'Loading your delivery addresses' })
    await expect(skeleton).toBeVisible()
    const before = (await section(page).boundingBox())!
    const cardBefore = (await skeleton.locator('> div').boundingBox())!
    release()
    const loadedCard = card(page, 'Home')
    await expect(loadedCard).toBeVisible()
    const after = (await section(page).boundingBox())!
    const cardAfter = (await loadedCard.boundingBox())!
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(cardAfter.y - cardBefore.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(cardAfter.height - cardBefore.height)).toBeLessThanOrEqual(1)
  })

  test('the add form can be filled and saved with the keyboard alone', async ({ page }) => {
    const api = await mockAddresses(page, [HOME])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Add address' }).focus()
    await page.keyboard.press('Enter')
    const dialog = addDialog(page)
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Phone number', { exact: true }).focus()
    await page.keyboard.type('9171234567')
    for (const [field, option] of [
      [/^Region/, /NCR/],
      [/^City or municipality/, 'City of Manila'],
      [/^Barangay/, 'Barangay 176'],
    ] as const) {
      await dialog.getByRole('button', { name: field }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('option', { name: option })).toBeVisible()
      await page.getByRole('option', { name: option }).click()
    }
    await dialog.getByLabel('Street address', { exact: true }).focus()
    await page.keyboard.type('1 Quezon Boulevard')
    await dialog.getByLabel('Postal code', { exact: true }).focus()
    await page.keyboard.type('1000')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Address saved.')).toBeVisible()
    expect(api.bodies[0]).toMatchObject({ streetAddress: '1 Quezon Boulevard', phone: '+639171234567' })
  })

  test('a failed delete stays in the dialog with the reason, and Delete Address again works', async ({ page }) => {
    const api = await mockAddresses(page, [HOME, OFFICE])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Delete address Office' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete this address?' })
    await failOnce(page, 'DELETE', (route) => route.fulfill({ status: 500, json: {}, headers: CORS }))
    await dialog.getByRole('button', { name: 'Delete Address' }).click()
    await expect(dialog.getByRole('alert')).toContainText("We couldn't delete this address")
    await expect(card(page, 'Office')).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete Address' }).click()
    await expect(page.getByText('Address deleted.')).toBeVisible()
    await expect(card(page, 'Office')).toHaveCount(0)
    expect(api.calls.filter((c) => c.method === 'DELETE')).toHaveLength(1) // the 500 never reached the mock
    // Deleting a non-default does not promise a new default.
    await expect(card(page, 'Home')).toContainText('Default')
  })

  test('the delete confirmation for a non-default address does not mention a new default', async ({ page }) => {
    await mockAddresses(page, [HOME, OFFICE])
    await signIn(page)
    await section(page).getByRole('button', { name: 'Delete address Office' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete this address?' })
    await expect(dialog).toContainText('Are you sure?')
    await expect(dialog).not.toContainText('becomes the default')
  })

  test('a failed Set as default shows an error toast and keeps the old default', async ({ page }) => {
    await mockAddresses(page, [HOME, OFFICE])
    await signIn(page)
    await failOnce(page, 'PATCH', (route) => route.fulfill({ status: 500, json: {}, headers: CORS }))
    await card(page, 'Office').getByRole('button', { name: 'Set as default' }).click()
    await expect(page.getByText("We couldn't change your default address")).toBeVisible()
    await expect(card(page, 'Home')).toContainText('Default')
  })

  test('dark mode renders the list and the form with text that differs from the surface', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
    await mockAddresses(page, [HOME, OFFICE])
    await signIn(page)
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(card(page, 'Home')).toBeVisible()
    const colors = (locator: Locator) =>
      locator.evaluate((el) => {
        let bg = 'rgba(0, 0, 0, 0)'
        for (let node: Element | null = el; node; node = node.parentElement) {
          bg = getComputedStyle(node).backgroundColor
          if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break
        }
        return { text: getComputedStyle(el).color, bg }
      })
    const list = await colors(card(page, 'Home').getByText('Anne Santos'))
    expect(list.text).not.toBe(list.bg)

    await section(page).getByRole('button', { name: 'Add address' }).click()
    const dialog = addDialog(page)
    await expect(dialog).toBeVisible()
    const form = await colors(dialog.getByRole('heading', { name: 'Add a delivery address' }))
    expect(form.text).not.toBe(form.bg)
  })
})
