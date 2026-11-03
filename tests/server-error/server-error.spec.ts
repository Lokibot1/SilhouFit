import { expect, test, type Page, type Route } from '@playwright/test'

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('silhoufit-theme', t), theme)
    })

    test('/500 shows the custom server error page', async ({ page }) => {
      await page.goto('/500')
      await expect(page.getByRole('heading', { name: /torn at the\s+seams/i })).toBeVisible()
      await expect(page).toHaveTitle(/^500: Torn at the seams/)
    })

    test('has no horizontal scroll and 44px touch targets', async ({ page }) => {
      await page.goto('/500')
      await expect(page.getByRole('heading', { name: /torn at the\s+seams/i })).toBeVisible()
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflows, '/500 overflows horizontally').toBe(false)
      for (const target of [page.getByRole('button', { name: 'Try again' }), page.getByRole('link', { name: 'Back to the main floor' })]) {
        const box = await target.boundingBox()
        expect(box!.height).toBeGreaterThanOrEqual(44)
        expect(box!.width).toBeGreaterThanOrEqual(44)
      }
    })

    test('Back to the main floor goes home', async ({ page }) => {
      await page.goto('/500')
      await page.getByRole('link', { name: 'Back to the main floor' }).click()
      await expect(page).toHaveURL(/\/$/)
    })
  })
}

// Feature "System – Health check" (GET /): the 500 page's "Check service status" asks the API whether it is up.
test.describe('System – Health check', () => {
  const REACHABLE = 'The service is reachable. Try the page again.'
  const UNREACHABLE = "The service can't be reached right now. Wait a moment, then check again."

  /** Answers GET / on the API (never the app's own origin) with `reply`, counting the requests. */
  async function mockHealth(page: Page, reply: (route: Route) => Promise<void>) {
    const calls = { count: 0 }
    await page.route(
      (url) => url.origin !== 'http://localhost:5173' && url.pathname === '/',
      (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
        calls.count++
        return reply(route)
      },
    )
    return calls
  }

  test('a 200 says the service is reachable', async ({ page }) => {
    const calls = await mockHealth(page, (route) => route.fulfill({ status: 200, json: { status: 'ok' }, headers: { 'access-control-allow-origin': '*' } }))
    await page.goto('/500')
    await expect(page.getByRole('status')).toHaveText('')
    await page.getByRole('button', { name: 'Check service status' }).click()
    await expect(page.getByRole('status')).toHaveText(REACHABLE)
    await expect(page.getByRole('button', { name: 'Check service status' })).toBeEnabled()
    expect(calls.count).toBe(1)
  })

  for (const [name, reply] of [
    ['a 500', (route: Route) => route.fulfill({ status: 500, json: {}, headers: { 'access-control-allow-origin': '*' } })],
    ['an aborted request', (route: Route) => route.abort('failed')],
  ] as const) {
    test(`${name} says it is unreachable and offers Check again, which can then succeed`, async ({ page }) => {
      let healthy = false
      const calls = await mockHealth(page, (route) =>
        healthy ? route.fulfill({ status: 200, json: {}, headers: { 'access-control-allow-origin': '*' } }) : reply(route),
      )
      await page.goto('/500')
      await page.getByRole('button', { name: 'Check service status' }).click()
      await expect(page.getByRole('status')).toHaveText(UNREACHABLE)
      await expect(page.getByRole('button', { name: 'Check service status' })).toHaveCount(0)

      healthy = true
      await page.getByRole('button', { name: 'Check again' }).click()
      await expect(page.getByRole('status')).toHaveText(REACHABLE)
      expect(calls.count).toBe(2)
    })
  }

  test('the button is disabled while checking, so it cannot be double-clicked', async ({ page }) => {
    let open!: () => void
    const held = new Promise<void>((resolve) => (open = resolve))
    const calls = await mockHealth(page, async (route) => {
      await held
      await route.fulfill({ status: 200, json: {}, headers: { 'access-control-allow-origin': '*' } })
    })
    await page.goto('/500')
    await page.getByRole('button', { name: 'Check service status' }).click()

    const checking = page.getByRole('button', { name: 'Checking…' })
    await expect(checking).toBeDisabled()
    await expect(page.getByRole('status')).toHaveText('')
    open()
    await expect(page.getByRole('status')).toHaveText(REACHABLE)
    await expect(page.getByRole('button', { name: 'Check service status' })).toBeEnabled()
    expect(calls.count).toBe(1)
  })
})
