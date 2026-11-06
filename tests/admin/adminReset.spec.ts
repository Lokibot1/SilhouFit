import { expect, test, type Page } from '@playwright/test'
import { stubAdminApi, type AdminStub } from './adminApiStub'
import { json, stubStaffApi } from './staffApiStub'

// Admin "Reset password" on the Admins tab: superadmin only. The API is stubbed (adminApiStub.ts); sign-in is the dev-only simulated one.
// Runs in the desktop (table) and mobile (cards) projects.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function open(page: Page, who = SUPERADMIN, path = '/superadmin/users?tab=admins') {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(who.email)
  await page.getByLabel('Password', { exact: true }).fill(who.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/(admin|superadmin)$/)
  await page.goto(path)
  await expect(page.getByRole('tab', { name: 'Admins', exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
}

// The superadmin's four summary cards already make the whole page 33px wider than 320px on every tab (also Customers), so at 320px the check is on the tab's own panel.
const panelOverflow = (page: Page) => page.getByRole('tabpanel').evaluate((el) => el.scrollWidth - el.clientWidth)
const lock = (page: Page, name = 'Brian Dijamco') => page.getByRole('button', { name: `Reset password for ${name}` }).filter({ visible: true }).first()
const dialog = (page: Page, name = 'Brian Dijamco') => page.getByRole('dialog', { name: `Reset password for ${name}?` })
const confirm = (page: Page) => page.getByRole('dialog').getByRole('button', { name: 'Reset Password', exact: true })
const toasts = (page: Page) => page.getByRole('button', { name: 'Dismiss notification' })
const SUCCESS = (name: string) => `Password reset for ${name}. They are signed out and must sign in with the default password.`

test.describe('who sees the admin reset', () => {
  test('an admin on /admin/users?tab=admins sees no row actions and no Actions column', async ({ page }) => {
    await stubAdminApi(page)
    await open(page, ADMIN, '/admin/users?tab=admins')
    await expect(page.getByRole('tabpanel').getByText('Brian Dijamco', { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: /Reset password|Archive|Restore/ })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0)
  })

  test('a superadmin sees a Reset action on every row, and the staff reset API is never called', async ({ page }) => {
    const staff = await stubStaffApi(page)
    await stubAdminApi(page)
    await open(page)
    await expect(lock(page)).toBeVisible({ timeout: 20_000 })
    await expect(lock(page, 'Alyssa Ferrer')).toBeVisible()
    await expect(lock(page, 'Carlo Mendoza')).toBeVisible()
    expect(staff.resets).toEqual([])
  })
})

test.describe('resetting an admin password', () => {
  let api: AdminStub
  test.beforeEach(async ({ page }) => {
    api = await stubAdminApi(page)
    await open(page)
    await expect(lock(page)).toBeVisible({ timeout: 20_000 })
  })

  test('has a 44px lock action per row, with the shared tooltip (never a native title), and no horizontal scroll', async ({ page }) => {
    const box = await lock(page).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    await expect.poll(() => panelOverflow(page)).toBeLessThanOrEqual(0) // settles after the list's entrance
    await expect(lock(page)).not.toHaveAttribute('title', /.+/)
    await lock(page).focus()
    const tip = page.getByRole('tooltip').filter({ hasText: 'Reset password for Brian Dijamco' })
    await expect(tip).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tip).toHaveCount(0)
  })

  test('asks first with the admin wording, cancels without sending anything, and Escape does the same', async ({ page }) => {
    await lock(page).click()
    const ask = dialog(page)
    await expect(ask).toBeVisible()
    await expect(ask.getByText('Are you sure?')).toBeVisible()
    await expect(ask.getByText(/default password 1234567a and they will be signed out everywhere.*tell them to change it right away/)).toBeVisible()
    await expect(confirm(page)).toBeVisible()
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(ask).toBeHidden()
    await expect(lock(page)).toBeFocused()
    await lock(page).click()
    await page.keyboard.press('Escape')
    await expect(ask).toBeHidden()
    expect(api.resets).toEqual([])
  })

  test('confirming waits, sends one request for that admin, and shows the success toast without credentials', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    api.onReset = async () => {
      await gate
    }
    await lock(page, 'Alyssa Ferrer').click()
    await confirm(page).dblclick()
    await expect(confirm(page)).toBeDisabled()
    await expect(confirm(page)).toHaveAttribute('aria-busy', 'true')
    await expect(lock(page, 'Alyssa Ferrer')).toBeDisabled()
    await expect(lock(page, 'Brian Dijamco')).toBeEnabled()
    expect(api.resets).toEqual([api.rows[1].id])
    release()
    await expect(page.getByText(SUCCESS('Alyssa Ferrer')).first()).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('1234567a')).toHaveCount(0)
    await expect(toasts(page)).toHaveCount(1)
    expect(api.resets).toHaveLength(1)
  })

  for (const [label, status, body, copy, retry] of [
    ['403 forbidden', 403, { code: 'forbidden' }, /Only a superadmin can reset admin passwords/, false],
    ['403 not an admin account', 403, { code: 'not_an_admin_account' }, /is not an admin account, so it can't be reset here\. Refresh the list\./, false],
    ['401', 401, { message: 'Unauthorized' }, /Your session expired\. Sign in again, then retry\./, false],
    ['404', 404, { code: 'admin_not_found' }, /This admin account no longer exists/, false],
    ['422', 422, { code: 'weak_password' }, /rejected the default password/, false],
    ['429', 429, {}, /Wait a few minutes/, false],
    ['502 reset_not_applied', 502, { code: 'reset_not_applied' }, /nothing changed/, true],
    ['502 reset_incomplete', 502, { code: 'reset_incomplete' }, /may already be reset to the default.*safe to repeat/, true],
    ['500', 500, {}, /couldn't confirm the result.*Retry is safe/, true],
  ] as const) {
    test(`explains a ${label} answer${retry ? ' and offers Retry' : ''}`, async ({ page }) => {
      api.onReset = (route) => json(route, status, body).then(() => true)
      await lock(page).click()
      await confirm(page).click()
      await expect(page.getByText(copy).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(retry ? 1 : 0)
      await expect(lock(page)).toBeEnabled()
    })
  }

  test('a dropped connection says the result is unknown and offers Retry', async ({ page }) => {
    api.onReset = (route) => route.abort('failed').then(() => true)
    await lock(page).click()
    await confirm(page).click()
    await expect(page.getByText(/couldn't confirm the result/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(1)
  })

  test('Retry asks again and the second attempt succeeds', async ({ page }) => {
    let first = true
    api.onReset = (route) => {
      if (!first) return false
      first = false
      return json(route, 503, {}).then(() => true)
    }
    await lock(page).click()
    await confirm(page).click()
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await confirm(page).click()
    await expect(page.getByText(/Password reset for Brian Dijamco\./).first()).toBeVisible()
    expect(api.resets).toHaveLength(2)
  })

  test('a 404 reloads the list so the vanished admin is not left on screen', async ({ page }) => {
    api.onReset = (route) => json(route, 404, { code: 'admin_not_found' }).then(() => true)
    const loads = api.gets.length
    await lock(page).click()
    await confirm(page).click()
    await expect(page.getByText(/no longer exists/).first()).toBeVisible()
    await expect.poll(() => api.gets.length).toBeGreaterThan(loads)
  })
})

test('at 320px the action is a 44px target, the dialog fits and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await stubAdminApi(page)
  await open(page)
  await expect(lock(page)).toBeVisible({ timeout: 20_000 })
  const box = await lock(page).boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  await expect.poll(() => panelOverflow(page)).toBeLessThanOrEqual(0)

  await lock(page).click()
  const ask = dialog(page)
  await expect(ask).toBeVisible()
  const panel = await ask.boundingBox()
  expect(panel!.x).toBeGreaterThanOrEqual(0)
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(320)
  expect(await panelOverflow(page)).toBeLessThanOrEqual(0)
  for (const name of ['Cancel', 'Reset Password']) {
    await expect.poll(async () => (await ask.getByRole('button', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await confirm(page).click()
  await expect(page.getByText(SUCCESS('Brian Dijamco')).first()).toBeVisible()
  expect(await panelOverflow(page)).toBeLessThanOrEqual(0)
})
