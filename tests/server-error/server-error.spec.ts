import { expect, test } from '@playwright/test'

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
