import { expect, test, type Page } from '@playwright/test'
import { stubUsersApi, type UsersStub } from './usersApiStub'

// Keyboard (Tab, Enter, Escape, focus trap), dark mode and the "who may act on whom" rules for the invite sheet, the row actions and the
// confirmation dialogs on /admin/users and /superadmin/users. Backend stubbed (usersApiStub.ts); sign-in is the dev-only simulated one.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function open(page: Page, tab: 'staff' | 'admins' | 'superadmins', who = ADMIN, base = '/admin') {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(who.email)
  await page.getByLabel('Password', { exact: true }).fill(who.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/(admin|superadmin)$/)
  const name = { staff: 'Staff', admins: 'Admins', superadmins: 'Superadmins' }[tab]
  await page.goto(`${base}/users?tab=${tab}`)
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
}

const addStaff = (page: Page) => page.getByRole('button', { name: 'Add staff account', exact: true }).first()
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Add staff account' })
const action = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).first()
const luminance = (css: string) => {
  const [r, g, b] = (css.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

test.describe('invite sheet, keyboard', () => {
  let api: UsersStub

  test('Tab stays inside the sheet, Escape closes it and gives focus back to Add staff account, and nothing is sent', async ({ page }) => {
    api = await stubUsersApi(page)
    await open(page, 'staff')
    await addStaff(page).click()
    await expect(sheet(page)).toBeVisible()
    // A dozen Tab presses from wherever focus starts never leave the dialog.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
    }
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)
    await expect(addStaff(page)).toBeFocused()
    expect(api.invites).toEqual([])
  })

  test('the fields can be filled with the keyboard alone and Enter sends the invitation once', async ({ page }) => {
    api = await stubUsersApi(page)
    await open(page, 'staff')
    await addStaff(page).press('Enter')
    await sheet(page).getByLabel('First name').focus()
    await page.keyboard.type('Kai')
    await sheet(page).getByLabel('Last name').focus()
    await page.keyboard.type('Villar')
    await sheet(page).getByLabel('Email').focus()
    await page.keyboard.type('kai.villar@example.com')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Invitation sent' })).toContainText('Invitation sent to kai.villar@example.com')
    expect(api.invites).toHaveLength(1)
    expect(api.invites[0]).toMatchObject({ email: 'kai.villar@example.com', firstName: 'Kai', lastName: 'Villar', role: 'staff' })
  })

  test('Escape closes the confirmation dialog without sending a deactivation', async ({ page }) => {
    api = await stubUsersApi(page)
    await open(page, 'staff')
    await action(page, 'Deactivate Lara Santos').click()
    const dialog = page.getByRole('dialog', { name: 'Deactivate Lara Santos?' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(api.deactivations).toEqual([])
  })
})

test.describe('invite sheet, new fields by keyboard', () => {
  test('Tab follows the on-screen order, a tip shows on focus of an optional field, and the gender is picked with the arrow keys', async ({ page }) => {
    const api = await stubUsersApi(page)
    await open(page, 'staff')
    await addStaff(page).press('Enter')
    const order = ['First name', 'Middle name (optional)', 'Last name', 'Suffix (optional)', 'Email', 'Birthday (optional)']
    const positions = await Promise.all(order.map(async (label) => (await sheet(page).getByLabel(label).boundingBox())!.y))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)

    await sheet(page).getByLabel('Last name').focus()
    await page.keyboard.press('Tab')
    await expect(sheet(page).getByLabel('Suffix (optional)')).toBeFocused()
    await expect(page.getByRole('tooltip')).toContainText('Goes after the last name')
    await page.keyboard.press('Tab')
    await expect(sheet(page).getByLabel('Email')).toBeFocused()
    await expect(page.getByRole('tooltip')).toHaveCount(0)

    await sheet(page).getByLabel('First name').fill('Kai')
    await sheet(page).getByLabel('Last name').fill('Villar')
    await sheet(page).getByLabel('Email').fill('kai.villar@example.com')
    const gender = sheet(page).getByRole('combobox', { name: 'Gender (optional)' })
    await gender.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(gender).toContainText('Female')
    await page.keyboard.press('Enter')
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expect(gender).toContainText('Unisex')
    await sheet(page).getByRole('button', { name: 'Send Invitation', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Invitation sent' })).toBeVisible()
    expect(api.invites[0]).toMatchObject({ gender: 'unisex' })
  })
})

test.describe('invite sheet, dark mode', () => {
  test('the sheet is dark with readable text and the validation message is visible', async ({ page }) => {
    await stubUsersApi(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await open(page, 'staff')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await addStaff(page).click()
    await sheet(page).getByRole('button', { name: 'Send Invitation', exact: true }).click()
    await expect(sheet(page).getByLabel('First name')).toHaveAttribute('aria-invalid', 'true')
    const colours = await sheet(page).evaluate((el) => {
      let bg = getComputedStyle(el).backgroundColor
      for (let node: Element | null = el; node && bg === 'rgba(0, 0, 0, 0)'; node = node.parentElement) bg = getComputedStyle(node).backgroundColor
      return { bg, text: getComputedStyle(el.querySelector('label')!).color }
    })
    expect(luminance(colours.bg)).toBeLessThan(110)
    expect(luminance(colours.text)).toBeGreaterThan(130)
  })
})

test.describe('who may act on whom', () => {
  test('an admin gets actions on staff rows only; the Add buttons offer no role choice, so an admin cannot invite a superadmin', async ({ page }) => {
    const api = await stubUsersApi(page)
    await open(page, 'staff')
    await expect(action(page, 'Deactivate Lara Santos')).toBeVisible()
    await addStaff(page).click()
    // The role is implied by the tab: there is no role field to change.
    await expect(sheet(page).getByLabel(/role/i)).toHaveCount(0)
    await expect(sheet(page).getByRole('combobox', { name: /role/i })).toHaveCount(0)
    await sheet(page).getByRole('button', { name: 'Cancel', exact: true }).click()

    await page.getByRole('tab', { name: 'Admins', exact: true }).click()
    await expect(page.getByText('Alyssa Ferrer').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /reset email|Deactivate|Activate/ })).toHaveCount(0)
    expect(api.deactivations).toEqual([])
  })

  test('a superadmin gets actions on staff and admin rows, and none on the Superadmins tab (so never on their own row)', async ({ page }) => {
    await stubUsersApi(page)
    await open(page, 'staff', SUPERADMIN, '/superadmin')
    await expect(action(page, 'Deactivate Lara Santos')).toBeVisible()
    await page.getByRole('tab', { name: 'Admins', exact: true }).click()
    await expect(action(page, 'Deactivate Alyssa Ferrer')).toBeVisible()
    await page.getByRole('tab', { name: 'Superadmins', exact: true }).click()
    await expect(page.getByText('Alyssa Ferrer').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /reset email|Deactivate|Activate/ })).toHaveCount(0)
  })
})
