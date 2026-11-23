import { expect, test, type Locator, type Page } from '@playwright/test'
import { manyAdminOrders, mockAdminOrders } from '../shared/adminOrders'
import { mockAuditLogs } from '../shared/auditLogs'
import { mockNotifications } from '../shared/notificationsApi'
import { manyAdminTransactions, mockAdminTransactions } from '../shared/adminTransactions'
import { mockCart, mockProductMetrics, mockProducts, type ProductMetricsMock } from '../shared/products'

// The /staff and /admin dashboards read GET /analytics/summary, /sales, /product-mix and /trending. Those are stubbed here (deterministic, not the live API),
// as are the other calls the dashboards make (Recent orders on /admin/orders, Activity logs on the admin page), because the dev simulated accounts have no
// Supabase token. AR-ready and Low or out of stock read GET /products/metrics (stubbed too, one shared request) and the Refunds card reads GET /admin/refunds/metrics with GET /admin/orders/metrics (stubbed), so no card is sample data. Sign-in is the dev-only simulated one.

const STAFF = { email: 'sam.reyes@silhoufit.dev', password: 'Staff@12345' }
const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const PAGES = [
  { name: 'staff', who: STAFF, home: /\/staff$/, path: '/staff' },
  { name: 'admin', who: ADMIN, home: /\/admin$/, path: '/admin' },
] as const

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const PAGE_ORIGIN = 'http://localhost:5173'

type Endpoint = 'summary' | 'sales' | 'product-mix' | 'trending'
const THIS_YEAR = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date()))

const SUMMARY = { arSessions: 18, salesTotal: 125000, orderCount: 42, unitsSold: 97, aov: 2976.19, arChange: 12.5, salesChange: -3.2, ordersChange: null, periodStart: `${THIS_YEAR}-11-01`, periodEnd: `${THIS_YEAR}-11-19` }
const SALES = [
  { date: `${THIS_YEAR}-01-01`, total: 40000 },
  { date: `${THIS_YEAR}-02-01`, total: 0 },
  { date: `${THIS_YEAR}-03-01`, total: 85000 },
]
const MIX = [
  { category: 'Polo Shirts', units: 50 },
  { category: 'Dresses', units: 30 },
  { category: 'Jackets', units: 17 },
]
const TRENDING = [
  { productId: 'p1', name: 'Heritage Polo', category: 'Polo Shirts', orders: 12, stock: 40, arConversion: 25 },
  { productId: 'p2', name: 'Linen Dress', category: 'Dresses', orders: 9, stock: 3, arConversion: null },
  { productId: 'p3', name: 'Denim Jacket', category: 'Jackets', orders: 4, stock: 0, arConversion: 50 },
]

interface Analytics {
  /** The query string of every request, per endpoint, in order. */
  calls: Record<Endpoint, URLSearchParams[]>
  /** The body each endpoint answers. Set to [] for the empty state. */
  data: { summary: unknown; sales: unknown; 'product-mix': unknown; trending: unknown }
  /** Fail an endpoint: a status (and headers), or undefined to answer normally. */
  fail: Partial<Record<Endpoint, { status: number; headers?: Record<string, string> } | undefined>>
}

async function stubAnalytics(page: Page): Promise<Analytics> {
  const stub: Analytics = {
    calls: { summary: [], sales: [], 'product-mix': [], trending: [] },
    data: { summary: SUMMARY, sales: SALES, 'product-mix': MIX, trending: TRENDING },
    fail: {},
  }
  await page.route(
    (url) => url.origin !== PAGE_ORIGIN && /^\/analytics\/(summary|sales|product-mix|trending)$/.test(url.pathname),
    async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      const url = new URL(request.url())
      const endpoint = url.pathname.split('/')[2] as Endpoint
      stub.calls[endpoint].push(url.searchParams)
      const failure = stub.fail[endpoint]
      if (failure) return route.fulfill({ status: failure.status, headers: { ...CORS, ...failure.headers }, json: { statusCode: failure.status, message: 'Stubbed failure' } })
      return route.fulfill({ headers: CORS, json: stub.data[endpoint] })
    },
  )
  return stub
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

/** Every other call the dashboards make (the signed-in shell asks for the cart and notifications; Activity logs and Recent orders are on the dashboards). */
async function stubRest(page: Page, orders: number): Promise<ProductMetricsMock> {
  await mockAdminOrders(page, manyAdminOrders(orders))
  await mockAuditLogs(page, [])
  await mockAdminTransactions(page, manyAdminTransactions(3))
  await mockNotifications(page)
  await mockCart(page, await mockProducts(page))
  // After mockProducts: the newest route wins, and mockProducts would read /products/metrics as a product id.
  return mockProductMetrics(page, { outOfStockCount: 2, lowStockCount: 4 })
}

async function open(page: Page, target: (typeof PAGES)[number], { orders = 2 } = {}) {
  const stub = await stubAnalytics(page)
  const metrics = await stubRest(page, orders)
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(target.who.email)
  await page.getByLabel('Password', { exact: true }).fill(target.who.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(target.home)
  await expect(page.getByRole('heading', { level: 1, name: /^Hello/ })).toBeVisible({ timeout: 20_000 })
  return Object.assign(stub, { metrics })
}

const region = (page: Page, name: string | RegExp) => page.getByRole('region', { name })
const cards = (page: Page) => region(page, 'This month at a glance')
const sales = (page: Page) => region(page, 'Sales')
const mix = (page: Page) => region(page, 'Products sold')
const trending = (page: Page) => region(page, 'Trendy items')
const recent = (page: Page) => region(page, 'Recent orders')
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const keys = (params: URLSearchParams) => [...params.keys()].sort()
const retry = (section: Locator) => section.getByRole('button', { name: 'Retry', exact: true })

for (const target of PAGES) {
  test.describe(`${target.name} dashboard`, () => {
    test('shows the stubbed figures and charts', async ({ page }) => {
      await open(page, target)

      await expect(cards(page)).toContainText('AR Fitting Sessions')
      await expect(cards(page)).toContainText('18')
      await expect(cards(page)).toContainText('Sales this month')
      await expect(cards(page)).toContainText('₱125,000')
      await expect(cards(page)).toContainText('Orders this month')
      await expect(cards(page)).toContainText('42')
      await expect(cards(page)).toContainText('Products sold')
      await expect(cards(page)).toContainText('97')
      await expect(cards(page)).toContainText('AOV ₱2,976.19')

      await expect(sales(page).getByRole('img', { name: /^Monthly sales/ })).toHaveAccessibleName(/Peak ₱85,000 in March 2026; total ₱125,000/)

      for (const row of [{ name: 'Polo Shirts', units: '50' }, { name: 'Dresses', units: '30' }, { name: 'Jackets', units: '17' }]) {
        await expect(mix(page).getByRole('button', { name: new RegExp(`^${row.name}\\s*${row.units}`) })).toBeVisible()
      }

      const rows = trending(page).getByRole('listitem')
      await expect(rows).toHaveCount(3)
      await expect(rows.nth(0)).toContainText('Heritage Polo')
      await expect(rows.nth(0)).toContainText('12 orders')
      await expect(rows.nth(0)).toContainText('25% used AR Fitting')
      await expect(rows.nth(1)).toContainText('Linen Dress')
      await expect(rows.nth(1)).toContainText('Low stock · 3 left')
      await expect(rows.nth(1)).toContainText('No AR Fitting')
      await expect(rows.nth(2)).toContainText('Sold out')

      await expect(recent(page).getByRole('listitem')).toHaveCount(2)
    })

    test('asks the API for the right things and nothing else', async ({ page }) => {
      const stub = await open(page, target)
      await expect(trending(page).getByRole('listitem')).toHaveCount(3)

      for (const query of stub.calls.summary) expect(query.size).toBe(0)
      expect(stub.calls.summary.length).toBeGreaterThan(0)

      for (const query of stub.calls.sales) {
        expect(keys(query)).toEqual(['interval', 'year'])
        expect(query.get('interval')).toBe('month')
        expect(query.get('year')).toBe(String(THIS_YEAR))
      }
      for (const name of ['product-mix', 'trending'] as const) {
        expect(stub.calls[name].length).toBeGreaterThan(0)
        for (const query of stub.calls[name]) {
          expect(keys(query)).toEqual(name === 'trending' ? ['from', 'limit', 'to'] : ['from', 'to'])
          expect(query.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
          expect(query.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
          expect(query.get('from')! <= query.get('to')!).toBe(true)
        }
      }
      for (const query of stub.calls.trending) expect(query.get('limit')).toBe('5')
    })

    test('a month picked on Sales asks for that month by day', async ({ page }) => {
      const stub = await open(page, target)
      await expect(sales(page).getByRole('img', { name: /^Monthly sales/ })).toBeVisible()
      const before = stub.calls.sales.length

      await sales(page).getByRole('button', { name: /^Sales filter/ }).click()
      await page.getByRole('combobox', { name: 'Sales month' }).click()
      await page.getByRole('option', { name: 'March', exact: true }).click()

      await expect.poll(() => stub.calls.sales.length).toBeGreaterThan(before)
      const query = stub.calls.sales.at(-1)!
      expect(keys(query)).toEqual(['interval', 'month', 'year'])
      expect(query.get('interval')).toBe('day')
      expect(query.get('month')).toBe('3')
      expect(query.get('year')).toBe(String(THIS_YEAR))
    })

    test('changing a chart filter sends a new request with the new params', async ({ page }) => {
      const stub = await open(page, target)
      await expect(mix(page).getByRole('button', { name: /^Polo Shirts/ })).toBeVisible()
      await expect(trending(page).getByRole('listitem')).toHaveCount(3)
      const mixBefore = stub.calls['product-mix'].length
      const trendingBefore = stub.calls.trending.length
      const salesBefore = stub.calls.sales.length
      const firstMix = stub.calls['product-mix'][0]

      await mix(page).getByRole('radio', { name: 'Year', exact: true }).click()
      await expect.poll(() => stub.calls['product-mix'].length).toBeGreaterThan(mixBefore)
      const yearMix = stub.calls['product-mix'].at(-1)!
      expect(yearMix.get('from')).toBe(`${THIS_YEAR}-01-01`)
      expect(yearMix.get('from')).not.toBe(firstMix.get('from'))
      expect(keys(yearMix)).toEqual(['from', 'to'])

      await trending(page).getByRole('radio', { name: 'Week', exact: true }).click()
      await expect.poll(() => stub.calls.trending.length).toBeGreaterThan(trendingBefore)
      const week = stub.calls.trending.at(-1)!
      expect(keys(week)).toEqual(['from', 'limit', 'to'])
      expect(week.get('limit')).toBe('5')

      await sales(page).getByRole('radio', { name: 'Weekly', exact: true }).click()
      await expect.poll(() => stub.calls.sales.length).toBeGreaterThan(salesBefore)
      expect(stub.calls.sales.at(-1)!.get('interval')).toBe('week')
      // Sales moving on its own leaves the other two cards as they were.
      expect(stub.calls['product-mix'].at(-1)).toBe(yearMix)
    })

    test('a past year on Products sold asks for that year', async ({ page }) => {
      const stub = await open(page, target)
      await expect(mix(page).getByRole('button', { name: /^Polo Shirts/ })).toBeVisible()
      const before = stub.calls['product-mix'].length

      await mix(page).getByRole('combobox', { name: 'Products sold year' }).click()
      await page.getByRole('option', { name: String(THIS_YEAR - 1), exact: true }).click()

      await expect.poll(() => stub.calls['product-mix'].length).toBeGreaterThan(before)
      const query = stub.calls['product-mix'].at(-1)!
      expect(query.get('from')!.startsWith(String(THIS_YEAR - 1))).toBe(true)
      expect(query.get('to')!.startsWith(String(THIS_YEAR - 1))).toBe(true)
    })

    test('a 500 on one section shows its own error while the others render, and Retry recovers', async ({ page }) => {
      const stub = await stubAnalytics(page)
      stub.fail['product-mix'] = { status: 500 }
      await stubRest(page, 2)
      await page.goto('/login')
      await page.getByLabel('Email', { exact: true }).fill(target.who.email)
      await page.getByLabel('Password', { exact: true }).fill(target.who.password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page).toHaveURL(target.home)

      const failed = mix(page).getByRole('alert')
      await expect(failed).toContainText("We couldn't load the products sold.")
      await expect(failed).toContainText('Something went wrong on our side')
      await expect(retry(mix(page))).toBeEnabled()

      // The other sections are untouched.
      await expect(cards(page)).toContainText('₱125,000')
      await expect(sales(page).getByRole('img', { name: /^Monthly sales/ })).toBeVisible()
      await expect(trending(page).getByRole('listitem')).toHaveCount(3)
      await expect(recent(page).getByRole('listitem')).toHaveCount(2)
      await expect(page.getByRole('alert')).toHaveCount(1)

      stub.fail['product-mix'] = undefined
      await retry(mix(page)).click()
      await expect(mix(page).getByRole('button', { name: /^Polo Shirts/ })).toBeVisible()
      await expect(mix(page).getByRole('alert')).toHaveCount(0)
    })

    test('a 429 with Retry-After shows a wait, then Retry recovers', async ({ page }) => {
      const stub = await stubAnalytics(page)
      stub.fail.trending = { status: 429, headers: { 'Retry-After': '3', 'access-control-expose-headers': 'Retry-After' } }
      await stubRest(page, 2)
      await page.goto('/login')
      await page.getByLabel('Email', { exact: true }).fill(target.who.email)
      await page.getByLabel('Password', { exact: true }).fill(target.who.password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page).toHaveURL(target.home)

      const failed = trending(page).getByRole('alert')
      await expect(failed).toContainText("We couldn't load the trendy items.")
      await expect(failed).toContainText('Our servers are limiting requests right now')
      await expect(trending(page).getByRole('button', { name: /^Retry in \ds$/ })).toBeDisabled()
      await expect(cards(page)).toContainText('₱125,000')
      await expect(mix(page).getByRole('button', { name: /^Polo Shirts/ })).toBeVisible()

      stub.fail.trending = undefined
      await expect(retry(trending(page))).toBeEnabled({ timeout: 10_000 })
      await retry(trending(page)).click()
      await expect(trending(page).getByRole('listitem')).toHaveCount(3)
    })

    test('a failing summary and sales keep the rest of the page', async ({ page }) => {
      const stub = await stubAnalytics(page)
      stub.fail.summary = { status: 500 }
      stub.fail.sales = { status: 500 }
      await stubRest(page, 2)
      await page.goto('/login')
      await page.getByLabel('Email', { exact: true }).fill(target.who.email)
      await page.getByLabel('Password', { exact: true }).fill(target.who.password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page).toHaveURL(target.home)

      await expect(cards(page).getByRole('alert')).toContainText("We couldn't load this month's figures.")
      await expect(sales(page).getByRole('alert')).toContainText("We couldn't load the sales chart.")
      await expect(mix(page).getByRole('button', { name: /^Polo Shirts/ })).toBeVisible()
      await expect(trending(page).getByRole('listitem')).toHaveCount(3)

      stub.fail.summary = undefined
      await retry(cards(page)).click()
      await expect(cards(page)).toContainText('₱125,000')
      await expect(sales(page).getByRole('alert')).toBeVisible()
    })

    test('empty answers show the empty states', async ({ page }) => {
      const stub = await stubAnalytics(page)
      stub.data.sales = []
      stub.data['product-mix'] = []
      stub.data.trending = []
      await stubRest(page, 0)
      await page.goto('/login')
      await page.getByLabel('Email', { exact: true }).fill(target.who.email)
      await page.getByLabel('Password', { exact: true }).fill(target.who.password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page).toHaveURL(target.home)

      await expect(sales(page)).toContainText('Sales show here once the first order is placed.')
      await expect(mix(page)).toContainText('The mix shows here once the first order is placed.')
      await expect(trending(page)).toContainText('The most ordered items show here once the first order is placed.')
      await expect(recent(page)).toContainText('No orders yet.')
      await expect(page.getByRole('alert')).toHaveCount(0)
    })

    test('the Refunds card shows the real refund figures, and Sample data appears nowhere', async ({ page }) => {
      await open(page, target)
      const operations = region(page, 'Refunds, AR and stock at a glance')
      await expect(operations.getByRole('link', { name: /^Refunds: / })).toBeVisible()
      await expect(operations.getByText(/% of \d+ payments refunded/)).toBeVisible()
      await expect(page.getByText('Sample data', { exact: true })).toHaveCount(0)
    })

    test('the Low or out of stock card shows out plus low from GET /products/metrics', async ({ page }) => {
      const { metrics } = await open(page, target)
      const card = region(page, 'Refunds, AR and stock at a glance').getByRole('link', { name: /^Low or out of stock: / })
      await expect(card).toContainText('6')
      await expect(card).toContainText('2 out, 4 with 5 or fewer left')
      await expect(card).toHaveAttribute('href', `${target.path}/inventory`)
      expect(metrics.queries).toEqual([{ lowStockThreshold: '5' }])
    })

    test('the AR-ready card shows the AR-ready count from the same single GET /products/metrics', async ({ page }) => {
      const { metrics } = await open(page, target)
      const card = region(page, 'Refunds, AR and stock at a glance').getByRole('link', { name: /^AR-ready products: / })
      await expect(card).toContainText('6')
      await expect(card).toContainText('of 20 products can be tried on')
      await expect(card).toHaveAttribute('href', `${target.path}/inventory?ar=yes`)
      // The stock card and this one share a single request.
      expect(metrics.queries).toEqual([{ lowStockThreshold: '5' }])
    })

    test('a 403 on the product metrics shows the stock and AR-ready cards their own error while the rest renders, and Retry recovers', async ({ page }) => {
      await stubAnalytics(page)
      const metrics = await stubRest(page, 2)
      metrics.fail = { status: 403, times: 1 }
      await page.goto('/login')
      await page.getByLabel('Email', { exact: true }).fill(target.who.email)
      await page.getByLabel('Password', { exact: true }).fill(target.who.password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page).toHaveURL(target.home)

      const operations = region(page, 'Refunds, AR and stock at a glance')
      const failed = operations.getByRole('alert')
      await expect(failed).toHaveCount(2)
      await expect(failed.filter({ hasText: "couldn't load the stock figures" })).toHaveCount(1)
      await expect(failed.filter({ hasText: "couldn't load the AR-ready figures" })).toHaveCount(1)
      await expect(retry(operations).first()).toBeEnabled()

      // The Refunds card and the other sections are untouched.
      await expect(operations.getByRole('link', { name: /^Refunds: / })).toBeVisible()
      await expect(cards(page)).toContainText('₱125,000')
      await expect(sales(page).getByRole('img', { name: /^Monthly sales/ })).toBeVisible()
      await expect(mix(page).getByRole('button', { name: /^Polo Shirts/ })).toBeVisible()
      await expect(trending(page).getByRole('listitem')).toHaveCount(3)
      await expect(recent(page).getByRole('listitem')).toHaveCount(2)

      for (const card of ['stock', 'AR-ready']) await failed.filter({ hasText: `couldn't load the ${card} figures` }).getByRole('button', { name: 'Retry', exact: true }).click()
      await expect(operations.getByRole('link', { name: /^Low or out of stock: / })).toContainText('2 out, 4 with 5 or fewer left')
      await expect(operations.getByRole('link', { name: /^AR-ready products: / })).toContainText('6')
      await expect(page.getByRole('alert')).toHaveCount(0)
      // The first (shared) read failed; each card then asked again on its own Retry.
      expect(metrics.queries.length).toBeGreaterThanOrEqual(2)
    })

    for (const width of [320, 1280]) {
      test(`stays inside a ${width}px screen with no console errors`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        const errors: string[] = []
        page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
        page.on('pageerror', (error) => errors.push(error.message))
        await open(page, target)
        await expect(trending(page).getByRole('listitem')).toHaveCount(3)
        await expect(sales(page).getByRole('img', { name: /^Monthly sales/ })).toBeVisible()
        await expect(mix(page).getByRole('button', { name: /^Polo Shirts/ })).toBeVisible()
        await expect(recent(page).getByRole('listitem')).toHaveCount(2)
        expect(await overflow(page)).toBe(0)
        expect(errors).toEqual([])
      })
    }
  })
}
