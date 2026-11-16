import { expect, test, type Page } from '@playwright/test'
import { stubUsersApi } from './usersApiStub'

// User Management is an admin-only page: the API refuses staff on every /users call, so a superadmin cannot grant it to staff, and a stored
// grant (an old save, or an edited localStorage) is ignored. Permissions are kept in localStorage 'silhoufit.permissions.v1'.
// Sign-in is the dev-only simulated one. Runs in the desktop and mobile projects.

const STAFF = { email: 'sam.reyes@silhoufit.dev', password: 'Staff@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }
const PERMISSIONS_KEY = 'silhoufit.permissions.v1'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function signIn(page: Page, { email, password }: { email: string; password: string }, home: RegExp) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(home)
}

test.describe('superadmin permissions page', () => {
  test('staff has no User Management switch, while admins keep theirs', async ({ page }) => {
    await signIn(page, SUPERADMIN, /\/superadmin$/)
    await page.goto('/superadmin/permissions')
    const staff = page.getByRole('region', { name: 'Staff' })
    const admin = page.getByRole('region', { name: 'Admin' })
    await expect(staff.getByText('Inventory', { exact: true })).toBeVisible()
    await expect(staff.getByText('User Management', { exact: true })).toHaveCount(0)
    await expect(staff.getByRole('switch', { name: /user management/i })).toHaveCount(0)
    await expect(staff.getByText('User management', { exact: true })).toHaveCount(0)
    await expect(admin.getByText('User Management', { exact: true })).toBeVisible()
  })

  test('Select all for staff never saves user-management', async ({ page }) => {
    await signIn(page, SUPERADMIN, /\/superadmin$/)
    await page.goto('/superadmin/permissions')
    const staff = page.getByRole('region', { name: 'Staff' })
    await staff.getByText('Select all').click()
    await staff.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Staff permissions saved')).toBeVisible()
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!) as { staff: string[] }, PERMISSIONS_KEY)
    expect(saved.staff.length).toBeGreaterThan(0)
    expect(saved.staff).not.toContain('user-management')
  })

  test('no horizontal scroll', async ({ page }) => {
    await signIn(page, SUPERADMIN, /\/superadmin$/)
    await page.goto('/superadmin/permissions')
    await expect(page.getByRole('heading', { level: 1, name: 'Permissions' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  })
})

test.describe('staff with a stored User Management grant', () => {
  test.beforeEach(async ({ page }) => {
    await stubUsersApi(page)
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ staff: ['inventory', 'user-management'] })), PERMISSIONS_KEY)
  })

  test('does not see the nav item and is sent back to the staff dashboard from /admin/users', async ({ page }) => {
    await signIn(page, STAFF, /\/staff$/)
    await expect(page.getByRole('link', { name: 'User Management' })).toHaveCount(0)

    await page.goto('/admin/users')
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByText('That page is turned off for your role. Ask a superadmin if you need it.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Accounts at a glance' })).toHaveCount(0)
  })

  test('keeps the pages that are still granted', async ({ page }) => {
    await signIn(page, STAFF, /\/staff$/)
    await page.goto('/staff/inventory')
    await expect(page).toHaveURL(/\/staff\/inventory$/)
  })
})
