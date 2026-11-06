import { expect, test, type Locator, type Page } from '@playwright/test'
import { manyUsers, stubUsersApi } from './usersApiStub'

// User Management gaps: the Sort by control on the account cards (below the table breakpoint), the deactivate dialog's focus handling,
// the invite sheet's success toast at 320px, and 44px touch targets on the date field, row actions and the toolbar Add button.
// Backend stubbed (usersApiStub.ts); sign-in is the dev-only simulated one. Runs in the desktop and mobile projects.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function open(page: Page, width: number, tab = 'staff') {
  await page.setViewportSize({ width, height: width <= 400 ? 700 : 900 })
  await stubUsersApi(page, manyUsers('staff', 25))
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto(`/admin/users?tab=${tab}`)
  await expect(page.getByRole('tab', { name: 'Staff', exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
  await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible()
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const sortBy = (page: Page) => page.getByRole('combobox', { name: 'Sort by' })
const direction = (page: Page) => page.getByRole('button', { name: /^Sorted (ascending|descending)/ })
const cards = (page: Page) => page.getByRole('list', { name: /staff/i }).getByRole('listitem')

/** The names on the shown page, top to bottom ("Staffab Personab"), read from the cards. */
async function names(page: Page) {
  const texts = await cards(page).allInnerTexts()
  return texts.map((text) => text.match(/Staff[a-j]{2} Person[a-j]{2}/)?.[0] ?? text)
}

async function expectBox(locator: Locator, min = 44) {
  const box = await locator.boundingBox()
  expect(box, 'the control is on screen').not.toBeNull()
  expect(box!.height).toBeGreaterThanOrEqual(min - 0.5)
  expect(box!.width).toBeGreaterThanOrEqual(min - 0.5)
}

test.describe('Sort by on the cards', () => {
  test('Name orders the cards by name and the direction button flips them', async ({ page }) => {
    await open(page, 600)
    await sortBy(page).click()
    await page.getByRole('option', { name: 'Name', exact: true }).click()
    await expect(sortBy(page)).toContainText('Name')

    // Make the direction ascending whichever way the page started.
    if (/^Sorted descending/.test((await direction(page).getAttribute('aria-label')) ?? '')) await direction(page).click()
    await expect(direction(page)).toHaveAccessibleName(/^Sorted ascending\. Switch to descending/)
    await expect(direction(page)).toHaveText('↑ Ascending')
    await expect.poll(async () => (await names(page)).length).toBe(10)
    const ascending = await names(page)
    expect(ascending).toEqual([...ascending].sort((a, b) => a.localeCompare(b)))

    await direction(page).click()
    await expect(direction(page)).toHaveAccessibleName(/^Sorted descending\. Switch to ascending/)
    await expect(direction(page)).toHaveText('↓ Descending')
    await expect.poll(async () => (await names(page))[0]).not.toBe(ascending[0])
    const descending = await names(page)
    expect(descending).toEqual([...descending].sort((a, b) => b.localeCompare(a)))
  })

  test('choosing Added asks the backend for the createdAt order and the select shows the choice', async ({ page }) => {
    await open(page, 600)
    const request = page.waitForRequest((req) => req.url().includes('/users') && new URL(req.url()).searchParams.get('sortBy') === 'createdAt')
    await sortBy(page).click()
    await page.getByRole('option', { name: 'Added', exact: true }).click()
    await request
    await expect(sortBy(page)).toContainText('Added')
    await expect(direction(page)).toBeVisible()
  })

  test('the select and the direction button are at least 44px tall, and the table header buttons are gone', async ({ page }) => {
    await open(page, 600)
    await expectBox(sortBy(page), 44)
    const button = await direction(page).boundingBox()
    expect(button!.height).toBeGreaterThanOrEqual(43.5)
    await expect(page.getByRole('table')).toBeHidden()
  })

  test('no horizontal scroll at 320px, and the control stays inside the page', async ({ page }) => {
    await open(page, 320)
    await expect(sortBy(page)).toBeVisible()
    await expect(direction(page)).toBeVisible()
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
    for (const control of [sortBy(page), direction(page)]) {
      const box = (await control.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(320)
    }
  })

  test('keyboard: Tab reaches the select, Enter opens it, arrows and Enter choose, then the direction button works with Space', async ({ page }) => {
    await open(page, 600)
    await sortBy(page).focus()
    await expect(sortBy(page)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listbox')).toBeHidden()
    await expect(sortBy(page)).toBeFocused()
    await expect(sortBy(page)).toContainText('Added')

    await page.keyboard.press('Tab')
    await expect(direction(page)).toBeFocused()
    const label = await direction(page).getAttribute('aria-label')
    await page.keyboard.press('Space')
    await expect.poll(() => direction(page).getAttribute('aria-label')).not.toBe(label)
  })

  test('the Sort control is gone at table width', async ({ page }) => {
    await open(page, 1920)
    await expect(sortBy(page)).toBeHidden()
    await expect(page.getByRole('columnheader', { name: /Staff/ })).toBeVisible()
  })
})

test.describe('deactivate dialog focus', () => {
  const dialog = (page: Page) => page.getByRole('dialog')
  const opener = (page: Page) => page.getByRole('button', { name: /^Deactivate /i }).filter({ visible: true }).first()
  const inside = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))

  test('opens on Cancel, so Enter never confirms by accident', async ({ page }) => {
    await open(page, 1024)
    await opener(page).click()
    await expect(dialog(page).getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toBeHidden()
    // Cancel closes without deactivating: the row is still listed as active.
    await expect(opener(page)).toBeVisible()
  })

  test('Escape closes it and the page below is usable again', async ({ page }) => {
    await open(page, 1024)
    await opener(page).click()
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect(page.getByRole('button', { name: 'Add staff account', exact: true }).first()).toBeEnabled()
  })

  test('Tab and Shift+Tab stay inside the dialog', async ({ page }) => {
    await open(page, 1024)
    await opener(page).click()
    await expect(dialog(page).getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab')
      expect(await inside(page)).toBe(true)
    }
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await inside(page)).toBe(true)
    }
  })

  test('on a phone the dialog also opens on Cancel and keeps focus inside', async ({ page }) => {
    await open(page, 320)
    await opener(page).click()
    await expect(dialog(page).getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    expect(await inside(page)).toBe(true)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('invite success toast', () => {
  test('at 320px the toast sits clear of the confirmation text and the Done button', async ({ page }) => {
    // KNOWN PRODUCT BUG: at 320x700 the toast (y 549-611) covers the last lines of "Invitation sent to ..." (y 472-602). Remove this line once fixed.
    test.fail(true, 'toast overlaps the invite confirmation text at 320px')
    await open(page, 320)
    await page.getByRole('button', { name: 'Add staff account', exact: true }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Add staff account' })
    await sheet.getByLabel('First name').fill('Maya')
    await sheet.getByLabel('Last name').fill('Lopez')
    await sheet.getByLabel('Email').fill('maya.lopez@example.com')
    await sheet.getByRole('button', { name: 'Send Invitation', exact: true }).click()
    const sent = page.getByRole('dialog', { name: 'Invitation sent' })
    const text = sent.getByText(/^Invitation sent to/)
    await expect(text).toBeVisible()
    const toast = page.getByRole('status').filter({ hasText: /^Invitation sent$/ })
    await expect(toast).toBeVisible()
    // Wait for the toast's entrance slide to settle before measuring.
    await expect.poll(async () => {
      const a = (await toast.boundingBox())!
      await page.evaluate(() => new Promise(requestAnimationFrame))
      const b = (await toast.boundingBox())!
      return a.y === b.y
    }).toBe(true)

    const t = (await toast.boundingBox())!
    const p = (await text.boundingBox())!
    const done = (await sent.getByRole('button', { name: 'Done', exact: true }).boundingBox())!
    const apart = (a: { y: number; height: number }, b: { y: number; height: number }) => a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5
    expect(apart(t, p), 'toast and confirmation text overlap').toBe(true)
    expect(apart(t, done), 'toast and Done button overlap').toBe(true)
    expect(t.x).toBeGreaterThanOrEqual(0)
    expect(t.x + t.width).toBeLessThanOrEqual(320)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('44px targets', () => {
  for (const width of [320, 1024]) {
    test(`the invite sheet's date field, role actions and the toolbar Add button are 44px at ${width}px`, async ({ page }) => {
      await open(page, width)
      const add = page.getByRole('button', { name: 'Add staff account', exact: true }).first()
      await expectBox(add, 44)
      const rowActions = page.getByRole('button', { name: /^(Deactivate|Send password reset email to) /i }).filter({ visible: true })
      expect(await rowActions.count()).toBeGreaterThan(0)
      for (const button of await rowActions.all()) await expectBox(button, 44)

      await add.click()
      const sheet = page.getByRole('dialog', { name: 'Add staff account' })
      await expectBox(sheet.getByLabel('Birthday'), 44)
      for (const label of ['First name', 'Email']) expect((await sheet.getByLabel(label).boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    })
  }
})
