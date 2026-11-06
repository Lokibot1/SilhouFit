import { expect, test, type Page } from '@playwright/test'
import { stubAdminApi } from './adminApiStub'
import { stubSuperadminApi } from './superadminApiStub'
import { json, stubStaffApi, type StaffStub } from './staffApiStub'

// Staff "Reset password" beyond the block in staffTab.spec.ts: focus handling, pending state per row, toasts, both roles, 320px, dark mode,
// and the other tabs (Admins' reset is superadmin only, in adminReset.spec.ts; Superadmins and Customers have none).
// The API is stubbed (staffApiStub.ts); sign-in is the dev-only simulated one.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function open(page: Page, who = ADMIN, path = '/admin/users?tab=staff', tab = 'Staff') {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(who.email)
  await page.getByLabel('Password', { exact: true }).fill(who.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/(admin|superadmin)$/)
  await page.goto(path)
  await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const lock = (page: Page, name = 'Lara Santos') => page.getByRole('button', { name: `Reset password for ${name}` }).filter({ visible: true }).first()
const dialog = (page: Page, name = 'Lara Santos') => page.getByRole('dialog', { name: `Reset password for ${name}?` })
const confirm = (page: Page) => page.getByRole('dialog').getByRole('button', { name: 'Reset Password', exact: true })
const toasts = (page: Page) => page.getByRole('button', { name: 'Dismiss notification' })
const SUCCESS = (name: string) => `Password reset for ${name}. They are signed out and must sign in with the default password.`

test.describe('staff reset: dialog focus and keyboard', () => {
  let api: StaffStub
  test.beforeEach(async ({ page }) => {
    api = await stubStaffApi(page)
    await open(page)
    await expect(lock(page)).toBeVisible({ timeout: 20_000 })
  })

  test('focus returns to the row reset button after Cancel', async ({ page }) => {
    await lock(page, 'Miguel Cruz').click()
    await expect(dialog(page, 'Miguel Cruz')).toBeVisible()
    await dialog(page, 'Miguel Cruz').getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page, 'Miguel Cruz')).toBeHidden()
    await expect(lock(page, 'Miguel Cruz')).toBeFocused()
    expect(api.resets).toEqual([])
  })

  test('focus returns to the row reset button after Escape', async ({ page }) => {
    await lock(page, 'Nina Reyes').click()
    await expect(dialog(page, 'Nina Reyes')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page, 'Nina Reyes')).toBeHidden()
    await expect(lock(page, 'Nina Reyes')).toBeFocused()
  })

  test('Tab and Shift+Tab stay inside the dialog', async ({ page }) => {
    await lock(page).click()
    const ask = dialog(page)
    await expect(ask).toBeVisible()
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      expect(await inside()).toBe(true)
    }
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await inside()).toBe(true)
    }
    // Both buttons are reachable by keyboard and Enter confirms.
    await ask.getByRole('button', { name: 'Reset Password', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText(SUCCESS('Lara Santos')).first()).toBeVisible()
    expect(api.resets).toHaveLength(1)
  })

  test('while one reset is pending only that row is disabled', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    api.onReset = async () => {
      await gate
    }
    await lock(page, 'Miguel Cruz').click()
    await confirm(page).click()
    await expect(lock(page, 'Miguel Cruz')).toBeDisabled()
    await expect(lock(page, 'Lara Santos')).toBeEnabled()
    await expect(lock(page, 'Nina Reyes')).toBeEnabled()
    release()
    await expect(lock(page, 'Miguel Cruz')).toBeEnabled()
  })
})

test.describe('staff reset: toasts', () => {
  let api: StaffStub
  test.beforeEach(async ({ page }) => {
    api = await stubStaffApi(page)
    await open(page)
    await expect(lock(page)).toBeVisible({ timeout: 20_000 })
  })

  test('the success toast goes away by itself after about 4.5 seconds', async ({ page }) => {
    await lock(page).click()
    await confirm(page).click()
    const toast = page.getByText(SUCCESS('Lara Santos')).first()
    await expect(toast).toBeVisible()
    const shown = Date.now()
    await expect(toast).toBeHidden({ timeout: 8_000 })
    const lived = Date.now() - shown
    expect(lived).toBeGreaterThanOrEqual(3_500)
    expect(lived).toBeLessThanOrEqual(6_500)
  })

  test('a second result replaces the first toast instead of stacking', async ({ page }) => {
    await lock(page).click()
    await confirm(page).click()
    await expect(page.getByText(SUCCESS('Lara Santos')).first()).toBeVisible()
    await expect(toasts(page)).toHaveCount(1)

    api.onReset = (route) => json(route, 503, {}).then(() => true)
    await lock(page, 'Miguel Cruz').click()
    await confirm(page).click()
    await expect(page.getByText(/Couldn't reset the password for Miguel Cruz\./).first()).toBeVisible()
    await expect(toasts(page)).toHaveCount(1) // never two at once
    await expect(page.getByText(SUCCESS('Lara Santos'))).toHaveCount(0)
  })

  test('the toast can be dismissed with its button', async ({ page }) => {
    await lock(page).click()
    await confirm(page).click()
    await expect(toasts(page)).toHaveCount(1)
    await toasts(page).click()
    await expect(toasts(page)).toHaveCount(0)
  })
})

test.describe('staff reset: roles and layout', () => {
  test('an admin can reset a staff password', async ({ page }) => {
    const api = await stubStaffApi(page)
    await open(page, ADMIN, '/admin/users?tab=staff')
    await lock(page).click()
    await confirm(page).click()
    await expect(page.getByText(SUCCESS('Lara Santos')).first()).toBeVisible()
    expect(api.resets).toEqual([api.rows[0].id])
  })

  test('a superadmin can reset a staff password on /superadmin/users', async ({ page }) => {
    const api = await stubStaffApi(page)
    await open(page, SUPERADMIN, '/superadmin/users?tab=staff')
    await lock(page, 'Nina Reyes').click()
    await expect(dialog(page, 'Nina Reyes')).toBeVisible()
    await confirm(page).click()
    await expect(page.getByText(SUCCESS('Nina Reyes')).first()).toBeVisible()
    expect(api.resets).toEqual([api.rows[2].id])
  })

  test('at 320px the action is a 44px target, the dialog fits and nothing scrolls sideways', async ({ page }) => {
    await stubStaffApi(page)
    await page.setViewportSize({ width: 320, height: 640 })
    await open(page)
    await expect(lock(page)).toBeVisible({ timeout: 20_000 })
    const box = await lock(page).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320)
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0) // settles after the list's entrance

    await lock(page).click()
    const ask = dialog(page)
    await expect(ask).toBeVisible()
    const panel = await ask.boundingBox()
    expect(panel!.x).toBeGreaterThanOrEqual(0)
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(320)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    for (const name of ['Cancel', 'Reset Password']) {
      // Polled: the dialog is still scaling in just after it opens (43.93px mid-animation).
      await expect.poll(async () => (await ask.getByRole('button', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    await confirm(page).click()
    await expect(page.getByText(SUCCESS('Lara Santos')).first()).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })

  test('dark mode: the dialog and the toast render and nothing overflows', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await stubStaffApi(page)
    await open(page)
    await expect(lock(page)).toBeVisible({ timeout: 20_000 })
    await lock(page).click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByText('Are you sure?')).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await confirm(page).click()
    await expect(page.getByText(SUCCESS('Lara Santos')).first()).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('other tabs are unchanged', () => {
  test('Admins: only a superadmin has a reset action (see adminReset.spec.ts), and it never calls the staff reset API', async ({ page }) => {
    const api = await stubStaffApi(page)
    await stubAdminApi(page)
    await open(page, SUPERADMIN, '/superadmin/users?tab=admins', 'Admins')
    await expect(lock(page, 'Brian Dijamco')).toBeVisible({ timeout: 20_000 })
    await lock(page, 'Brian Dijamco').click()
    await confirm(page).click()
    await expect(page.getByText(SUCCESS('Brian Dijamco')).first()).toBeVisible()
    expect(api.resets).toEqual([])
  })

  test('Superadmins has no row actions', async ({ page }) => {
    await stubStaffApi(page)
    await stubSuperadminApi(page)
    await open(page, SUPERADMIN, '/superadmin/users?tab=superadmins', 'Superadmins')
    await expect(page.getByRole('tabpanel').getByRole('row').nth(1).or(page.getByRole('tabpanel').getByRole('listitem').first())).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: /Reset password|Archive|Restore/ })).toHaveCount(0)
  })

  test('Customers has no row actions', async ({ page }) => {
    await stubStaffApi(page)
    await open(page, ADMIN, '/admin/users?tab=customers', 'Customers')
    await expect(page.getByRole('tabpanel').getByRole('button').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: /Reset password|Archive|Restore/ })).toHaveCount(0)
  })
})
