import { expect, test, type Page } from '@playwright/test'
import { stubUsersApi, SAMPLE_USERS } from './usersApiStub'

// Every page that still reads placeholder data says "Sample data" next to its title; the pages that are connected to the backend (the User
// Management tabs, the Messages dropdown) must not. Sign-in is the dev-only simulated one. Runs in the desktop and mobile projects.

const STAFF = { email: 'sam.reyes@silhoufit.dev', password: 'Staff@12345' }
const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }

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

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const badge = (page: Page) => page.getByText('Sample data', { exact: true })

const BADGED = [
  [STAFF, /\/staff$/, '/staff', 'Hello'],
  [STAFF, /\/staff$/, '/staff/transactions', 'Transactions'],
  [STAFF, /\/staff$/, '/staff/online-orders', 'Online orders'],
  [ADMIN, /\/admin$/, '/admin', 'Hello'],
  [ADMIN, /\/admin$/, '/admin/activity-logs', 'Activity logs'],
  [ADMIN, /\/admin$/, '/admin/ar-insights', 'AR Fitting Insights'],
  [ADMIN, /\/admin$/, '/admin/refunds', 'Returns & Refunds'],
  [ADMIN, /\/admin$/, '/admin/promotions', 'Pricing & Promotions'],
  [SUPERADMIN, /\/superadmin$/, '/superadmin/permissions', 'Permissions'],
] as const

for (const [who, home, path, title] of BADGED) {
  test(`${path} says Sample data next to its title`, async ({ page }) => {
    await signIn(page, who, home)
    await page.goto(path)
    const heading = page.getByRole('heading', { level: 1, name: title })
    await expect(heading).toBeVisible({ timeout: 20_000 })
    await expect(badge(page)).toHaveCount(1)
    await expect(badge(page)).toBeVisible()
    expect(await overflow(page)).toBe(0)
  })
}

test('the custom sizings section, not the base sizes, says Sample data', async ({ page }) => {
  await signIn(page, STAFF, /\/staff$/)
  await page.goto('/staff/measurements')
  const custom = page.getByRole('region', { name: 'Custom sizings' })
  await expect(custom.getByText('Sample data', { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(badge(page)).toHaveCount(1)
})

test('stays inside a 320px screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await signIn(page, ADMIN, /\/admin$/)
  for (const path of ['/admin/activity-logs', '/admin/refunds']) {
    await page.goto(path)
    await expect(badge(page)).toBeVisible({ timeout: 20_000 })
    expect(await overflow(page)).toBe(0)
  }
})

test.describe('connected pages have no badge', () => {
  test('every User Management tab', async ({ page }) => {
    await stubUsersApi(page, SAMPLE_USERS)
    await signIn(page, SUPERADMIN, /\/superadmin$/)
    for (const tab of ['customers', 'staff', 'admins', 'superadmins']) {
      await page.goto(`/superadmin/users?tab=${tab}`)
      await expect(page.getByRole('tab', { name: new RegExp('^' + tab + '$', 'i') })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
      await expect(badge(page)).toHaveCount(0)
    }
  })

  test('the Messages dropdown', async ({ page }) => {
    await stubUsersApi(page, SAMPLE_USERS)
    await signIn(page, ADMIN, /\/admin$/)
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { level: 1, name: 'User management' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /^Messages/ }).first().click()
    await expect(page.getByRole('dialog', { name: 'Conversations' })).toBeVisible()
    await expect(badge(page)).toHaveCount(0)
  })
})
