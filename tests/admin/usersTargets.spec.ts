import { expect, test, type Locator, type Page } from '@playwright/test'
import { manyUsers, stubUsersApi } from './usersApiStub'

// User Management on a tablet and a desktop: every control is 44px high, the invite sheet's fields too. Below the table breakpoint the cards
// get a Sort by select. The deactivate dialog opens on Cancel. The backend is stubbed (usersApiStub.ts); sign-in is the dev-only simulated one.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await stubUsersApi(page, manyUsers('staff', 25))
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/admin/users?tab=staff')
  await expect(page.getByRole('tab', { name: 'Staff', exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
  await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible()
}

async function expectTall(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box, 'the control is on screen').not.toBeNull()
  expect(box!.height).toBeGreaterThanOrEqual(43.5)
}

for (const width of [768, 1024, 1920]) {
  test(`selects, pager and invite fields are 44px at ${width}px`, async ({ page }) => {
    await open(page, width)
    for (const select of await page.getByRole('combobox').all()) await expectTall(select)
    for (const button of await page.getByRole('navigation', { name: 'Pagination' }).getByRole('button').filter({ visible: true }).all()) await expectTall(button)
    await page.getByRole('button', { name: 'Add staff account', exact: true }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Add staff account' })
    for (const label of ['First name', 'Middle name', 'Last name', 'Suffix', 'Email', 'Birthday']) await expectTall(sheet.getByLabel(label))
    await expectTall(sheet.getByRole('combobox'))
  })
}

test('the cards have a Sort by select and a direction button; the select is gone at desktop width', async ({ page }) => {
  await open(page, 600)
  const sortBy = page.getByRole('combobox', { name: 'Sort by' })
  await expect(sortBy).toBeVisible()
  await expectTall(sortBy)
  const first = page.getByRole('list', { name: /staff/i }).getByRole('listitem').first()
  const before = await first.innerText()
  await page.getByRole('button', { name: /^Sorted ascending/ }).click()
  await expect(page.getByRole('button', { name: /^Sorted descending/ })).toBeVisible()
  await expect.poll(async () => first.innerText()).not.toBe(before)
  await sortBy.click()
  await page.getByRole('option', { name: 'Added' }).click()
  await expect(sortBy).toContainText('Added')

  await page.setViewportSize({ width: 1920, height: 900 })
  await expect(sortBy).toBeHidden()
})

test('the deactivate dialog opens on Cancel and tells Deactivate apart from it', async ({ page }) => {
  await open(page, 1024)
  await page.getByRole('button', { name: /^Deactivate /i }).filter({ visible: true }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  const [cancel, confirm] = await Promise.all([
    dialog.getByRole('button', { name: 'Cancel' }).evaluate((el) => getComputedStyle(el).borderTopColor),
    dialog.getByRole('button', { name: /^Deactivate/ }).evaluate((el) => getComputedStyle(el).borderTopColor),
  ])
  expect(confirm).not.toBe(cancel)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
