import { expect, test, type Page } from '@playwright/test'
import { manyAdminOrders, mockAdminOrders } from '../shared/adminOrders'
import { manyAuditLogs, mockAuditLogs } from '../shared/auditLogs'
import { FAQS, mockFaqs } from '../shared/faqs'
import { mockProductMetrics } from '../shared/products'
import { stubUsersApi, SAMPLE_USERS } from './usersApiStub'

// Every page that still reads placeholder data says "Sample data" next to its title (the /staff and /admin dashboards are connected apart from their
// Refunds card, so it carries the badge instead; AR-ready and Low or out of stock read the backend); the pages that are connected to the backend (the User
// Management tabs, the Messages dropdown, Online orders, Activity logs, Help Chatbot) must not. Sign-in is the dev-only simulated one. Runs in the desktop and mobile projects.

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
  [STAFF, /\/staff$/, '/staff/transactions', 'Transactions'],
  [ADMIN, /\/admin$/, '/admin/ar-insights', 'AR Fitting Insights'],
  [ADMIN, /\/admin$/, '/admin/refunds', 'Returns & Refunds'],
  [ADMIN, /\/admin$/, '/admin/promotions', 'Pricing & Promotions'],
  [ADMIN, /\/admin$/, '/admin/pickup-location', 'Pickup location'],
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

for (const [who, home, path] of [
  [STAFF, /\/staff$/, '/staff'],
  [ADMIN, /\/admin$/, '/admin'],
] as const) {
  test(`${path} says Sample data inside its refunds card only, not next to the title`, async ({ page }) => {
    // The dashboards' connected sections call the API, which the dev accounts have no token for, so they are stubbed.
    await mockAdminOrders(page, manyAdminOrders(1))
    await mockAuditLogs(page, [])
    await mockProductMetrics(page)
    await page.route(
      (url) => url.origin !== 'http://localhost:5173' && url.pathname.startsWith('/analytics/'),
      (route) => {
        const { pathname } = new URL(route.request().url())
        const json = pathname.endsWith('/summary')
          ? { arSessions: 0, salesTotal: 0, orderCount: 0, unitsSold: 0, aov: 0, arChange: null, salesChange: null, ordersChange: null, periodStart: '2026-11-01', periodEnd: '2026-11-19' }
          : []
        return route.fulfill({ json, headers: { 'access-control-allow-origin': '*' } })
      },
    )
    await signIn(page, who, home)
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: 'Hello' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('region', { name: 'Refunds, AR and stock at a glance' }).getByText('Sample data', { exact: true })).toHaveCount(1)
    await expect(badge(page)).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 }).locator('..').getByText('Sample data')).toHaveCount(0)
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
  for (const path of ['/admin/refunds']) {
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

  test('Online orders', async ({ page }) => {
    await mockAdminOrders(page, manyAdminOrders(2))
    await signIn(page, STAFF, /\/staff$/)
    await page.goto('/staff/online-orders')
    await expect(page.getByRole('heading', { level: 1, name: 'Online orders' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: manyAdminOrders(2)[1].orderNumber })).toBeVisible()
    await expect(badge(page)).toHaveCount(0)
  })

  test('Activity logs', async ({ page }) => {
    await mockAuditLogs(page, manyAuditLogs(2))
    await signIn(page, ADMIN, /\/admin$/)
    await page.goto('/admin/activity-logs')
    await expect(page.getByRole('heading', { level: 1, name: 'Activity logs' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('list', { name: 'Logged actions' }).getByRole('listitem')).toHaveCount(2)
    await expect(badge(page)).toHaveCount(0)
  })

  test('Help Chatbot', async ({ page }) => {
    await mockFaqs(page, FAQS)
    await signIn(page, ADMIN, /\/admin$/)
    await page.goto('/admin/chatbot')
    await expect(page.getByText(FAQS[0].question).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
    await expect(badge(page)).toHaveCount(0)
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
