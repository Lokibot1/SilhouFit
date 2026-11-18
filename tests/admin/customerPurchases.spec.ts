import { expect, test, type Page } from '@playwright/test'
import { adminOrder, summary } from '../shared/adminOrders'
import { CORS, stubUsersApi, userRow } from './usersApiStub'

// SHF-IMP-3: the Purchases part of the customer details sheet (total spent and order history). GET /users and the rest are stubbed by
// usersApiStub; GET /users/:id/summary and /users/:id/orders are answered here. Sign-in is the dev-only simulated one.
// The "View details of ..." button is on the Customers tab, which is where the sheet opens from for admins.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const KIM = userRow('customer', 'Kim', 'Tan', 31)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

interface Purchases {
  orders: ReturnType<typeof adminOrder>[]
  totalSpent: number
  /** Answer a request yourself: 'summary' or 'orders'. Return a status to fail it, nothing to answer normally. */
  fail?: (kind: 'summary' | 'orders') => number | undefined
  calls: { kind: 'summary' | 'orders'; query: URLSearchParams }[]
}

/** Registered after stubUsersApi so it answers first. The path is /users/<id>/summary|orders, which stubUsersApi's activate/deactivate routes do not match. */
async function stubPurchases(page: Page, opts: Partial<Pick<Purchases, 'orders' | 'totalSpent' | 'fail'>> = {}) {
  const state: Purchases = { orders: [], totalSpent: 0, calls: [], ...opts }
  await page.route(
    (url) => url.port !== '5173' && /^\/users\/[^/]+\/(summary|orders)$/.test(url.pathname),
    async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      const url = new URL(request.url())
      const kind = url.pathname.endsWith('/summary') ? 'summary' : 'orders'
      state.calls.push({ kind, query: url.searchParams })
      const status = state.fail?.(kind)
      if (status) return route.fulfill({ status, headers: CORS, json: { statusCode: status, message: 'Internal server error' } })
      if (kind === 'summary') {
        return route.fulfill({ headers: CORS, json: { userId: KIM.id, orders: { totalSpent: state.totalSpent, totalOrders: state.orders.length, statusCounts: {} } } })
      }
      const limit = Number(url.searchParams.get('limit') ?? 10)
      const pageNo = Number(url.searchParams.get('page') ?? 1)
      const totalPages = Math.ceil(state.orders.length / limit)
      return route.fulfill({
        headers: CORS,
        json: {
          data: state.orders.slice((pageNo - 1) * limit, pageNo * limit).map(summary),
          meta: { total: state.orders.length, page: pageNo, limit, totalPages, hasNextPage: pageNo < totalPages, hasPreviousPage: pageNo > 1 },
        },
      })
    },
  )
  return state
}

async function openKim(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/admin/users?tab=customers')
  await page.getByRole('button', { name: 'View details of Kim Tan' }).filter({ visible: true }).first().click()
  const dialog = page.getByRole('dialog', { name: /Kim Tan/ })
  await expect(dialog).toBeVisible()
  return dialog
}

// Order n is placed at 10:30 AM Manila + n hours.
const paid = (n: number, over: Record<string, unknown> = {}) => adminOrder(n, { status: 'DELIVERED', paymentStatus: 'PAID', totalAmount: 1000 + n, ...over })

test.describe('customer purchases', () => {
  test('shows the total spent and each purchase with a 12-hour time, number, status and amount', async ({ page }) => {
    await stubUsersApi(page)
    const api = await stubPurchases(page, { orders: [paid(5), adminOrder(6, { totalAmount: 2500 })], totalSpent: 1005 })
    const dialog = await openKim(page)

    await expect(dialog.getByText('Total spent')).toBeVisible()
    await expect(dialog.getByText('Total spent').locator('xpath=following-sibling::span')).toHaveText('₱1,005.00')
    await expect(dialog.getByText(/2 orders\./)).toBeVisible()

    const rows = dialog.getByRole('list', { name: 'Purchases, newest first' }).getByRole('listitem')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('Oct 1, 2026, 3:30 PM')
    await expect(rows.nth(0)).toContainText('SHF-20261001-000005')
    await expect(rows.nth(0)).toContainText('Delivered')
    await expect(rows.nth(0)).toContainText('₱1,005.00')
    await expect(rows.nth(1)).toContainText('Oct 1, 2026, 4:30 PM')
    await expect(rows.nth(1)).toContainText('Awaiting payment')
    await expect(rows.nth(1)).toContainText('₱2,500.00')
    await expect(dialog.getByText(/\b(1[3-9]|2[0-3]):\d\d\b/)).toHaveCount(0)

    expect(api.calls.map((c) => c.kind).sort()).toEqual(['orders', 'summary'])
    expect(api.calls.find((c) => c.kind === 'orders')!.query.get('limit')).toBe('10')
  })

  test('a failed load shows what went wrong and Retry loads it; the other part stays', async ({ page }) => {
    await stubUsersApi(page)
    let failing = true
    const api = await stubPurchases(page, { orders: [paid(5)], totalSpent: 1005, fail: (kind) => (failing && kind === 'orders' ? 500 : undefined) })
    const dialog = await openKim(page)

    await expect(dialog.getByText('₱1,005.00').first()).toBeVisible()
    await expect(dialog.getByText("We couldn't load the purchases.")).toBeVisible()
    await expect(dialog.getByRole('list', { name: 'Purchases, newest first' })).toHaveCount(0)

    failing = false
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(dialog.getByRole('list', { name: 'Purchases, newest first' }).getByRole('listitem')).toHaveCount(1)
    await expect(dialog.getByText("We couldn't load the purchases.")).toHaveCount(0)
    expect(api.calls.filter((c) => c.kind === 'orders')).toHaveLength(2)
  })

  test('a failed total shows its own error and Retry', async ({ page }) => {
    await stubUsersApi(page)
    let failing = true
    await stubPurchases(page, { orders: [paid(5)], totalSpent: 1005, fail: (kind) => (failing && kind === 'summary' ? 500 : undefined) })
    const dialog = await openKim(page)

    await expect(dialog.getByText("We couldn't load the total spent.")).toBeVisible()
    await expect(dialog.getByRole('list', { name: 'Purchases, newest first' }).getByRole('listitem')).toHaveCount(1)
    failing = false
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(dialog.getByText('Total spent')).toBeVisible()
    await expect(dialog.getByText('₱1,005.00').first()).toBeVisible()
  })

  test('a customer with no orders shows ₱0.00 and the empty note', async ({ page }) => {
    await stubUsersApi(page)
    await stubPurchases(page)
    const dialog = await openKim(page)

    await expect(dialog.getByText('₱0.00')).toBeVisible()
    await expect(dialog.getByText('0 orders.')).toBeVisible()
    await expect(dialog.getByText(/No purchases yet/)).toBeVisible()
    await expect(dialog.getByRole('navigation', { name: /pag/i })).toHaveCount(0)
  })

  test('paging asks for page 2 and shows its rows', async ({ page }) => {
    await stubUsersApi(page)
    // Newest first: the API's order is what is shown, so number them 12 down to 1.
    const orders = Array.from({ length: 12 }, (_, i) => paid(12 - i))
    const api = await stubPurchases(page, { orders, totalSpent: 12_078 })
    const dialog = await openKim(page)

    const rows = dialog.getByRole('list', { name: 'Purchases, newest first' }).getByRole('listitem')
    await expect(rows).toHaveCount(10)
    await expect(dialog.getByText('Page 1 of 2')).toBeVisible()
    await expect(rows.first()).toContainText('SHF-20261001-000012')

    await dialog.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(dialog.getByText('Page 2 of 2')).toBeVisible()
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toContainText('SHF-20261001-000002')
    await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
    expect(api.calls.filter((c) => c.kind === 'orders').map((c) => c.query.get('page'))).toEqual(['1', '2'])
    // Total spent is not asked for again when only the page changes.
    expect(api.calls.filter((c) => c.kind === 'summary')).toHaveLength(1)
  })

  test('there is no horizontal scroll at 320px, in the page or the sheet', async ({ page }) => {
    await stubUsersApi(page)
    await stubPurchases(page, { orders: Array.from({ length: 12 }, (_, i) => paid(12 - i, { totalAmount: 1_234_567.89 })), totalSpent: 14_814_814.68 })
    await page.setViewportSize({ width: 320, height: 640 })
    const dialog = await openKim(page)
    await expect(dialog.getByRole('list', { name: 'Purchases, newest first' }).getByRole('listitem')).toHaveCount(10)

    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
  })

  test('dark mode renders the purchases with readable text on a dark sheet', async ({ page }) => {
    await stubUsersApi(page)
    await stubPurchases(page, { orders: [paid(5)], totalSpent: 1005 })
    await page.emulateMedia({ colorScheme: 'dark' })
    const dialog = await openKim(page)
    await expect(page.locator('html')).toHaveClass(/dark/)

    const total = dialog.getByText('₱1,005.00').first()
    await expect(total).toBeVisible()
    const luminance = (css: string) => {
      const [r, g, b] = (css.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const colours = await total.evaluate((el) => {
      let bg = 'rgba(0, 0, 0, 0)'
      for (let node: Element | null = el; node && bg === 'rgba(0, 0, 0, 0)'; node = node.parentElement) bg = getComputedStyle(node).backgroundColor
      return { bg, text: getComputedStyle(el).color }
    })
    expect(luminance(colours.bg)).toBeLessThan(110)
    expect(luminance(colours.text)).toBeGreaterThan(150)
  })
})
