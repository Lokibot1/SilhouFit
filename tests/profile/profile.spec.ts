import { expect, test, type Page } from '@playwright/test'
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
